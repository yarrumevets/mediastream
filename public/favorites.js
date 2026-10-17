// Depends on shared.js. It must be loaded before this script.

const elFavoritesList = document.getElementById("favoritesList");

const showMessage = (text) => {
  elFavoritesList.innerHTML = "";
  const elItem = document.createElement("li");
  elItem.innerText = text;
  elFavoritesList.appendChild(elItem);
};

const buildFavoriteItem = (folder) => {
  const elListItem = document.createElement("li");
  elListItem.classList.add("fileWrapper");
  const elFavoriteButton = createFavoriteButton(folder.treePath, true, {
    confirmRemoveMessage: `Remove "${folder.name}" from your favorites?`,
    onChange: (isFavorite) => {
      if (isFavorite) return;
      elListItem.remove();
      if (!elFavoritesList.children.length) showMessage("No favorites yet.");
    },
  });
  elListItem.append(createFolderLink(folder), elFavoriteButton);
  return elListItem;
};

const getFavorites = async () => {
  const res = await fetch("/favorites");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).folders;
};

const buildFavoritesPage = async () => {
  try {
    const folders = await getFavorites();
    if (!folders.length) return showMessage("No favorites yet.");

    elFavoritesList.innerHTML = "";
    for (const folder of folders) {
      elFavoritesList.appendChild(buildFavoriteItem(folder));
    }
  } catch (err) {
    console.error("Failed to fetch favorites: ", err);
    showMessage("Error loading favorites.");
  }
};

buildFavoritesPage();

// Refresh when returning from the browser's back/forward cache.
window.addEventListener("pageshow", (e) => {
  if (e.persisted) buildFavoritesPage();
});
