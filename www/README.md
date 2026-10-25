# www: Comfyture's website

A static page, no build step: `index.html`, `site.css`, `site.js`, the fonts and the media. Every URL is relative, so it works on
GitHub Pages under the repository's sub-path. `demo/` (the app as static files, `npm run demo-site`) is published beside it; the page's
"Try the live demo" keys lead there, and each studio's key to `demo/#/<studio>`.

## What the page holds, top to bottom

| Section | What it shows | Media |
|---|---|---|
| Flag and bar | #OpenSourceHiggsfield, For judges (docs/competition/JUDGES.md), Star on GitHub, Try the demo | |
| Hero | a 15-second reel of real takes with its sound on demand, a caption per take, the promise and the two keys | `media/hero/` |
| Ticker | the open-weights models it runs | |
| Seven studios | the seven pets together, then a card per studio with its pet, one line, what it makes and a clip | `media/pets/`, the studios' clips |
| Kitchen | Story, Stage, Shot, Cut and Library as tabs over the real screens; the Stage's seven passes; Last frame first; the 28 presets | `media/app/`, `media/loops/`, `media/presets/` |
| Mixer | the crew, two vertical takes of Meringue | `media/mixer/` |
| Jam | Taro's video cover (his ACE-Step song, with sound), the five workspaces, the Track screen | `media/jam/`, `media/app/jam.webp` |
| Macaron | posts and motion from two brands (Comfyture, Little Otter Tea), the brand kit screen | `media/macaron/`, `media/app/macaron.webp` |
| Spice | plate against comp on four example shots (drag the line), the six departments, the FX screen and library | `media/spice/`, `media/app/spice.webp` |
| Toaster | clay frame against render on its three examples, the maps sent, the turnaround, the Scene screen | `media/toaster/`, `media/app/toaster.webp` |
| Utensils | the shelf of tools, the Picture screen | `media/app/utensils.webp` |
| Pets | the tour, checked actions, a paid run only on a yes; each pet with what its bar asks (the app's own words) | `media/app/tour.webp` |
| Open weights | the models by job, Renders on (Comfy Cloud or your ComfyUI), `COMFYTURE_OPEN_WEIGHTS=1`, how it runs | |
| Gallery | 28 outputs, filtered by studio, each opened in a viewer with how it was made | the folders above |
| Run it | the commands, the three ways (no key, Comfy Cloud, your GPU) | |

## Rebuilding the media

```bash
npm run www                                     # python3 scripts/www-media.py: makes what is missing
FORCE=1 npm run www                             # makes everything again
CAPTURES=<capture folder> npm run www           # also brings in the app's screens (below)
```

`scripts/www-media.py` names every file it takes: the presets, the shipped examples (`examples/`), the brand folders, and a few takes of
the take log (`data/runs`, `data/reels`; skipped on a machine without them). Pictures become WebP, clips H.264 MP4 with faststart and a
poster; loops have no sound. It never copies a whole folder, so nothing of a Mixer trend (its look frames, its pose videos; the
original recordings it held are out of the repository since 25 October) can reach the site.

### The app's screens

Captured headless (Playwright, Chromium with SwiftShader for the Stage and Toaster, every request outside localhost blocked) from a lab
server on a fresh data folder, so each studio opens on its shipped examples and nothing of anyone's own data shows:

```bash
PORT=5313 COMFYTURE_DATA=/tmp/lab/data COMFY_API_KEY= COMFY_BASE_URL=http://127.0.0.1:9 node server/main.ts
```

Viewport 1600x950 at twice the pixels; Kitchen's story is The Great Jam Chase (Ketkout), copied into the lab's data folder with its
pictures and takes. The capture folder holds `a/` (Kitchen), `b/` (Spice, Macaron) and `c/` (Toaster, Jam, Utensils); the `APP` table in
the script says which file becomes which screen. The Stage's passes loop is made from seven stills of one frame (clay, colour ID, depth,
normal, pose, lines, mask), its viewport cropped and cross-faded. Nothing was rendered: no key, ComfyUI on a dead port, no paid run.

## Where everything comes from

- **Takes and films**: the app's own take log, made with LTX-2.5 (picture and sound): The Great Jam Chase (Ketkout), Taro's video cover
  (his song made with ACE-Step 1.5), Desert Dawn Rescue, Not tonight, Thunder God. Meringue's two takes come from Mixer's Face Dance
  trend (her picture, its motion copied with LTX-2.5) and are shown without their sound.
- **Spice**: the five shipped example shots; their comps were baked by Spice's free compositor.
- **Toaster**: the shipped examples' clay frames and maps; their renders were made with GPT Image from those frames for the examples, as
  the page says under them.
- **Stage renders** (gallery): the shipped example stages, rendered from their clay frames with Qwen Image 2.1.
- **Macaron**: exports of the Comfyture brand and of Little Otter Tea, a fictional brand made through the app (`docs/brand/examples/`).
- **The pets**: their faces from `web/brand/cast` and `web/brand/mixer/crew`; the seven together (`media/pets/lineup.webp`) were drawn
  with Codex's GPT Image from the cast sheets (`docs/brand/cast/*-sheet.png`, Ketkout's from `docs/brand/mascot/`), its dark ground then
  set to the page's colour.
- **Presets**: each preset's poster, preview and painted last frame (`presets/`), on the sample photos made for the repository.

Every character is our own; no real people and no one else's media. Kept off the page on purpose: the Mixer trend shelf (its trend
names are song titles and its covers come from other creators' videos), any trend sound, the Utensils home's sample pictures as if they
were results (they are illustrations drawn for the screen), and the user's own Toaster projects.

## Weight

`media/` is about 30 MB, half of it the 28 presets (their previews load only when one is opened). Every clip is lazy: it loads when it
comes near and plays only while it is seen; with reduced motion nothing plays by itself. The JPGs left in `media/app/` and five stills
in `media/takes/` are not on the page: `scripts/macaron-assets.py` reads them to make Macaron's Comfyture brand pictures.

To look at it locally, serve the folder with a server that answers byte ranges (as GitHub Pages does), or the reel cannot seek:
`npx serve www`, for example. `python3 -m http.server -d www` shows everything but jumps in the reel start it over.
