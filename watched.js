import db from "./db.js";

const WATCHED_FRACTION = 0.8;
const MAX_PLAYBACK_RATE = 2; // Fastest playback speed a position jump can be explained by.
const JITTER_SECONDS = 0.5; // Tolerance for heartbeat timing.

// ---------------- Range helpers ----------------
// Ranges are sorted, non-overlapping [start, end] pairs in seconds.

// Adds a range, merging anything it overlaps or touches so replays are never double counted.
const addRange = (ranges, start, end) => {
  const merged = [];
  let [newStart, newEnd] = [start, end];
  for (const [rangeStart, rangeEnd] of ranges) {
    if (rangeEnd < newStart || rangeStart > newEnd) {
      merged.push([rangeStart, rangeEnd]);
    } else {
      newStart = Math.min(newStart, rangeStart);
      newEnd = Math.max(newEnd, rangeEnd);
    }
  }
  merged.push([newStart, newEnd]);
  return merged.sort((a, b) => a[0] - b[0]);
};

const sumRanges = (ranges) =>
  ranges.reduce((total, [start, end]) => total + (end - start), 0);

// A forward move no faster than real playback was played. Anything larger was a seek.
const isPlayedSegment = (fromPosition, toPosition, elapsedMs) => {
  const delta = toPosition - fromPosition;
  if (!Number.isFinite(delta) || delta <= 0) return false;
  const maxPlayed = (elapsedMs / 1000) * MAX_PLAYBACK_RATE + JITTER_SECONDS;
  return delta <= maxPlayed;
};

// ---------------- DB ----------------

// Load (or start) the watch session for a user's video.
const loadWatchSession = (userId, mediaId, duration) => {
  const row = db
    .prepare(
      "SELECT watched, watched_ranges FROM user_media_state WHERE user_id = ? AND media_id = ?",
    )
    .get(userId, mediaId);
  return {
    userId,
    mediaId,
    duration,
    ranges: JSON.parse(row?.watched_ranges ?? "[]"),
    watched: Boolean(row?.watched),
    dirty: false,
  };
};

// Never throws. A failed write stays dirty and is retried by the next persist.
const persistWatchSession = (session) => {
  if (!session.dirty) return;
  try {
    db.prepare(
      `
      INSERT INTO user_media_state (user_id, media_id, watched, watched_ranges, last_watched_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, media_id) DO UPDATE SET
        watched = excluded.watched,
        watched_ranges = excluded.watched_ranges
    `,
    ).run(
      session.userId,
      session.mediaId,
      session.watched ? 1 : 0,
      JSON.stringify(session.ranges),
      new Date().toISOString(),
    );
    session.dirty = false;
  } catch (err) {
    console.error("Failed to persist watch progress:", {
      userId: session.userId,
      mediaId: session.mediaId,
      error: err.message,
    });
  }
};

const getWatchedMediaIds = (userId) =>
  db
    .prepare(
      "SELECT media_id FROM user_media_state WHERE user_id = ? AND watched = 1",
    )
    .all(userId)
    .map((row) => row.media_id);

// ---------------- Tracking ----------------

// Record playback between two heartbeat positions. Persists immediately once watched.
const recordPlayback = (session, fromPosition, toPosition, elapsedMs) => {
  if (session.watched) return;
  if (!session.duration) return;
  if (!isPlayedSegment(fromPosition, toPosition, elapsedMs)) return;

  const end = Math.min(toPosition, session.duration);
  if (end <= fromPosition) return;

  session.ranges = addRange(session.ranges, fromPosition, end);
  session.dirty = true;

  const playedEnough =
    sumRanges(session.ranges) >= session.duration * WATCHED_FRACTION;
  if (playedEnough) {
    session.watched = true;
    persistWatchSession(session);
  }
};

export {
  loadWatchSession,
  recordPlayback,
  persistWatchSession,
  getWatchedMediaIds,
};
