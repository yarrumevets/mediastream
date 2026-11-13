import fs from "fs";
import path from "path";
import { execFileSync } from "node:child_process";
import db from "./db.js";
import config from "./config.js";

// ------------------------------[ LOGGING ]------------------------------ //
const LOG_FILE = "subtitles.log";
fs.writeFileSync(LOG_FILE, "");

const log = (message) => {
  fs.appendFileSync(LOG_FILE, `${message}\n`);
};

const logError = (message) => {
  console.error(message);
  log(message);
};

// ------------------------------[ TIMING ]------------------------------ //
let subtitleCount = 0;
let subtitleTotalSeconds = 0;

const recordSubtitleTime = (seconds) => {
  subtitleCount++;
  subtitleTotalSeconds += seconds;

  if (subtitleCount % 100 === 0) {
    console.log(
      `${subtitleCount} subtitles converted. Average: ${(subtitleTotalSeconds / subtitleCount).toFixed(2)}s per subtitle.`,
    );
  }
};

const run = (command, args) =>
  execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

// ffmpeg picks the output format from the .vtt extension.
const toVtt = (input, output, outputArgs = []) => {
  const start = performance.now();

  run("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    input,
    ...outputArgs,
    output,
  ]);

  recordSubtitleTime((performance.now() - start) / 1000);
};

// Log, then rethrow so the caller can react to the failure.
const attempt = (label, fn) => {
  try {
    fn();
  } catch (err) {
    logError(`Subtitle failed (${label}): ${err.message}`);
    throw err;
  }
};

// "Name.srt" and "Name.eng.3.srt" match video "Name.mkv"; "Name2.srt" does not.
const convertExternalSubtitles = (videoPath) => {
  const dir = path.dirname(videoPath);
  const videoName = path.parse(videoPath).name;

  for (const file of fs.readdirSync(dir)) {
    const { name, ext } = path.parse(file);
    const isConvertible = config.convertibleSubtitleTypes.includes(
      ext.slice(1).toLowerCase(),
    );

    if (!isConvertible || !file.startsWith(`${videoName}.`)) continue;

    const output = path.join(dir, `${name}.vtt`);
    if (fs.existsSync(output)) continue;

    attempt(file, () => toVtt(path.join(dir, file), output));
  }
};

const listEmbeddedSubtitles = (videoPath) =>
  JSON.parse(
    run("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "s",
      "-show_entries",
      "stream=codec_name:stream_tags=language",
      "-of",
      "json",
      videoPath,
    ]),
  ).streams;

// First "Name.lang.N.vtt" that doesn't exist yet, so it never collides with external output.
const nextFreeOutput = (dir, videoName, lang) => {
  let track = 1;
  const outputFor = (n) => path.join(dir, `${videoName}.${lang}.${n}.vtt`);

  while (fs.existsSync(outputFor(track))) track++;
  return outputFor(track);
};

const convertEmbeddedSubtitles = (videoPath) => {
  const dir = path.dirname(videoPath);
  const videoName = path.parse(videoPath).name;

  listEmbeddedSubtitles(videoPath).forEach(({ codec_name, tags }, index) => {
    if (!config.embeddedSubtitleCodecs.includes(codec_name)) return;

    const output = nextFreeOutput(dir, videoName, tags?.language ?? "und");

    attempt(`${videoPath} #${index}`, () =>
      toVtt(videoPath, output, ["-map", `0:s:${index}`, "-c:s", "webvtt"]),
    );
  });
};

// ------------------------------[ MAIN ]------------------------------ //
const markProcessed = db.prepare(
  "UPDATE media SET subtitles_processed = 1 WHERE id = ?",
);

const pending = db
  .prepare("SELECT id, path FROM media WHERE subtitles_processed = 0")
  .all();

log(`Videos to process: ${pending.length}`);

const totalStart = performance.now();

for (const { id, path: videoPath } of pending) {
  log(`Processing: ${videoPath}`);

  if (!config.videoTypes.includes(path.extname(videoPath).slice(1))) continue;

  // Skip missing video files that exist in the DB.
  if (!fs.existsSync(videoPath)) {
    log(`Missing video (skipped): ${videoPath}`);
    continue;
  }

  const videoStart = performance.now();

  try {
    convertExternalSubtitles(videoPath);
    convertEmbeddedSubtitles(videoPath);
    markProcessed.run(id);
  } catch (err) {
    const { dir, name } = path.parse(videoPath);

    for (const file of fs.readdirSync(dir)) {
      if (file.startsWith(`${name}.`) && file.toLowerCase().endsWith(".vtt")) {
        fs.rmSync(path.join(dir, file), { force: true });
      }
    }

    logError(
      `Subtitle processing failed: ${videoPath}. VTT files deleted. Not marked as processed. ${err.message}`,
    );
  } finally {
    log(`Video took ${((performance.now() - videoStart) / 1000).toFixed(2)}s`);
  }
}

log(`Total time: ${((performance.now() - totalStart) / 1000).toFixed(2)}s`);
log(`Subtitles converted: ${subtitleCount}`);

if (subtitleCount > 0) {
  log(
    `Average conversion time: ${(subtitleTotalSeconds / subtitleCount).toFixed(2)}s per subtitle`,
  );
}

// For testing, use this to only test 20 movies instead of the entire library:
// .prepare(
//   "SELECT id, path FROM media WHERE subtitles_processed = 0" +
//     " ORDER BY CASE WHEN path LIKE '%/Movies/%' THEN 0 ELSE 1 END, path LIMIT 20",
// )
