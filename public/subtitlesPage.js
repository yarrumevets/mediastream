const elForm = document.getElementById("subtitleSearchForm");
const elQuery = document.getElementById("subtitleQuery");
const elStatus = document.getElementById("subtitleStatus");
const elResults = document.getElementById("subtitleResults");

const pad2 = (n) => String(n).padStart(2, "0");

// h:mm:ss
const formatTimestamp = (totalSeconds) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
};

const watchUrl = ({ treePath, name, mediaId, seconds }) => {
  const params = new URLSearchParams({
    path: treePath,
    name,
    id: mediaId,
    autoplay: 1,
    t: seconds,
  });
  return `/${PLAYER_PAGE}?${params}`;
};

const createTitleLink = ({ title, folderTreePath }) => {
  const elLink = document.createElement("a");
  elLink.href = `/?path=${encodeURIComponent(folderTreePath)}`;
  elLink.textContent = title;
  return elLink;
};

const createWatchLink = (result) => {
  const elLink = document.createElement("a");
  elLink.href = watchUrl(result);
  elLink.textContent = "watch";
  return elLink;
};

const createSnippet = ({ before, match, after }) => {
  const elMatch = document.createElement("strong");
  elMatch.textContent = match;
  const elSnippet = document.createElement("span");
  elSnippet.append('"...', before, elMatch, after, '..."');
  return elSnippet;
};

// 1) Title - "...before match after..." - h:mm:ss - watch
const createResultItem = (result, index) => {
  const elItem = document.createElement("li");
  elItem.append(
    `${index + 1}) `,
    createTitleLink(result),
    " - ",
    createSnippet(result),
    ` - ${formatTimestamp(result.seconds)} - `,
    createWatchLink(result),
  );
  return elItem;
};

const renderResults = (results) => {
  elResults.replaceChildren(...results.map(createResultItem));
  elStatus.textContent = results.length ? "" : "No results";
};

const searchSubtitles = async (query) => {
  const res = await fetch(`/subtitle-search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).results;
};

let requestId = 0;

elForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const query = elQuery.value.trim();
  if (!query) return;
  const currentRequest = ++requestId;
  elStatus.textContent = "Searching...";
  try {
    const results = await searchSubtitles(query);
    if (currentRequest !== requestId) return;
    renderResults(results);
  } catch (err) {
    if (currentRequest !== requestId) return;
    console.error("Subtitle search failed: ", err);
    elResults.replaceChildren();
    elStatus.textContent = "Search failed. Please try again.";
  }
});
