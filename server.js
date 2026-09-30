import { buildMediaTree, scanMediaFiles } from "./utilities.js";
import secretConfig from "./secret.config.js";
import express from "express";
import db from "./db.js";

let mediaTree = [];
const init = async () => {
  mediaTree = await buildMediaTree(mediaTree);
  // console.dir(mediaTree, { depth: 5 });

  checkDatabaseIsConnected(); // remove me.

  await syncMediaToDatabase();
};
init();

// ---------------- db stuff ---------------

const checkDatabaseIsConnected = () => {
  // Some misc. code to prove the db is connecting...
  const result = db.prepare("SELECT sqlite_version() AS version").get();
  console.log("SQLite connected:", result.version);
};

const syncMediaToDatabase = async () => {
  const { uniqueFiles, duplicateGroups } = await scanMediaFiles(mediaTree);

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

// --------------- Server ---------------------
const app = express();

// serve static files
app.use(express.static("public"));

// API
app.get("/dirtree", async (req, res) => {
  // Give the high-level psuedo folders if no path provided.
  if (!req.query.path) {
    return res.json({
      files: mediaTree.map(({ children, ...rest }) => rest),
      parent: null,
    });
  }

  // All other nested files/folders
  let files = [];
  const parts = req.query.path.split("/").filter(Boolean);
  console.log("parts: ", parts);
  let current = { children: mediaTree };
  for (const part of parts) {
    current = current.children?.find((c) => c.name === part);
    if (!current || !current.children) {
      console.error("Path part not found or empty: ", part);
      return res.json({ files: [], parent: null, error: true });
    }
  }
  const parent = parts.length > 1 ? parts.slice(0, -1).join("/") : null;
  // files = current.children.map(({ children, ...rest }) => rest); // no children, not sending what is in each folder
  files = current.children.map(({ children, ...rest }) => ({
    ...rest,
    children:
      children?.map((c) => {
        return {
          name: c.name,
          treePath: c.treePath,
        };
      }) || [], // we need at least the list of names of direct child files/folders (like, displaying cover pic and other basic info)
  }));
  res.json({ files, parent });
});

// Files
app.get("/file", async (req, res) => {
  const parts = req.query.path.split("/").filter(Boolean);
  let current = { children: mediaTree };
  for (const part of parts) {
    current = current.children?.find((c) => c.name === part);
    if (!current) {
      console.error("Path part not found or empty: ", part);
      return res.json({ msg: "File not found." });
    }
  }
  res.sendFile(current.path);
});

app.listen(secretConfig.port, () => {
  console.log(`Server running on http://localhost:${secretConfig.port}`);
});
