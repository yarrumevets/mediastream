import fs from "fs";
import path from "path";
import config from "./config.js";
import secretConfig from "./secret.config.js";
import crypto from "crypto";

const buildDirectoryTree = async (dir, parentTreePath) => {
  const results = [];
  const items = await fs.promises.readdir(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stats = fs.statSync(fullPath);
    const isDir = stats.isDirectory();
    const ext = isDir ? null : path.extname(item).slice(1); // remove the '.'
    if (isDir || config.validFileTypes.includes(ext)) {
      // Note: for files like ".env", the "env" is the name and the extension is empty.
      // leading '.' are explicitely ignored.
      const treePath = `${parentTreePath}/${item}`;
      const fileData = {
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
  const mediaTree = [];
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
    mediaTree.push(newDir);
  }
  return mediaTree;
};

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
// Walks the media tree once, computing an ID for every file.
// Returns files with a unique ID, and groups of files sharing an ID.
const scanMediaFiles = async (mediaTree) => {
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

export { buildMediaTree, scanMediaFiles };
