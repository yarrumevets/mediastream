import db from "./db.js";
const DB_SAVE_INTERVAL_MS = 10 * 1000;
const WATCHING_NOW_MS = 60 * 1000;
// userId -> Map(mediaId -> entry)
const liveState = new Map();
const newEntry = (treePath, name) => ({
  position: 0,
  paused: false,
  treePath,
  name,
  updatedAt: 0,
  persistedAt: 0,
  controlSeq: 0,
  controlPosition: 0,
  controlClientId: null,
});
const getEntry = (userId, mediaId, treePath, name) => {
  if (!liveState.has(userId)) liveState.set(userId, new Map());
  const userState = liveState.get(userId);
  if (!userState.has(mediaId)) userState.set(mediaId, newEntry(treePath, name));
  // return userState.get(mediaId);
  const entry = userState.get(mediaId);
  if (treePath !== undefined) entry.treePath = treePath;
  if (name !== undefined) entry.name = name;
  return entry;
};
const toPlayerState = (entry) => ({
  position: entry.position,
  paused: entry.paused,
  seq: entry.controlSeq,
  controlPosition: entry.controlPosition,
  controlClientId: entry.controlClientId,
});
// Shared state for a video; falls back to the DB for the position.
const getProgress = (userId, mediaId) => {
  const live = liveState.get(userId)?.get(mediaId);
  if (live) return toPlayerState(live);
  const row = db
    .prepare(
      "SELECT position FROM user_media_state WHERE user_id = ? AND media_id = ?",
    )
    .get(userId, mediaId);
  return { position: row?.position || 0, paused: false, seq: 0 };
};
const persistProgress = (userId, mediaId, position) => {
  db.prepare(
    `
    INSERT INTO user_media_state (user_id, media_id, position, last_watched_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, media_id) DO UPDATE SET
      position = excluded.position,
      last_watched_at = excluded.last_watched_at
  `,
  ).run(userId, mediaId, Math.floor(position), new Date().toISOString());
};
// Heartbeat: records the position and returns the shared player state.
const saveProgress = (userId, mediaId, position, treePath, name) => {
  const entry = getEntry(userId, mediaId, treePath, name);
  const now = Date.now();
  if (now - entry.persistedAt >= DB_SAVE_INTERVAL_MS) {
    persistProgress(userId, mediaId, position);
    entry.persistedAt = now;
  }
  entry.position = position;
  entry.updatedAt = now;
  return toPlayerState(entry);
};
// Play / pause / seek from a client.
const saveControl = (
  userId,
  mediaId,
  { clientId, paused, position },
  treePath,
  name,
) => {
  const entry = getEntry(userId, mediaId, treePath, name);
  Object.assign(entry, {
    paused,
    position,
    controlPosition: position,
    controlClientId: clientId,
    controlSeq: entry.controlSeq + 1,
    updatedAt: Date.now(),
  });
};
// Most recently updated video for this user, or null.
const getLastWatched = (userId) => {
  let last = null;
  for (const [id, entry] of liveState.get(userId) ?? []) {
    if (!last || entry.updatedAt > last.updatedAt) last = { id, ...entry };
  }
  if (!last) return null;
  return {
    id: last.id,
    name: last.name,
    treePath: last.treePath,
    watchingNow: Date.now() - last.updatedAt < WATCHING_NOW_MS,
  };
};
export { getProgress, saveProgress, saveControl, getLastWatched };
