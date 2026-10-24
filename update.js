// Build the

import fs from "node:fs";
import crypto from "node:crypto";
import db from "./db.js";
import config from "./config.js";
import { buildMediaTree } from "./media.js";

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
};

// ----------------------------------------------------------------------------------------------

const initMedia = async () => {
  console.log("INITIALIZING . . . . . . . . .");
  const start = performance.now();
  mediaTree = await buildMediaTree();
  await syncMediaToDatabase();
  // Show elapsed time.
  const ms = performance.now() - start;
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  console.log(`. . . . . . . . . . . . . FINISHED SCANNING IN ${min}m ${sec}s`);
};

await initMedia();
