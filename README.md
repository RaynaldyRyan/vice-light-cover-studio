# Vice Light Cover Studio

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01)
[![make.fun rank](https://make.fun/badge/gta6-cover-art-01/RaynaldyRyan/vice-light-cover-studio/rank.svg)](https://make.fun/bounty/gta6-cover-art-01)
[![make.fun reward](https://make.fun/badge/gta6-cover-art-01/RaynaldyRyan/vice-light-cover-studio/reward.svg)](https://make.fun/bounty/gta6-cover-art-01)

An offline web app that turns your photos and a caption into GTA 6-style
multi-panel cover art — and exports it as a PNG to share. Built for the
make.fun bounty **Make GTA 6 Cover Art** ($250, 50 paid places).

## What it does

- **Your photos:** add photos from your machine, or use one of the four
  built-in sample scenes (beach, rooftop, neon street, pier). Click a panel
  in the live preview, then pick which photo fills it; drag inside a panel
  to reposition the photo, use Zoom to frame it, or fill all panels with
  one photo.
- **Layouts:** six multi-panel arrangements — 4-Panel Grid, Hero + Three,
  9-Panel Grid, Full Bleed, Tilted Snapshots, Story Stack.
- **Grades:** five posterized gradient-map colour grades (Vice Sunset, Neon
  Night, Hot Pink / Cyan, Golden Hour, Mono Ink) with ink outlines and
  film grain sliders. Real photographs get a contrast stretch first; flat
  art is left alone so its dark panels stay readable.
- **Lettering:** a halftone title block with gradient display lettering, a
  neon script subtitle, and a star badge — all drawn on canvas.
- **Export:** one click renders the cover at 1080 × 1080, 1080 × 1350 or
  1920 × 1080 and downloads it as a PNG.

Everything runs offline in the browser: no network requests, no uploads,
photos never leave your machine. The only fonts are Anton and Pacifico,
shipped under `app/fonts/` under the SIL Open Font License. Nothing here
copies Rockstar Games — no logo, artwork, character or game font.

## Run it

```sh
node serve.ts
```

Then open <http://localhost:8080> in desktop Chrome. `serve.ts` is a tiny
static server (Node 22, standard library only) for local tries; any static
server works, since the app is plain files under `app/`.

## How the entry is handed in

`main.ts` (Node 22, standard library only) copies `app/` and
`screenshots/` to the output directory and writes `dossier.json` with the
vendored `buildDossier` library:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`screenshots/` holds four JPEGs taken with the app itself: the exported
cover, the editor with a photo loaded, a second cover in another layout
and grade, and the wide 1920 × 1080 cover. The shot scenarios live in
`app/src/shots.js`; opening the app with `?shot=<id>` renders one.

## Layout of the repo

- `app/index.html`, `app/style.css` — the editor shell and its styling.
- `app/src/cover.js` — the cover renderer: grades, layouts, pixel grading,
  panel geometry, and the whole-cover draw.
- `app/src/main.js` — the editor: controls, photo handling, drag-to-pan,
  undo/redo, export, and shot mode.
- `app/src/shots.js` — the four dossier screenshot scenarios.
- `app/assets/*.svg` — the four built-in sample scenes.
- `app/fonts/` — Anton and Pacifico (OFL).
- `screenshots/` — the four dossier screenshots.
- `serve.ts` — local static server. `vendor/makefun-app.ts` — the kit's
  dossier library, unchanged.
