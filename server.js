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
import {
  initMedia,
  getDirContents,
  getFilePath,
  getNextVideo,
} from "./media.js";
import {
  getCurrentVideo,
  getProgress,
  saveProgress,
  updatePlaybackControl,
  selectVideo,
  startPlaybackPersistence,
} from "./playback.js";
import { streamVideo } from "./stream.js";
import { markFavorites, getFavoriteFolders, setFavorite } from "./favorites.js";

await initMedia(); // @TODO - refactor - this is probably a useless function and should just be moved here so the server can dictate which init calls are made.
startPlaybackPersistence();

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
  const contents = getDirContents(req.query.path);
  res.json({ ...contents, files: markFavorites(req.userId, contents.files) });
});

app.get("/file", (req, res) => {
  const filePath = getFilePath(req.query.path);
  if (!filePath) return res.json({ msg: "File not found." });
  res.sendFile(filePath);
});

app.get("/stream", streamVideo);

app.get("/next-video", (req, res) => {
  res.json({ video: getNextVideo(req.query.path) });
});

// -------------------------------[ PLAYBACK ]----------------------------------//

app.post("/select-video", (req, res) => {
  const { mediaId, path, name } = req.body;
  selectVideo(req.userId, mediaId, path, name);
  res.json({ ok: true });
});

app.get("/progress", (req, res) => {
  res.json(getProgress(req.userId, req.query.mediaId));
});

// 💗 Heartbeat
app.post("/progress", (req, res) => {
  const { mediaId, position, controlSeq } = req.body;
  res.json(saveProgress(req.userId, mediaId, position, controlSeq));
});

app.post("/control", (req, res) => {
  const { mediaId, clientId, paused, position } = req.body;
  const controlSeq = updatePlaybackControl(req.userId, mediaId, {
    clientId,
    paused,
    position,
  });
  const updateSuccess = controlSeq !== null;
  res.status(updateSuccess ? 200 : 409).json({ ok: updateSuccess, controlSeq });
});

app.listen(secretConfig.port, () => {
  console.log(`Server running on http://localhost:${secretConfig.port}`);
});

app.get("/current-video", (req, res) => {
  const currentVideo = getCurrentVideo(req.userId);
  res.json({ video: currentVideo });
});

// -------------------------------[ FAVORITES ]----------------------------------//

app.get("/favorites", (req, res) => {
  res.json({ folders: getFavoriteFolders(req.userId) });
});

app.put("/favorites", (req, res) => {
  const { path, favorite } = req.body;
  if (typeof path !== "string" || typeof favorite !== "boolean") {
    return res.status(400).json({ ok: false });
  }
  const saved = setFavorite(req.userId, path, favorite);
  res.status(saved ? 200 : 404).json({ ok: saved });
});
