import fs from "fs";
import path from "path";
import config from "./config.js";
import secretConfig from "./secret.config.js";

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

export { buildMediaTree };
