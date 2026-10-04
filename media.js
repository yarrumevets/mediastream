import fs from "fs";
import path from "path";
import crypto from "crypto";
import db from "./db.js";
import config from "./config.js";
import secretConfig from "./secret.config.js";

let mediaTree = [];

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
  const files = node.children.map(({ children, ...rest }) => ({
    ...rest,
    children:
      children?.map((c) => {
        return {
          name: c.name,
          treePath: c.treePath,
        };
      }) || [], // we need at least the list of names of direct child files/folders (like, displaying cover pic and other basic info)
  }));
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
  mediaTree = await buildMediaTree();
  // console.dir(mediaTree, { depth: 5 });
  // await syncMediaToDatabase(); // <--------------------- @TODO: Uncomment after dev.
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

export { initMedia, getDirContents, getFilePath, findNodeById };
