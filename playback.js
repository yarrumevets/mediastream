import db from "./db.js";

const getProgress = (userId, mediaId) => {
  const row = db
    .prepare(
      "SELECT position FROM user_media_state WHERE user_id = ? AND media_id = ?",
    )
    .get(userId, mediaId);
  return row?.position || 0;
};

const saveProgress = (userId, mediaId, position) => {
  db.prepare(
    `
    INSERT INTO user_media_state (user_id, media_id, position, last_watched_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, media_id) DO UPDATE SET
      position = excluded.position,
      last_watched_at = excluded.last_watched_at
  `,
  ).run(userId, mediaId, position, new Date().toISOString());
};

export { getProgress, saveProgress };
