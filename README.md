# Media Stream &#127909;

A self-hosted media streaming web app for browsing and watching your own video library.

## Table of Contents

- [Introduction](#introduction)
- [Intended Usage](#intended-usage)
- [Features](#features)
- [Installation & Setup](#installation--setup)
- [Usage](#usage)
- [Important Notes](#important-notes)
- [Known Issues](#-known-issues)
- [Possible Future Updates](#-possible-future-updates)
- [Hard Reset](#-hard-reset)
- [License](#license)

## Introduction

This is a self-hosted video-streaming web app. Point it at folders of video files on your own machine (or attached drives), and it serves up a browsable library with covers, favorites, watched status, subtitles, resumable playback, and cross-device sync.

## Intended Usage

This app is designed for **a single user/account signed in on multiple devices at once** — the classic case being one person with a login active on machines in different rooms of a home (living room TV, bedroom, kitchen tablet, etc.), moving between them while the same video keeps playing and in sync ("Watch Along").

Because of that design target, the project intentionally does **not** prioritize:

- Race conditions between simultaneous conflicting inputs from different clients
- Millisecond-exact playback sync
- Multi-tenant concerns (per-user libraries, permissions, quotas)

A basic `users` table and login system exist mainly so playback progress/favorites/watched state follow "a user" rather than being tied to one browser, not to support many unrelated people sharing one server. Accuracy within a second or two, and "good enough" conflict resolution between a person's own devices, is the actual bar — see [Known Issues](#-known-issues).

## Features

- **Media library browsing** — Any folders accessible to the host machine can be configured as root(s) under a named section (e.g. "Movies", "TV Series") in `secret.config.js`. Multiple roots can be merged into a single section.
- **Folder covers** — Folders with a `cover.jpg` display it as a thumbnail. Additional `cover2.jpg`, `cover3.jpg`, etc. are cross-faded as a hover slideshow.
- **Favorites** — Title folders (one movie, one show) can be favorited/unfavorited (heart icon), with a dedicated Favorites page. Stored per user.
- **Watched tracking** — Playback is sampled in the background and merged into watched ranges per video. A video counts as "watched" once ~80% of it has actually been played (not just scrubbed). Folders show a watched (✓) or partially-watched (◐) indicator based on their contents.
- **Resume playback** — Each user's position in each video is persisted server-side (SQLite) and playback resumes from there automatically, independent of which device/browser is used.
- **Next video / auto-advance** — Videos within a section play in natural (numeric-aware) order; a "Next" button and an optional auto-advance toggle move to the next video in sequence when one ends.
- **Cross-device synchronized playback ("Watch Along")** — Play/pause/seek state is broadcast from whichever device is controlling playback and picked up by other logged-in devices via a lightweight heartbeat, including switching to whatever video another device just started. The login page offers a direct "Watch along" link to join what's currently playing.
- **Two playback modes**:
  - `video.html` — plays the source file directly in the `<video>` element (simple, but limited to formats/codecs the browser supports natively).
  - `videostream.html` — on-the-fly HLS transcoding via FFmpeg (`stream.js`), so formats/codecs the browser can't play natively still work. Segments are transcoded to H.264/AAC and cached per video; caches for videos no one is actively watching are cleaned up automatically.
- **Subtitles** — External subtitle files (`.srt`, `.ass`, `.ssa`) and embedded subtitle tracks are automatically converted to WebVTT via FFmpeg, with language detected from the filename or stream tags. Subtitles are exposed as native `<track>` elements, so selection is handled by the browser's own CC/subtitles menu.
- **Media indexing (SQLite)** — Every video is identified by a content hash (first 10MB + file size), so renamed/moved files keep their history, and a scan reports (without touching) duplicate files. A separate pass probes each video with `ffprobe` and stores duration, container, codecs, resolution, and pixel format for reuse (e.g. deciding where "near the end of the video" starts).
- **Authentication** — Simple username/password accounts (salted + hashed, scrypt), session via a signed, httpOnly cookie. Everything except the login page requires a session.
- **Standalone library scanning** (`update.js`) — Rebuilds the media tree, syncs it into SQLite, and probes metadata without needing the server running; `subtitles.js` similarly runs as a standalone pass to (re)generate subtitle tracks for anything not yet processed.

## Installation & Setup

```bash
git clone https://github.com/yarrumevets/mediastream.git
cd mediastream
yarn
```

This app also shells out to **FFmpeg and FFprobe** for streaming, subtitle conversion, and media probing — install them and make sure both are on your `PATH`.

### Files to create:

`public/config.js`

- Create this file from `public/SAMPLE.config.js`.
- Sets front-end display config (e.g. the app's display name).

`secret.config.js`

- Create this file from `SAMPLE.secret.config.js`.
- Set the port, cookie secret, and the folder mappings/display names for each section's root folder(s).

## Usage

Scan/update the media library and metadata (run this first, and any time files change):

```bash
node update.js
```

Generate/refresh subtitle tracks (safe to re-run; only processes videos not yet marked done):

```bash
node subtitles.js
```

Start the server:

```bash
node server.js
```

Go to `http://localhost:<PORT>` in your browser, sign up, and log in.

## Important Notes

1. When merging multiple roots into one section in `secret.config.js`, make sure the roots don't share a direct subfolder name. e.g. you can't have `c:\movies` and `d:\movies` both mapped into the same "Movies" section — their top-level folders need unique names.
2. FFmpeg/FFprobe must be installed and reachable on `PATH`. They're required for HLS streaming (`stream.js`), subtitle conversion (`subtitles.js`), and media probing (`probe.js`, and the on-demand duration lookup in `media.js`).
3. `hls.js` is a dependency but is served as a static file rather than imported — after `yarn install`, copy it into `public/`:
   ```bash
   cp node_modules/hls.js/dist/hls.min.js public/hls.min.js
   ```
4. See [Intended Usage](#intended-usage) — this is built for one account on several of your own devices, not multi-tenant hosting.

## 🪲 Known Issues

🐞 **Autoplay on video switches**: Opening a video with `autoplay=1` by pasting its URL into browser A causes browser B to autoplay, but A remains paused. Clicking a link with the same URL autoplays both. Likely related to reloading `video.html`/`videostream.html` instead of switching videos in-place.

⚠️ **Unsaved progress on video switches**: Should persist playback position when switching, otherwise up to ~10 seconds of progress can be lost. (minor)

⚠️ **Control request ordering**: `/control` requests can arrive out of order. Rapid seeking or play/pause changes can leave the server with an outdated state. (Not prioritized — see [Intended Usage](#intended-usage).)

⚠️ **Suppressed user controls**: `ignoreLocalEventsUntil` blocks all control events for one second, including legitimate user actions immediately after synchronization.

🐌 **Excessive heartbeat frequency**: Every 53ms means up to ~19 requests per second per client — unnecessary server traffic for the precision actually needed.

🧹 **Stale/duplicate media records**: Resizing or otherwise changing a video file at the same path creates a new DB record alongside the old one (possible wrong-ID lookups); deleted videos' records are never cleaned up.

## 🚧 Possible Future Updates

- MongoDB/cloud-backed persistence, so viewing data isn't tied to one server/disk.
- Support for other media types: audio, e-books (PDF), tutorials (video + downloadable resources).
- Store video duration (and other metadata) at scan time for every video, removing the on-demand `ffprobe` fallback in `media.js`.
- Incremental DB writes during a library scan, instead of holding the whole batch until the scan finishes.
- Selectable HLS quality/resolution (currently a single fixed 480p transcode).
- Full-text search across the library (title, folder, maybe subtitle contents).
- Clean up or remove unused legacy code (e.g. `utilities.js` duplicates logic now in `auth.js`/`media.js`/`update.js`).
- Pick one playback mode going forward (`video.html` vs `videostream.html`) once HLS reliably covers the formats direct playback was kept around for.

## ☢️ Hard Reset

This keeps user accounts but wipes everything else (media index, metadata, progress/favorites/watched state):

```bash
sqlite3 media.db "DELETE FROM user_media_state; DELETE FROM media_info; DELETE FROM media;"
node update.js
node server.js
```

## License

Distributed under the MIT License. See the LICENSE file for more information.
