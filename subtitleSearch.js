import db from "./db.js";

export const MAX_QUERY_LENGTH = 50;
const MAX_RESULTS = 30;
const CONTEXT_CHARS = 20;
const LEAD_IN_SECONDS = 1;
const TITLE_FOLDER_DEPTH = 2; // "tv/Show Name (2010)" - the folder holding a show / movie.

const findCues = db.prepare(`
  SELECT c.start_seconds AS startSeconds, c.text, m.id AS mediaId,
         m.filename AS name, v.tree_path AS treePath
  FROM subtitle_cues c
  JOIN subtitle_videos v ON v.media_id = c.media_id
  JOIN media m ON m.id = c.media_id
  WHERE c.text LIKE ? ESCAPE '\\'
  LIMIT ${MAX_RESULTS}
`);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeLike = (value) => value.replace(/[\\%_]/g, "\\$&");

// Returns the cleaned query, or null if it is invalid.
export const normalizeSearchQuery = (raw) => {
  if (typeof raw !== "string") return null;
  const query = raw.trim().replace(/\s+/g, " ");
  if (!query || query.length > MAX_QUERY_LENGTH) return null;
  return query;
};

const buildSnippet = (text, query) => {
  const found = new RegExp(escapeRegExp(query), "i").exec(text);
  if (!found) return null;
  const end = found.index + found[0].length;
  return {
    before: text.slice(Math.max(0, found.index - CONTEXT_CHARS), found.index),
    match: found[0],
    after: text.slice(end, end + CONTEXT_CHARS),
  };
};

const getTitleFolder = (treePath) => {
  const parts = treePath.split("/");
  const depth = Math.min(TITLE_FOLDER_DEPTH, parts.length - 1);
  const folderParts = parts.slice(0, depth);
  return {
    title: folderParts.at(-1),
    folderTreePath: folderParts.join("/"),
  };
};

export const searchSubtitles = (query) =>
  findCues.all(`%${escapeLike(query)}%`).flatMap((row) => {
    const snippet = buildSnippet(row.text, query);
    if (!snippet) return [];
    return [
      {
        ...getTitleFolder(row.treePath),
        ...snippet,
        treePath: row.treePath,
        name: row.name,
        mediaId: row.mediaId,
        seconds: Math.max(0, row.startSeconds - LEAD_IN_SECONDS),
      },
    ];
  });
