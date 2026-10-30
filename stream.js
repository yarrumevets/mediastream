import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getFilePath, getVideoDuration } from "./media.js";

const resolution = 480; // 720, 480, etc.

// --------------------------------------------------

const SEGMENT_SECONDS = 6;
const cache = new Map();
// const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "mediastream-"));
const cacheDir = "/Volumes/Expansion1/mediastream-cache";
fs.mkdirSync(cacheDir, { recursive: true });

// --------------------------- removing cache (must come after fs.mkdirsync(...) ) ---------------

const CACHE_DIR_PREFIX = "video-";
// Deletes a cache directory. Logs failures instead of throwing, so cleanup can't crash the server.
const removeCacheDir = (dir) => {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
  } catch (err) {
    console.error(`Failed to delete cache: ${dir}`, err.message);
    return false;
  }
};
// Caches from a previous run (e.g. after a crash) are never reused, so remove them on startup.
const removeOrphanedCaches = () => {
  const orphans = fs
    .readdirSync(cacheDir)
    .filter((name) => name.startsWith(CACHE_DIR_PREFIX));
  const removedCount = orphans.filter((name) =>
    removeCacheDir(path.join(cacheDir, name)),
  ).length;
  console.log(`Deleted ${removedCount} orphaned cache(s) from a previous run.`);
};
removeOrphanedCaches();
// Deletes the cache of every video not in keepTreePaths.
export const clearStreamCache = (keepTreePaths) => {
  const keep = new Set(keepTreePaths);
  for (const [filePath, { treePath, dir }] of cache) {
    if (keep.has(treePath)) continue;
    cache.delete(filePath);
    if (removeCacheDir(dir)) {
      console.log(`Deleted cache: ${treePath} (${path.basename(dir)})`);
    }
  }
};

// --------------------------------------------

const transcodeSegment = (filePath, index, duration, dir) => {
  const target = path.join(dir, `${index}.ts`);
  if (fs.existsSync(target)) return Promise.resolve(target);

  const temporary = `${target}.part`;
  const start = index * SEGMENT_SECONDS;
  const length = Math.min(SEGMENT_SECONDS, duration - start);

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(start),
      "-i",
      filePath,
      "-t",
      String(length),
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-profile:v",
      "main",
      "-pix_fmt",
      "yuv420p",
      "-vf",
      `scale=-2:${resolution}`,
      "-force_key_frames",
      "0",
      "-c:a",
      "aac",
      "-ac",
      "2",
      "-ar",
      "48000",
      "-f",
      "mpegts",
      "-y",
      temporary,
    ]);

    let error = "";

    ffmpeg.stderr.on("data", (data) => {
      error += data.toString();
    });

    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      try {
        if (code !== 0) {
          fs.rmSync(temporary, { force: true });
          throw new Error(error || `FFmpeg exited: ${code}`);
        }
        fs.renameSync(temporary, target); // Throws if the cache dir was deleted mid-transcode.
        resolve(target);
      } catch (err) {
        reject(err);
      }
    });
  });
};

export const streamVideo = async (req, res) => {
  const treePath = req.query.path;
  if (typeof treePath !== "string") return res.sendStatus(400);

  const filePath = getFilePath(treePath);
  if (!filePath) return res.sendStatus(404);

  try {
    if (!cache.has(filePath)) {
      const duration = getVideoDuration(treePath);
      const dir = fs.mkdtempSync(path.join(cacheDir, CACHE_DIR_PREFIX));

      cache.set(filePath, {
        treePath,
        duration,
        dir,
        segments: new Map(),
      });
    }

    const state = cache.get(filePath);
    const { duration, dir, segments } = state;
    const count = Math.ceil(duration / SEGMENT_SECONDS);

    if (req.query.segment === undefined) {
      const playlist = [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        `#EXT-X-TARGETDURATION:${SEGMENT_SECONDS}`,
        "#EXT-X-PLAYLIST-TYPE:VOD",
        "#EXT-X-MEDIA-SEQUENCE:0",
      ];

      for (let i = 0; i < count; i++) {
        const length = Math.min(
          SEGMENT_SECONDS,
          duration - i * SEGMENT_SECONDS,
        );

        // Each segment is independently transcoded.
        if (i > 0) playlist.push("#EXT-X-DISCONTINUITY");

        playlist.push(
          `#EXTINF:${length.toFixed(3)},`,
          `/stream?path=${encodeURIComponent(treePath)}&segment=${i}`,
        );
      }

      playlist.push("#EXT-X-ENDLIST");

      return res
        .type("application/vnd.apple.mpegurl")
        .send(playlist.join("\n"));
    }

    const index = Number(req.query.segment);

    if (!Number.isInteger(index) || index < 0 || index >= count) {
      return res.sendStatus(400);
    }

    if (!segments.has(index)) {
      const job = transcodeSegment(filePath, index, duration, dir);
      segments.set(index, job);
      job.catch(() => segments.delete(index));
    }

    const target = await segments.get(index);
    return res.type("video/mp2t").sendFile(target);
  } catch (err) {
    console.error("Stream error:", err);
    if (!res.headersSent) res.sendStatus(500);
  }
};
