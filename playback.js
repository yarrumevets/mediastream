import db from "./db.js";

const DB_SAVE_INTERVAL_MS = 10_000;
const WATCHING_NOW_MS = 60_000; // 1 minutes or less since last heartbeat = watching.

// One active playback state per user.
const activePlaybackState = new Map();

// ---------------- DB Helper Functions ----------------

// Retrieve a video's saved position.
const getPersistedProgress = (userId, mediaId) => {
  const row = db
    .prepare(
      "SELECT position FROM user_media_state WHERE user_id = ? AND media_id = ?",
    )
    .get(userId, mediaId);
  return row?.position ?? 0;
};

// Persist a video's position to SQLite.
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

// ---------------- State Helper Functions ----------------

// Create a playback state
const newPlaybackState = (mediaId, treePath, name, position) => ({
  mediaId,
  treePath,
  name,
  position,
  paused: false,
  updatedAt: 0,
  persistedAt: 0,
  controlSeq: 0,
  controlPosition: 0,
  controlClientId: null,
});

// Explicitly select a video, creating its state if necessary.
const selectVideo = (userId, mediaId, treePath, name) => {
  let state = activePlaybackState.get(userId);
  if (!state || state.mediaId !== mediaId) {
    // video has changed.
    const position = getPersistedProgress(userId, mediaId);
    state = newPlaybackState(mediaId, treePath, name, position);
    state.controlSeq = activePlaybackState.get(userId)?.controlSeq + 1 || 0;
    activePlaybackState.set(userId, state);
  }
  state.treePath = treePath;
  state.name = name;
  return state;
};

// Retrieve existing state without modifying it.
const getPlaybackState = (userId, mediaId) => {
  const state = activePlaybackState.get(userId);
  return state?.mediaId === mediaId ? state : null;
};

// Return only the fields needed by the video player.
const toPlayerState = (state) => ({
  position: state.position,
  paused: state.paused,
  seq: state.controlSeq,
  controlPosition: state.controlPosition ?? null,
  controlClientId: state.controlClientId ?? null,
});

// ---------------- DB PERSISTANCE ----------------

// Get the current playback state or the saved position from SQLite.
const getProgress = (userId, mediaId) => {
  const state = activePlaybackState.get(userId);
  if (state?.mediaId === mediaId) {
    return toPlayerState(state);
  }
  return toPlayerState({
    position: getPersistedProgress(userId, mediaId),
    paused: false,
    controlSeq: 0,
  });
};

// ----------------------- STATE ------------------

const persistProgressRateLimited = (userId, mediaId, position, state) => {
  const now = Date.now();
  if (now - state.persistedAt >= DB_SAVE_INTERVAL_MS) {
    persistProgress(userId, mediaId, position);
    state.persistedAt = now;
  }
};

// 💗 Heartbeat: update in-memory position and periodically persist it.
const saveProgress = (userId, mediaId, position, controlSeq) => {
  const state = activePlaybackState.get(userId);
  if (!state) return null; // No active state for this user to update.
  const now = Date.now();
  if (state.mediaId === mediaId && controlSeq === state.controlSeq) {
    // Only update the same video's state, and only when the controlSeq is not stale.
    // Heartbeats must prove they've received the most recent control before they can update progress.
    persistProgressRateLimited(userId, mediaId, position, state);
    state.position = position;
    state.updatedAt = now;
  }
  return {
    ...toPlayerState(state),
    mediaId: state.mediaId,
    treePath: state.treePath,
    name: state.name,
  };
};

// Updates in-memory state with control commands: play, pause, or seek command.
const updatePlaybackControl = (
  userId,
  mediaId,
  { clientId, paused, position },
) => {
  const state = getPlaybackState(userId, mediaId);
  if (!state) return null; // video might have switched and this update is stale now.
  Object.assign(state, {
    paused,
    position,
    controlPosition: position,
    controlClientId: clientId,
    controlSeq: state.controlSeq + 1,
    updatedAt: Date.now(),
  });
  return state.controlSeq; // Only the init function in video.html needs this returned.
};

// Returns the CURRENT video being watched.
const getCurrentVideo = (userId) => {
  const state = activePlaybackState.get(userId);
  // If no video in the in-mem state for this user at all.
  if (!state) return null;
  // If there has been no update (heartbeat) in a while.
  if (Date.now() - state.updatedAt > WATCHING_NOW_MS) return null;
  return {
    mediaId: state.mediaId,
    name: state.name,
    treePath: state.treePath,
  };
};

export {
  getProgress,
  saveProgress,
  updatePlaybackControl,
  getCurrentVideo,
  selectVideo,
};

/* @TODO:
    - explicit save on seek
*/
