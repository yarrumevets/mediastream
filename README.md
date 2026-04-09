# Media Stream &#127909;

Bare-bones media streaming web app.

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Installation & Setup](#installation--setup)
- [Usage](#usage)
- [License](#license)
- [Notes](#important-notes)

## Introduction

This is a bare-bones prototype video-streaming web app.

## Features

- Include any folders accessible by your host machine and navigate them in the app's front-end UI.
- Folders with any cover.jpg will display.
- Only video files (.mkv, .mp4, etc.) set in the config will display.
- Clicking on a video file will play that video.

## Features Coming Soon 🚧

- The position within each video is saved in browser storage, and the video will resume from that point automatically.
- A record of which video files have been played already and when will be saved in front-end storage.
- If more than one cover.jpg (cover2.jpg, cover3.jpg, etc.) the images will cycle (fade)
- TV series will play one after another, sequentially.
- Simple login backed by MongoDB will persist viewing data on the server so it's not tied to a single device
- Support for audio, books (pdf), tutorials (videos + downloadable content),

## Installation & Setup

Step-by-step instructions on how to get the development environment running.

```bash
git clone https://github.com/yarrumevets/mediastream.git
cd mediastream
yarn
```

`yarn add express`

### Files:

public/config.js

- Create this file from SAMPLE.config.js

secret.config.js

- Create this file from SAMPLE.secret.config.js
  - set the port
  - set the folder mappings and names for root folders

## Usage

```bash
node server.js
```

Go to `http://localhost:<PORT>` in your browser.

## License

Distributed under the MIT License. See the LICENSE file for more information.

## IMPORTANT NOTES

1 - When merging video sources in the secret.config.js file, be sure to make sure the sources have unique direct subfolders. ex: You can't have c:\mymovie and d:\mymovie linked to Movies.
