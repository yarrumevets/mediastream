const elFileList = document.getElementById("filesList");
const elMainSection = document.getElementById("mainSection");
const navBackButtons = Array.from(document.getElementsByClassName("navBack")); // Buttons array never changes.

// // @TODO - do something better here. Controls which player opens from the library.
// Currently, each player (video/videostream) navigates to itself on 'next'.
// const PLAYER_PAGE = "video.html"; // regular - simple but doesn't work with many video/audio formats.
const PLAYER_PAGE = "videostream.html";

// ----- Navigation / Router -----
// Get the current url path if any
const urlParams = new URLSearchParams(window.location.search);
const initialPath = urlParams.get("path") || "";

// Browser arrow buttons trigger updates to the page.
window.addEventListener("popstate", () => {
  const params = new URLSearchParams(window.location.search);
  buildPage(params.get("path") || "");
});

// Page restored from the back/forward cache (e.g. returning from favorites), so refresh the hearts.
window.addEventListener("pageshow", (e) => {
  if (!e.persisted) return;
  const params = new URLSearchParams(window.location.search);
  buildPage(params.get("path") || "");
});

const navigate = (path) => {
  const newUrl = path ? `?path=${encodeURIComponent(path)}` : "/";
  window.history.pushState({}, "", newUrl);
  buildPage(path);
};
let currentNavBackHander;

// =========[UTILITY FUNCTIONS]=========

const navBackButtonsSetup = (parent) => {
  if (currentNavBackHander) {
    navBackButtons.forEach((n) =>
      n.removeEventListener("click", currentNavBackHander),
    );
  }
  currentNavBackHander = () => {
    navigate(parent);
  };
  navBackButtons.forEach((n) => {
    n.classList.remove("hidden");
    n.addEventListener("click", currentNavBackHander);
  });
};

const navBackButtonsRemove = () => {
  console.log("navBackButtons: ", navBackButtons);
  navBackButtons.forEach((n) => {
    n.classList.add("hidden");
  });
};

const createVideoLink = ({ id, name, treePath }) => {
  const elLink = document.createElement("a");
  elLink.innerText = name;
  elLink.href = `/${PLAYER_PAGE}?path=${encodeURIComponent(treePath)}&name=${encodeURIComponent(name)}&id=${encodeURIComponent(id)}`;
  return elLink;
};

// Create a root link.
const createRootElement = (f) => {
  const elLink = document.createElement("a");
  elLink.addEventListener("click", () => {
    navigate(f.treePath);
  });
  elLink.innerText = f.displayName || f.name;
  elLink.classList.add("rootfolder"); // root folder special styling.
  return elLink;
};

const createFolderElement = (f) => {
  const elLink = createFolderLink(f);
  elLink.addEventListener("click", (e) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(f.treePath);
  });
  return elLink;
};

// Build link for each file, folder, root.
const buildDirLink = (f, isRoot) => {
  let elListItem = null;
  const createElListItem = () => {
    elListItem = document.createElement("li");
    elListItem.classList.add("fileWrapper");
    return elListItem;
  };
  if (isRoot) {
    createElListItem();
    elListItem.appendChild(createRootElement(f));
  } else if (f.isDir) {
    createElListItem();
    elListItem.appendChild(createFolderElement(f));
    if (typeof f.favorite === "boolean") {
      elListItem.appendChild(createFavoriteButton(f.treePath, f.favorite));
    }
  } else {
    if (checkIsCoverImage(f.name)) {
      // Cover image.
      createElListItem();
      const elCoverImage = document.createElement("img");
      elCoverImage.classList.add("coverPic");
      elCoverImage.setAttribute(
        "src",
        `/file?path=${encodeURIComponent(f.treePath)}`,
      );
      elListItem.appendChild(elCoverImage);
    } else if (f.ext === "mp4" || f.ext === "mkv" || f.ext === "avi") {
      // Video file
      createElListItem();
      elListItem.appendChild(createVideoLink(f));
    } else {
      // any other file
    }
  }
  return elListItem;
};

const buildListOfLinks = (data, isRoot) => {
  const parent = data.parent;
  const files = data.files;
  // Back-button
  if (!isRoot) {
    navBackButtonsSetup(parent);
  } else {
    navBackButtonsRemove();
  }
  // Create content for all relevant files/folders.
  for (const f of files) {
    const fileEl = buildDirLink(f, isRoot);
    if (fileEl) elFileList.appendChild(fileEl);
  }
};

const getFolderContents = async (path) => {
  console.log("path: ", path);
  const url = path ? `/dirtree?path=${encodeURIComponent(path)}` : `/dirtree`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const buildPage = async (path) => {
  elFileList.innerHTML = "";
  try {
    const folderTree = await getFolderContents(path);
    buildListOfLinks(folderTree, !path);
  } catch (err) {
    console.error("Failed to fetch folder contents: ", err);
    elFileList.innerHTML = `<li>Error loading files.</li>`;
  }
};

buildPage(initialPath);
