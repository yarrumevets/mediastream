import db from "./db.js";
import { isTitleFolder, getTitleFolder } from "./media.js";
const naturalOrder = new Intl.Collator(undefined, { numeric: true });
const selectFavoritePaths = db.prepare(`
  SELECT tree_path FROM user_favorite_folders WHERE user_id = ?
`);
const insertFavorite = db.prepare(`
  INSERT INTO user_favorite_folders (user_id, tree_path, created_at)
  VALUES (?, ?, ?)
  ON CONFLICT(user_id, tree_path) DO NOTHING
`);
const deleteFavorite = db.prepare(`
  DELETE FROM user_favorite_folders WHERE user_id = ? AND tree_path = ?
`);
const getFavoritePaths = (userId) =>
  new Set(selectFavoritePaths.all(userId).map((row) => row.tree_path));
// Adds a `favorite` flag to the title folders of a directory listing.
// Other entries are left untouched.
const markFavorites = (userId, files) => {
  const favoritePaths = getFavoritePaths(userId);
  return files.map((f) =>
    isTitleFolder(f) ? { ...f, favorite: favoritePaths.has(f.treePath) } : f,
  );
};
// The user's favorite folders that still exist in the media tree, in name order.
const getFavoriteFolders = (userId) =>
  [...getFavoritePaths(userId)]
    .map((treePath) => getTitleFolder(treePath))
    .filter(Boolean)
    .map((folder) => ({ ...folder, favorite: true }))
    .sort((a, b) => naturalOrder.compare(a.name, b.name));
// Returns false if trying to favorite something that isn't a title folder.
const setFavorite = (userId, treePath, isFavorite) => {
  if (!isFavorite) {
    deleteFavorite.run(userId, treePath);
    return true;
  }
  if (!getTitleFolder(treePath)) return false;
  insertFavorite.run(userId, treePath, new Date().toISOString());
  return true;
};
export { markFavorites, getFavoriteFolders, setFavorite };
