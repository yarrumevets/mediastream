import express from "express";
import cookieParser from "cookie-parser";
import secretConfig from "./secret.config.js";
import {
  createUser,
  authenticateUser,
  requireAuth,
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_OPTIONS,
} from "./auth.js";
import { initMedia, getDirContents, getFilePath } from "./media.js";
import { getProgress, saveProgress } from "./playback.js";

await initMedia(); // @TODO - refactor - this is probably a useless function and should just be moved here so the server can dictate which init calls are made.

const app = express();
app.use(express.json());
app.use(cookieParser(secretConfig.cookieSecret));

// -------------------------------[ AUTH ]----------------------------------//

app.post("/signup", (req, res) => {
  const { username, password } = req.body;
  createUser(username, password);
  res.json({ ok: true });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const user = authenticateUser(username, password);
  if (!user) return res.sendStatus(401);
  res.cookie(AUTH_COOKIE_NAME, String(user.id), AUTH_COOKIE_OPTIONS);
  res.json({ ok: true });
});

app.use(requireAuth); // everything after this line requires authentication...

app.post("/logout", (req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME);
  res.json({ ok: true });
});

// serve static files
app.use(express.static("public"));

// -------------------------------[ MEDIA ]----------------------------------//

app.get("/dirtree", (req, res) => {
  res.json(getDirContents(req.query.path));
});

app.get("/file", (req, res) => {
  const filePath = getFilePath(req.query.path);
  if (!filePath) return res.json({ msg: "File not found." });
  res.sendFile(filePath);
});

// -------------------------------[ PLAYBACK ]----------------------------------//

app.get("/progress", (req, res) => {
  res.json({ position: getProgress(req.userId, req.query.id) });
});

app.post("/progress", (req, res) => {
  saveProgress(req.userId, req.body.id, req.body.position);
  res.json({ ok: true });
});

app.listen(secretConfig.port, () => {
  console.log(`Server running on http://localhost:${secretConfig.port}`);
});
