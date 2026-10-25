# Examples

What a new user finds in each product the first time they open it. Every example here is made with our own cast and our own outputs
(no other creators' media, no real people), and opening one costs nothing.

| Folder | Product | One example is | Put into |
|---|---|---|---|
| [`kitchen/`](kitchen/) | Kitchen | a folder: `example.json` (a story, its edit, the takes it names) beside its files and `runs/<take>/` | `data/stories/`, `data/cuts/`, `data/runs/` |
| [`stage/`](stage/) | Kitchen · Stage | a `<nn>-<name>.stage.json` file (a scene with its sheets and renders, as the Stage exports one) | `data/control/stages/`, as `stage-example-<name>` |
| [`spice/`](spice/) | Spice | a folder: `shot.json` beside its passes (pictures or clips) | `data/spice-shots/` |
| [`jam/`](jam/) | Jam | a folder: `project.json` (the video, its edit, its media) beside its files | `data/jams/`, `data/cuts/` |
| [`macaron/`](macaron/) | Macaron | a `<name>.brand.json` file (a whole brand) | `data/brands/` |
| [`toaster/`](toaster/) | Toaster | a folder: `example.json` (a draft as Toaster keeps it) beside its files | `data/toasts/` |

## The rules (one set, for every product)

[`server/examples.ts`](../server/examples.ts) puts them in, the same way for all:

- an example is put in **the first time it is missing**;
- a **newer version** (its `rev`, or `version`) replaces the copy kept only while nobody has touched it;
- one the person **deleted stays deleted**, and one they **worked on is left alone**;
- one **taken out of this folder** is taken out of the data folder too, unless the person worked on it;
- what went in is noted in the store's ledger (`data/<store>/.seeded`), with its version.

Each product only says where its examples are and how one is put in (`EXAMPLE_KINDS` in [`server/main.ts`](../server/main.ts)).
The Stage's go in by the same rules the first time the Stage opens (`seedStages`); the first file is the newest, so it is the one
that opens, and an install from before the Stage's ledger keeps the copies it has.

## Adding one

1. Make it in the app, on a data folder of its own (`COMFYTURE_DATA=/tmp/x npm start`), with no key so nothing is spent.
2. Copy its project here as the product's format says (below), with its media beside it, small: WebP or JPG for pictures, H.264 MP4 for
   clips, MP3 for sounds.
3. Give it an id that is only letters, digits and dashes, a `name`, an `about` (what it shows, how it was made), and `rev: 1`.
   Raise `rev` when you change it, so untouched copies are refreshed.
4. Check it: start the server on an empty data folder and open the product.

### Toaster: `example.json`

```json
{
  "id": "toast-example-crumpet-bench",
  "rev": 1,
  "name": "Crumpet's workbench",
  "about": "What it shows and how it was made.",
  "thumb": "example:thumb.jpg",
  "body": { "parts": [], "camera": {}, "renders": [{ "photo": { "file": "example:render-1.jpg", "url": "example:render-1.jpg" } }] }
}
```

`body` is the draft exactly as Toaster keeps it (export a project from Toaster's project bar to get one). Every string
`example:<file>` names a file of the example's folder: it is copied into the data folder as `<id>-<file>`, in `photos/`, `videos/`,
`audio/` or `models/` by its kind, and the string becomes the file's name where the key is `file`, its URL everywhere else.

### Spice: `shot.json`

`{ id, rev, name, about, passes: { plate|roto|paint|light|fx|comp: { file, width, height, seconds?, still?, name?, note?, source? } },
set: { roto, fx, ... } }`: each pass's file goes into the library as `<id>-<dept>.<ext>`, and the shot is written with its passes made.
See [`spice/sh010-ketkout/shot.json`](spice/sh010-ketkout/shot.json).

### Jam: `project.json`

`{ name, version, thumb, jam, cut: { id, name, body }, media: [{ file, to, name?, kind? }] }`: each media file (one of the folder's, or
one the app ships under `web/brand/`) is copied to `data/<to>`, the edit goes into `data/cuts`, the video into `data/jams`. The
folder's name is the video's id.
