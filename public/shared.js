// Helpers shared by the browse page (main.js) and the favorites page (favoritesPage.js).

// Check for cover.jpg, COVer2.jpg, etc.
const checkIsCoverImage = (fname) => {
  return /^cover\d*\.jpg$/i.test(fname);
};

// Folder link (cover pic + name) that opens the folder in the browse page.
const createFolderLink = (f) => {
  const elLink = document.createElement("a");
  elLink.href = `/?path=${encodeURIComponent(f.treePath)}`;
  elLink.setAttribute("title", f.name);
  const cover = f.children?.find((c) => checkIsCoverImage(c.name));
  if (cover) {
    const elCoverImage = document.createElement("img");
    elCoverImage.src = `/file?path=${encodeURIComponent(cover.treePath)}`;
    elCoverImage.classList.add("coverPic");
    elLink.appendChild(elCoverImage);
  }
  const elLinkLabel = document.createElement("p");
  elLinkLabel.innerText = f.name;
  elLink.appendChild(elLinkLabel);
  return elLink;
};

const saveFavorite = async (treePath, favorite) => {
  const res = await fetch("/favorites", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: treePath, favorite }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
};

// Heart toggle (♡ / ♥). Options:
//  - confirmRemoveMessage: if set, asks for confirmation before un-favoriting.
//  - onChange(isFavorite): runs after the new state is saved.
const createFavoriteButton = (treePath, isFavorite, options = {}) => {
  const { confirmRemoveMessage, onChange } = options;
  const elButton = document.createElement("button");
  elButton.type = "button";
  elButton.classList.add("favoriteToggle");

  const render = () => {
    elButton.textContent = isFavorite ? "♥" : "♡";
    elButton.classList.toggle("isFavorite", isFavorite);
    elButton.setAttribute("aria-pressed", String(isFavorite));
    elButton.title = isFavorite ? "Remove from favorites" : "Add to favorites";
  };

  elButton.addEventListener("click", async () => {
    const newState = !isFavorite;
    if (!newState && confirmRemoveMessage && !confirm(confirmRemoveMessage)) {
      return;
    }
    elButton.disabled = true;
    try {
      await saveFavorite(treePath, newState);
      isFavorite = newState;
      render();
      onChange?.(isFavorite);
    } catch (err) {
      console.error("Failed to update favorite: ", err);
      alert("Could not update favorites. Please try again.");
    } finally {
      elButton.disabled = false;
    }
  });

  render();
  return elButton;
};
