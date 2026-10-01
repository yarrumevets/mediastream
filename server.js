import {
  buildMediaTree,
  scanMediaFiles,
  hashPassword,
  verifyPassword,
} from "./utilities.js";
import secretConfig from "./secret.config.js";
import express from "express";
import db from "./db.js";
import cookieParser from "cookie-parser";

let mediaTree = [];
const init = async () => {
  mediaTree = await buildMediaTree(mediaTree);
  // console.dir(mediaTree, { depth: 5 });
  // await syncMediaToDatabase(); // <--------------------- @TODO: Uncomment after dev.
};
init();

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

const app = express();
app.use(express.json());
app.use(cookieParser(secretConfig.cookieSecret));

// Middleware
// -------------------------------[ AUTH ]----------------------------------//

app.post("/signup", (req, res) => {
  const { username, password } = req.body;
  db.prepare("INSERT INTO users (name, password_hash) VALUES (?, ?)").run(
    username,
    hashPassword(password),
  );
  res.json({ ok: true });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE name = ?").get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.sendStatus(401);
  }
  res.cookie("userId", String(user.id), {
    signed: true,
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
  });
  res.json({ ok: true });
});

// Protected exclusion list (public pages and assets)
const publicPaths = ["/login.html", "/styles.css"];
const requireAuth = (req, res, next) => {
  if (publicPaths.includes(req.path)) return next();

  const userId = req.signedCookies.userId;

  if (!userId) {
    return req.path === "/" || req.path.endsWith(".html")
      ? res.redirect("/login.html")
      : res.sendStatus(401);
  }
  req.userId = Number(userId);
  next();
};

app.use(requireAuth); // everything after this line requires authentication...

app.post("/logout", (req, res) => {
  res.clearCookie("userId");
  res.json({ ok: true });
});

// -------------------------------[ API ]----------------------------------//

// serve static files
app.use(express.static("public"));

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

// ----- Playback progress -----
app.get("/progress", (req, res) => {
  const row = db
    .prepare(
      "SELECT position FROM user_media_state WHERE user_id = ? AND media_id = ?",
    )
    .get(req.userId, req.query.id);
  res.json({ position: row?.position || 0 });
});
app.post("/progress", (req, res) => {
  db.prepare(
    `
    INSERT INTO user_media_state (user_id, media_id, position, last_watched_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, media_id) DO UPDATE SET
      position = excluded.position,
      last_watched_at = excluded.last_watched_at
  `,
  ).run(req.userId, req.body.id, req.body.position, new Date().toISOString());
  res.json({ ok: true });
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
