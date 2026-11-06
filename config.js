// Valid file tyes by category
const videoTypes = ["mp4", "mkv", "avi"];
const imageTypes = ["jpg", "png"];
const subtitleTypes = ["vtt", "srt"]; // nothing to do with subtitle processing.

const convertibleSubtitleTypes = ["srt", "ass", "ssa"]; // external files converted to vtt
const embeddedSubtitleCodecs = [
  "subrip",
  "ass",
  "ssa",
  "mov_text",
  "webvtt",
  "text",
]; // embedded; excludes PGS etc.

const config = {
  videoTypes,
  validFileTypes: [...videoTypes, ...subtitleTypes, ...imageTypes],
  convertibleSubtitleTypes,
  embeddedSubtitleCodecs,
};
export default config;
