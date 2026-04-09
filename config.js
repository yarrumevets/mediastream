// Valid file tyes by category
const videoTypes = ["mp4", "mkv"];
const subtitleTypes = ["vtt", "srt"];
const imageTypes = ["jpg", "png"];

const config = {
  validFileTypes: [...videoTypes, ...subtitleTypes, ...imageTypes],
};
export default config;
