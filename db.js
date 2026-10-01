import Database from "better-sqlite3";

const db = new Database("media.db");

// Store dates with: new Date().toISOString(), ex: 2026-09-30T01:42:15.123Z ,
// Booleans 0 / 1 (ex: watched, favorite)

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
    );

  CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_size INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_media_state (
    user_id INTEGER NOT NULL,
    media_id TEXT NOT NULL,
    position INTEGER DEFAULT 0,
    watched INTEGER DEFAULT 0,
    favorite INTEGER DEFAULT 0,
    last_watched_at TEXT,

    PRIMARY KEY (user_id, media_id),

    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (media_id) REFERENCES media(id)
  );
`);

export default db;
