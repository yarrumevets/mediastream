// Build the database with the current config directories.

/*
    Remove the current media data and metadata while preserving user accounts:

    sqlite3 media.db "DELETE FROM media_info; DELETE FROM user_media_state; DELETE FROM media;"
    node update.js
    node server.js

    Current issue:
    - Changing (resizing) a video at the same location makes a new record, leaving the old. Can cause wrong ID lookups.
    - Deleted videos' records remain indefinitely.

    Notes:
    - Do not run while server is running.
*/

import fs from "node:fs";
import crypto from "node:crypto";
import db from "./db.js";
import config from "./config.js";
import { buildMediaTree } from "./media.js";

// Gather technical metadata about the video file.
import { probeVideo } from "./probe.js";

let mediaTree = [];

// Create an ID for a media file. . . 🐌
const HASH_BYTE_LIMIT = 10 * 1024 * 1024; // first 10MB
const computeMediaId = async (filePath, fileSize) => {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath, {
    start: 0,
    end: HASH_BYTE_LIMIT - 1,
  });
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  hash.update(String(fileSize));
  return hash.digest("hex");
};

// --- scan media files --- //

// Collect all video nodes from the in-memory media tree.
const getVideoFiles = (nodes) => {
  const videos = [];
  const walk = (items) => {
    for (const node of items) {
      if (node.children) {
        walk(node.children);
      } else if (config.videoTypes.includes(node.ext)) {
        videos.push(node);
      }
    }
  };
  walk(nodes);
  return videos;
};

// Generate IDs and collect file details for each video.
const identifyVideos = async (videos) => {
  const files = [];
  const findExisting = db.prepare(
    "SELECT id FROM media WHERE path = ? AND file_size = ?",
  );
  for (const video of videos) {
    console.log(`Processing: ${video.path}`);
    const existing = findExisting.get(video.path, video.size);
    const id = existing?.id ?? (await computeMediaId(video.path, video.size));
    files.push({
      id,
      path: video.path,
      filename: video.name,
      fileSize: video.size,
    });
  }
  return files;
};

// Separate unique videos from duplicates using their IDs.
const separateDuplicates = (files) => {
  const filesById = new Map();
  for (const file of files) {
    if (!filesById.has(file.id)) {
      filesById.set(file.id, []);
    }
    filesById.get(file.id).push(file);
  }
  const uniqueFiles = [];
  const duplicateGroups = [];
  for (const group of filesById.values()) {
    if (group.length === 1) {
      uniqueFiles.push(group[0]);
    } else {
      duplicateGroups.push(group);
    }
  }
  return { uniqueFiles, duplicateGroups };
};

// Coordinate video collection, identification, and duplicate detection.
const scanMediaFiles = async () => {
  const videos = getVideoFiles(mediaTree);
  const files = await identifyVideos(videos);
  return separateDuplicates(files);
};

// ------------------------------------------------

// Log duplicate files that will be skipped.
const reportDuplicates = (duplicateGroups) => {
  for (const group of duplicateGroups) {
    console.log(`Duplicate media found (skipped), ID: ${group[0].id}`);
    for (const file of group) {
      console.log(`  ${file.filename} - ${file.path}`);
    }
  }
};

// Insert or update unique media records in SQLite.
const upsertMedia = (uniqueFiles) => {
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
};

// Scan media, report duplicates, and update the database.
const syncMediaToDatabase = async () => {
  const { uniqueFiles, duplicateGroups } = await scanMediaFiles();
  reportDuplicates(duplicateGroups);
  upsertMedia(uniqueFiles);
  console.log(`Media sync complete: ${uniqueFiles.length} files upserted.`);
  await syncMediaInfo(uniqueFiles);
};

// ----------------------------------------------------------------------------------------------

const initMedia = async () => {
  console.log("INITIALIZING . . . . . . . . .");
  const start = performance.now();
  mediaTree = await buildMediaTree();
  console.log("Built tree...");
  await syncMediaToDatabase();
  // Show elapsed time.
  const ms = performance.now() - start;
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  console.log(
    `. . . . . . . . . . . . . . . . . . FINISHED SCANNING IN ${min}m ${sec}s`,
  );
};

// ------------------------------[ media info ]------------------------------
// Probe and save media info for videos that don't have it yet.
const syncMediaInfo = async (files) => {
  const hasInfo = db.prepare("SELECT 1 FROM media_info WHERE media_id = ?");
  const insert = db.prepare(`
     INSERT OR REPLACE INTO media_info
       (media_id, container, duration, video_codec, video_profile, video_level, width, height, audio_codec)
     VALUES
       (@mediaId, @container, @duration, @videoCodec, @videoProfile, @videoLevel, @width, @height, @audioCodec)
   `);

  const unprobedFiles = files.filter((file) => !hasInfo.get(file.id));
  let probedCount = 0;
  for (const file of unprobedFiles) {
    try {
      const info = await probeVideo(file.path);
      insert.run({ mediaId: file.id, ...info });
      probedCount++;
    } catch (err) {
      console.error(`Failed to probe (skipped): ${file.path}`, err.message);
    }
  }
  console.log(
    `Media info complete: ${probedCount}/${unprobedFiles.length} files probed.`,
  );
};

await initMedia();
