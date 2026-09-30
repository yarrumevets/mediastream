// Valid file tyes by category
const videoTypes = ["mp4", "mkv", "avi"];
const subtitleTypes = ["vtt", "srt"];
const imageTypes = ["jpg", "png"];

const config = {
  videoTypes,
  validFileTypes: [...videoTypes, ...subtitleTypes, ...imageTypes],
};
export default config;
