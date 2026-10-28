// Helpers shared by the browse page (main.js) and the favorites page (favoritesPage.js).
const PLACEHOLDER_COVER_SRC = "/images/placeholder.jpg";
const COVER_FADE_MS = 500;
const COVER_HOLD_MS = 1000;
const checkIsJpg = (fname) => /\.jpg$/i.test(fname);
const fileUrl = (treePath) => `/file?path=${encodeURIComponent(treePath)}`;

// Check for cover.jpg, COVer2.jpg, etc.
const checkIsCoverImage = (fname) => {
  return /^cover\d*\.jpg$/i.test(fname);
};

// Folder link (cover pic + name) that opens the folder in the browse page.
const createFolderLink = (f) => {
  const elLink = document.createElement("a");
  elLink.href = `/?path=${encodeURIComponent(f.treePath)}`;
  elLink.setAttribute("title", f.name);
  elLink.appendChild(createCoverImage(f));
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

// The folder's .jpg images (as file URLs), cover first.
const getCoverSlideshowSources = (folder, cover) => {
  const otherImages = folder.children.filter(
    (c) => c !== cover && !c.isDir && checkIsJpg(c.name),
  );
  return [cover, ...otherImages].map((c) => fileUrl(c.treePath));
};

// While hovered, cycles through the sources (only if there is more than one).
const addHoverSlideshow = (crossfadeImage, sources) => {
  if (sources.length < 2) return;
  const slideshow = createSlideshow(crossfadeImage, sources, {
    holdMs: COVER_HOLD_MS,
  });
  crossfadeImage.element.addEventListener("mouseenter", slideshow.start);
  crossfadeImage.element.addEventListener("mouseleave", slideshow.stop);

  // start if its already hovered.
  if (crossfadeImage.element.parentElement?.matches(":hover")) {
    console.log("par hov!");
    slideshow.start();
  }
  // start if its already hovered.
  if (crossfadeImage.element?.matches(":hover")) {
    console.log("does hov!");
    slideshow.start();
  }
};

// Placeholder right away, replaced by the folder's cover once it loads.
const createCoverImage = (folder) => {
  const coverImage = createCrossfadeImage(PLACEHOLDER_COVER_SRC, {
    fadeMs: COVER_FADE_MS,
  });
  coverImage.element.classList.add("coverPic");
  const cover = folder.children?.find((c) => checkIsCoverImage(c.name));
  if (!cover) return coverImage.element; // No cover: the placeholder stays.
  const coverSrc = fileUrl(cover.treePath);
  preloadImage(coverSrc)
    .then(() => {
      coverImage.showInstantly(coverSrc);
      addHoverSlideshow(coverImage, getCoverSlideshowSources(folder, cover));
    })
    .catch((err) => console.error("Failed to load cover: ", err));
  return coverImage.element;
};
