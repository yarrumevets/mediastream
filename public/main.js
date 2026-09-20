const elFileList = document.getElementById("filesList");
const elMainSection = document.getElementById("mainSection");
const navBackButtons = Array.from(document.getElementsByClassName("navBack")); // Buttons array never changes.

// ----- Navigation / Router -----
// Get the current url path if any
const urlParams = new URLSearchParams(window.location.search);
const initialPath = urlParams.get("path") || "";
// Browser arrow buttons trigger updates to the page.
window.addEventListener("popstate", () => {
  const params = new URLSearchParams(window.location.search);
  getFolderContents(params.get("path") || "");
});
const navigate = (path) => {
  const newUrl = path ? `?path=${encodeURIComponent(path)}` : "/";
  window.history.pushState({}, "", newUrl);
  getFolderContents(path);
};
let currentNavBackHander;

// =========[UTILITY FUNCTIONS]=========
// Back navigation button
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

// Check for cover.jpg, COVer2.jpg, etc.
const checkIsCoverImage = (fname) => {
  return /^cover\d*\.jpg$/i.test(fname);
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
  const elLink = document.createElement("a");
  elLink.addEventListener("click", () => {
    navigate(f.treePath);
  });
  elLink.setAttribute("title", f.name);
  // Folder cover images
  let elCoverImage;
  let covers;
  if (f.children && f.children.length) {
    covers = f.children.filter((cf) => {
      return checkIsCoverImage(cf.name);
    });
  }
  if (covers && covers.length) {
    elCoverImage = document.createElement("img");
    elCoverImage.setAttribute(
      "src",
      `/file?path=${encodeURIComponent(covers[0].treePath)}`,
    );
    elCoverImage.classList.add("coverPic");
  }
  const elLinkLabel = document.createElement("p");
  elLinkLabel.innerText = f.name;
  if (elCoverImage) elLink.appendChild(elCoverImage);
  elLink.appendChild(elLinkLabel);
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
      const elLink = document.createElement("a");
      elLink.innerText = f.name;
      elLink.setAttribute(
        "href",
        `/file?path=${encodeURIComponent(f.treePath)}`,
      );
      elListItem.appendChild(elLink);
    } else {
      // any other file
    }
  }
  return elListItem;
};

const buildListOfLinks = (data, isRoot) => {
  console.log("Fetched data: ", data);
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

const getFolderContents = (path) => {
  const isRoot = !path;
  console.log("yo");
  elFileList.innerHTML = "";
  const url = path ? `/dirtree?path=${encodeURIComponent(path)}` : `/dirtree`;
  fetch(url)
    .then((res) => res.json())
    .then((data) => {
      buildListOfLinks(data, isRoot);
    })
    .catch((err) => {
      console.error("Failed to fetch folder contents:", err);
      elFileList.innerHTML = `<li>Error loading files.</li>`;
    });
};

getFolderContents(initialPath);
