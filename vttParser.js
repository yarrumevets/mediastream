// Pure VTT parsing: file contents in, [{ start (seconds), text }] out.
const TIMESTAMP = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})$/;
const ENTITIES = { amp: "&", lt: "<", gt: ">", nbsp: " ", lrm: "", rlm: "" };
const parseTimestamp = (value) => {
  const match = TIMESTAMP.exec(value);
  if (!match) return null;
  const [, hours = 0, minutes, seconds, millis] = match;
  return (
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds) +
    Number(millis) / 1000
  );
};
const cleanCueText = (lines) =>
  lines
    .join(" ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|nbsp|lrm|rlm);/g, (_, name) => ENTITIES[name])
    .replace(/\s+/g, " ")
    .trim();
export const parseVtt = (content) => {
  const blocks = content
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex === -1 || lines[0].startsWith("NOTE")) continue;
    const start = parseTimestamp(lines[timingIndex].split("-->")[0].trim());
    const text = cleanCueText(lines.slice(timingIndex + 1));
    if (start === null || !text) continue;
    cues.push({ start, text });
  }
  return cues;
};
