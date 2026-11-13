// Load the contents of each video's .vtt files into the database (makes them searchable).
// Rebuilds the subtitle tables from the current media folders on every run.
//
//   node updateSubtitles.js
//
// Run after update.js / subtitles.js. Do not run while the server is running.
import fs from "node:fs";
import path from "node:path";
import db from "./db.js";
import config from "./config.js";
import { buildMediaTree } from "./media.js";
import { parseVtt } from "./vttParser.js";

const findMediaId = db.prepare(
  "SELECT id FROM media WHERE path = ? AND file_size = ?",
);
const insertVideo = db.prepare(
  "INSERT OR REPLACE INTO subtitle_videos (media_id, tree_path) VALUES (?, ?)",
);
const insertCue = db.prepare(
  "INSERT INTO subtitle_cues (media_id, start_seconds, text) VALUES (?, ?, ?)",
);

const getVideoNodes = (nodes) =>
  nodes.flatMap((node) => {
    if (node.children) return getVideoNodes(node.children);
    return config.videoTypes.includes(node.ext) ? [node] : [];
  });

// "Name.vtt" and "Name.eng.1.vtt" belong to video "Name.mkv"; "Name2.vtt" does not.
const findVttFiles = (videoPath) => {
  const { dir, name } = path.parse(videoPath);
  return fs
    .readdirSync(dir)
    .filter(
      (file) =>
        file.startsWith(`${name}.`) && file.toLowerCase().endsWith(".vtt"),
    )
    .sort()
    .map((file) => path.join(dir, file));
};

// Cues from all of the video's tracks. Identical lines across tracks are kept once.
const readCues = (videoPath) => {
  const seen = new Set();
  const cues = [];
  for (const vttFile of findVttFiles(videoPath)) {
    for (const cue of parseVtt(fs.readFileSync(vttFile, "utf8"))) {
      const key = `${cue.start}|${cue.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cues.push(cue);
    }
  }
  return cues;
};

let videoCount = 0;
let cueCount = 0;

const processVideo = (video) => {
  const media = findMediaId.get(video.path, video.size);
  if (!media) {
    console.log(`No DB record (skipped): ${video.path}`);
    return;
  }
  const cues = readCues(video.path);
  if (!cues.length) return;

  insertVideo.run(media.id, video.treePath);
  for (const { start, text } of cues) {
    insertCue.run(media.id, start, text);
  }
  videoCount++;
  cueCount += cues.length;
};

const updateSubtitles = db.transaction((videos) => {
  db.exec("DELETE FROM subtitle_cues; DELETE FROM subtitle_videos;");
  for (const video of videos) processVideo(video);
});

const videos = getVideoNodes(await buildMediaTree());

try {
  updateSubtitles(videos);
} catch (err) {
  console.error("Subtitle update failed. No changes were saved.", err);
  process.exit(1);
}

console.log(
  `Subtitles saved: ${cueCount} lines from ${videoCount}/${videos.length} videos.`,
);
