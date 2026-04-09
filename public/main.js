const elFileList = document.getElementById("filesList");

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

// ---- util functions ----
// Build the back link
const buildNavBackLink = (parent) => {
  const elUpLi = document.createElement("li");
  const elUpLink = document.createElement("a");
  elUpLink.innerText = "⬅ back...";
  elUpLi.appendChild(elUpLink);
  elUpLink.addEventListener("click", () => {
    navigate(parent);
  });
  return elUpLi;
};

// Build link (file or dir)
const buildDirLink = (f, isRoot) => {
  const elListItem = document.createElement("li");
  let elText;
  if (f.isDir || isRoot) {
    elText = document.createElement("a");
    elText.addEventListener("click", () => {
      navigate(f.treePath);
    });
    elText.setAttribute("title", f.treePath);
  } else {
    if (f.ext === "jpg") {
      // @TODO - check that it's a cover[#].jpg , etc. - Show the image instead of a link
      elText = document.createElement("a");
      elText.setAttribute(
        "href",
        `/file?path=${encodeURIComponent(f.treePath)}`,
      );
    } else if (f.ext === "mp4" || f.ext === "mkv") {
      // @TODO: Link to a dedicated video page get all the logic for storing/restarting progress etc.
      elText = document.createElement("a");
      elText.setAttribute(
        "href",
        `/file?path=${encodeURIComponent(f.treePath)}`,
      );
    } else {
      elText = document.createElement("span");
    }
  }
  if (isRoot) {
    elText.innerText = f.displayName || f.name;
    elText.classList.add("rootfolder");
  } else {
    elText.innerText = f.name; // Display name only for custom root-level
  }
  elListItem.appendChild(elText);
  return elListItem;
};

const buildListOfLinks = (data, isRoot) => {
  console.log("Fetched data: ", data);
  const parent = data.parent;
  const files = data.files;
  // Nav back to parent links.
  if (!isRoot) {
    elFileList.appendChild(buildNavBackLink(parent));
  }
  // Links for all files and folders
  for (const f of files) {
    elFileList.appendChild(buildDirLink(f, isRoot));
  }
};

const getFolderContents = (path) => {
  const isRoot = !path;
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
