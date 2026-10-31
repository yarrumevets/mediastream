// Reads container and stream info from a video file with ffprobe.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PROBE_ENTRIES = [
  "format=format_name,duration",
  "stream=codec_type,codec_name,profile,level,width,height,pix_fmt",
  "stream_disposition=default,attached_pic",
].join(":");

const runFfprobe = async (filePath) => {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    PROBE_ENTRIES,
    "-of",
    "json",
    filePath,
  ]);
  return JSON.parse(stdout);
};

const toNumberOrNull = (value) => {
  const number = parseFloat(value);
  return Number.isFinite(number) ? number : null;
};

// ffprobe reports unknown levels as negative numbers (e.g. -99).
const toLevelOrNull = (level) => (level > 0 ? level : null);

// Embedded cover art shows up as a video stream, so skip it.
const findVideoStream = (streams) =>
  streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);

// The default audio track, or the first audio track if none is marked default.
const findAudioStream = (streams) => {
  const audioStreams = streams.filter((s) => s.codec_type === "audio");
  return audioStreams.find((s) => s.disposition?.default) ?? audioStreams[0];
};

// Returns the media info for a video file. Missing values are null.
const probeVideo = async (filePath) => {
  const { format = {}, streams = [] } = await runFfprobe(filePath);
  const video = findVideoStream(streams);
  const audio = findAudioStream(streams);
  return {
    container: format.format_name ?? null,
    duration: toNumberOrNull(format.duration),
    videoCodec: video?.codec_name ?? null,
    videoProfile: video?.profile ?? null,
    videoLevel: toLevelOrNull(video?.level),
    width: video?.width ?? null,
    height: video?.height ?? null,
    pixFmt: video?.pix_fmt ?? null,
    audioCodec: audio?.codec_name ?? null,
  };
};

export { probeVideo };
