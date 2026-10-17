import fs from "fs";
import path from "path";
import crypto from "crypto";
import db from "./db.js";
import config from "./config.js";
import secretConfig from "./secret.config.js";
// for getting duration
import { execFileSync } from "node:child_process";

let mediaTree = [];
let orderedVideos = []; // Every playable video in the tree, in playback order.

// A file/folder as sent to the client. Direct children are reduced to name + tree path,
// which is enough for things like the cover pic.
const toListingEntry = ({ children, ...rest }) => ({
  ...rest,
  children: children?.map(({ name, treePath }) => ({ name, treePath })) || [],
});

// -----------------------[ for favorites ]---------------------------

// A title folder is a folder directly inside a section (one show, one movie, etc.).
const isTitleFolder = (node) =>
  Boolean(node?.isDir) && splitTreePath(node.treePath).length === 2;
// Returns the listing entry for a title folder's tree path, or null if it isn't one.
const getTitleFolder = (treePath) => {
  const node = findNode(treePath);
  return isTitleFolder(node) ? toListingEntry(node) : null;
};

// -------------------------------[ TREE BUILDING ]----------------------------------//
const buildDirectoryTree = async (dir, parentTreePath) => {
  const results = [];
  const items = await fs.promises.readdir(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stats = fs.statSync(fullPath);
    const isDir = stats.isDirectory();
    const ext = isDir ? null : path.extname(item).slice(1); // remove the '.'

    const media = !isDir
      ? db.prepare("SELECT id FROM media WHERE path = ?").get(fullPath)
      : null;

    if (isDir || config.validFileTypes.includes(ext)) {
      // Note: for files like ".env", the "env" is the name and the extension is empty.
      // leading '.' are explicitely ignored.
      const treePath = `${parentTreePath}/${item}`;
      const fileData = {
        id: media?.id,
        name: item,
        ext,
        isDir,
        path: fullPath,
        treePath,
        size: isDir ? null : stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
      };
      if (isDir) {
        const children = await buildDirectoryTree(fullPath, treePath);
        fileData.children = children;
      }
      results.push(fileData);
    }
  }
  return results;
};

const buildMediaTree = async () => {
  const tree = [];
  for (const section of secretConfig.sections) {
    const newDir = {
      name: section.name,
      displayName: section.displayName,
      treePath: section.name,
    };
    let children = [];
    // Each section can have multiple roots.
    for (const root of section.roots) {
      const dTree = await buildDirectoryTree(root, section.name);
      children = [...children, ...dTree];
    }
    newDir.children = children;
    tree.push(newDir);
  }
  return tree;
};

// -------------------------------[ DATABASE SYNC ]----------------------------------//

const HASH_BYTE_LIMIT = 10 * 1024 * 1024; // first 10MB

const computeMediaId = async (filePath, fileSize) => {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath, {
    start: 0,
    end: HASH_BYTE_LIMIT - 1,
  });
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  hash.update(String(fileSize));
  return hash.digest("hex");
};

const splitTreePath = (treePath) => treePath.split("/").filter(Boolean);
// Returns the tree node at the given tree path, or null if not found.
const findNode = (treePath) => {
  let current = { children: mediaTree };
  for (const part of splitTreePath(treePath)) {
    current = current.children?.find((c) => c.name === part);
    if (!current) {
      console.error("Path part not found or empty: ", part);
      return null;
    }
  }
  return current;
};

// Returns { files, parent } for a folder's tree path (root sections if no path).
const getDirContents = (treePath) => {
  // Give the high-level psuedo folders if no path provided.
  if (!treePath) {
    return {
      files: mediaTree.map(({ children, ...rest }) => rest),
      parent: null,
    };
  }

  // All other nested files/folders
  const parts = splitTreePath(treePath);
  console.log("parts: ", parts);
  const node = findNode(treePath);
  if (!node?.children) {
    return { files: [], parent: null, error: true };
  }

  const parent = parts.length > 1 ? parts.slice(0, -1).join("/") : null;
  const files = node.children.map(toListingEntry);
  return { files, parent };
};

// Returns the absolute disk path for a file's tree path, or null if not found.
const getFilePath = (treePath) => findNode(treePath)?.path ?? null;

// Walks the media tree once, computing an ID for every file.
// Returns files with a unique ID, and groups of files sharing an ID.
const scanMediaFiles = async () => {
  const filesById = new Map();
  const walk = async (nodes) => {
    for (const node of nodes) {
      console.log("node: ", node);
      if (node.children) {
        await walk(node.children);
        continue;
      }

      if (!config.videoTypes.includes(node.ext)) {
        continue;
      }
      const id = await computeMediaId(node.path, node.size);
      const file = {
        id,
        path: node.path,
        filename: node.name,
        fileSize: node.size,
      };
      if (!filesById.has(id)) {
        filesById.set(id, []);
      }
      filesById.get(id).push(file);
    }
  };
  await walk(mediaTree);

  const uniqueFiles = [];
  const duplicateGroups = [];
  for (const files of filesById.values()) {
    if (files.length === 1) {
      uniqueFiles.push(files[0]);
    } else {
      duplicateGroups.push(files);
    }
  }
  return { uniqueFiles, duplicateGroups };
};

const syncMediaToDatabase = async () => {
  const { uniqueFiles, duplicateGroups } = await scanMediaFiles();

  for (const group of duplicateGroups) {
    console.log(`Duplicate media found (skipped), ID: ${group[0].id}`);
    for (const file of group) {
      console.log(`  ${file.filename} - ${file.path}`);
    }
  }

  const upsert = db.prepare(`
    INSERT INTO media (id, path, filename, file_size)
    VALUES (@id, @path, @filename, @fileSize)
    ON CONFLICT(id) DO UPDATE SET
      path = excluded.path,
      filename = excluded.filename
  `);
  const upsertAll = db.transaction((files) => {
    for (const file of files) {
      upsert.run(file);
    }
  });
  upsertAll(uniqueFiles);

  console.log(`Media sync complete: ${uniqueFiles.length} files upserted.`);
};

const initMedia = async () => {
  // @TODO: Either create another script just for the scan to run before running the server, OR, have the in-mem tree updated with the ID
  // while the DB is being updated. Right now, the tree must be built, then the scan, then the tree rebuilt again. This works, but is messy.

  // Just run the server with the current DB setup.
  mediaTree = await buildMediaTree();

  // ! ONLY UNCOMMENT THESE 2 LINES IF: Media folders are changed, newly added files, etc. It rebuilds the DB.
  // Scan all folders from the config, rebuild the database files, and re-build the in-mem structure so the IDs are included.
  // Note: this is currently additive, so it doesn't remove old entries, just adds new ones OR updates existing intries with the exact same video (hash & size)
  // await syncMediaToDatabase();
  // mediaTree = await buildMediaTree();

  orderedVideos = listVideosInOrder(mediaTree);
};

// -------------------------------[ TREE LOOKUPS ]----------------------------------//

// Returns the tree node for a media ID, or null if not found.
const findNodeById = (id, nodes = mediaTree) => {
  for (const node of nodes) {
    if (node.children) {
      const found = findNodeById(id, node.children);
      if (found) return found;
    } else if (node.id === id) {
      return node;
    }
  }
  return null;
};

// -------------------------------[ PLAYBACK ORDER ]----------------------------------//
// Compares names with numbers treated as numbers: "e9" < "e10" < "e101".
const naturalOrder = new Intl.Collator(undefined, { numeric: true });
// A video the player can open and track progress for.
const isPlayableVideo = (node) =>
  config.videoTypes.includes(node.ext) && Boolean(node.id);
// Lists every playable video depth-first, with each folder's contents in natural
// name order. This is the same as ordering the videos by tree path.
const listVideosInOrder = (nodes) =>
  [...nodes]
    .sort((a, b) => naturalOrder.compare(a.name, b.name))
    .flatMap((node) => {
      if (node.children) return listVideosInOrder(node.children);
      return isPlayableVideo(node) ? [node] : [];
    });
// Returns the video that follows the given tree path, wrapping from the last video
// back to the first. Returns null if the path is not a playable video.
const getNextVideo = (treePath) => {
  const index = treePath ? orderedVideos.indexOf(findNode(treePath)) : -1;
  if (index === -1) return null;
  const next = orderedVideos[(index + 1) % orderedVideos.length];
  return { mediaId: next.id, name: next.name, treePath: next.treePath };
};

// --------------------------[get video duration]------------------------------

const videoDurationCache = new Map();
const getVideoDuration = (treePath) => {
  const cachedDuration = videoDurationCache.get(treePath);
  if (cachedDuration) return cachedDuration;
  const output = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      getFilePath(treePath),
    ],
    { encoding: "utf8" },
  );
  const duration = parseFloat(output);
  console.log(treePath, " - duration: ", duration);
  videoDurationCache.set(treePath, duration);
  return duration;
};

export {
  initMedia,
  getDirContents,
  getFilePath,
  findNodeById,
  getNextVideo,
  getVideoDuration,
  isTitleFolder,
  getTitleFolder,
};
