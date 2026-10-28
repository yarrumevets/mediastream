// Generic image helpers: preloading, cross-fading between images, and cycling through them.

// Resolves once the image is downloaded and decoded, so showing it doesn't flicker.
const preloadImage = (src) => {
  const img = new Image();
  img.src = src;
  return img.decode();
};

// An image that can switch to another image, either instantly or with a cross-fade.
// The new image fades in on an overlay layer, then is handed over to the base layer.
const createCrossfadeImage = (initialSrc, { fadeMs }) => {
  const elWrapper = document.createElement("div");
  elWrapper.classList.add("crossfadeImage");

  const elBase = document.createElement("img");
  elBase.alt = "";
  elBase.src = initialSrc;

  const elOverlay = document.createElement("img");
  elOverlay.alt = "";
  elOverlay.classList.add("crossfadeOverlay");

  elWrapper.append(elBase, elOverlay);

  let currentFade = null;

  const showInstantly = (src) => {
    elBase.src = src;
  };

  const fadeTo = async (src) => {
    currentFade?.cancel(); // A newer fade replaces one still running.
    elOverlay.src = src;
    const fade = elOverlay.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: fadeMs,
      easing: "ease-in-out",
      fill: "forwards",
    });
    currentFade = fade;

    try {
      await fade.finished;
    } catch {
      return; // Cancelled by a newer fade.
    }

    elBase.src = src;
    await elBase.decode().catch(() => {});
    // The base now shows the same image, so the overlay can go.
    if (currentFade === fade) {
      fade.cancel();
      currentFade = null;
    }
  };

  return { element: elWrapper, showInstantly, fadeTo };
};

// Cycles a crossfade image through `sources`: holds each image for holdMs, then fades to the next.
// Stopping returns to the first image.
const createSlideshow = (crossfadeImage, sources, { holdMs }) => {
  let index = 0;
  let runId = 0; // Bumped on start / stop so pending work from an earlier run is dropped.
  let timerId = null;

  const scheduleNext = (id) => {
    timerId = setTimeout(() => showNext(id), holdMs);
  };

  const showNext = async (id) => {
    index = (index + 1) % sources.length;
    const isLoaded = await preloadImage(sources[index]).then(
      () => true,
      () => false,
    );
    if (id !== runId) return; // Stopped while loading.
    if (!isLoaded) return scheduleNext(id); // Skip images that fail to load.

    await crossfadeImage.fadeTo(sources[index]);
    if (id === runId) scheduleNext(id);
  };

  const start = () => {
    runId += 1;
    clearTimeout(timerId);
    scheduleNext(runId);
  };

  const stop = () => {
    runId += 1;
    clearTimeout(timerId);
    if (index === 0) return;
    index = 0;
    crossfadeImage.fadeTo(sources[0]);
  };

  return { start, stop };
};
