# Examples

What a new user finds in each product the first time they open it. Every example here is made with our own cast and our own outputs
(no other creators' media, no real people), and opening one costs nothing.

| Folder | Product | One example is | Put into |
|---|---|---|---|
| [`kitchen/`](kitchen/) | Kitchen | a folder: `example.json` (a story, its edit, the takes it names) beside its files and `runs/<take>/` | `data/stories/`, `data/cuts/`, `data/runs/` |
| [`stage/`](stage/) | Kitchen · Stage | a `<nn>-<name>.stage.json` file (a scene with its sheets and renders, as the Stage exports one) | `data/control/stages/`, as `stage-example-<name>` |
| [`spice/`](spice/) | Spice | a folder: `shot.json` beside its passes (pictures or clips) | `data/spice-shots/` |
| [`jam/`](jam/) | Jam | a folder: `project.json` (the video, its edit, its media) beside its files | `data/jams/`, `data/cuts/` |
| [`songs/`](songs/) | Jam · The song | a folder: `song.json` (a song and what it was made from) beside `track.mp3` and `cover.jpg` | `data/audio/`, `data/photos/` |
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

An example says which passes the app makes with `"build": ["light", "fx", "comp"]`: [`scripts/spice-examples.mjs`](../scripts/spice-examples.mjs) bakes them in the app itself (a headless browser on a lab server of its own, free, no key) and writes them back here, and [`scripts/spice-roto.py`](../scripts/spice-roto.py) cuts the mattes out on this machine. FX's layers can cast their light on the shot (`light`, `reach`) and follow Roto's subject on a clip (`follow`, `pin`); the shot can have a finish (`set.fx.finish: { bloom, vignette }`). The plates of the pictures were drawn with GPT Image from our cast's sheets ([`docs/brand/products/spice-v4/plates.txt`](../docs/brand/products/spice-v4/plates.txt)); the clips are takes from Jam's own videos.

### Jam: `project.json`

`{ name, rev, thumb, jam, cut: { id, name, body }, media: [{ file, to, name?, kind?, cover? }] }`: each media file (one of the folder's, or
one the app ships under `web/brand/`) is copied to `data/<to>` (`audio/`, `videos/`, `photos/` or `reels/`), the edit goes into
`data/cuts`, the video into `data/jams`. The folder's name is the video's id.

- A sound's `cover` is a picture of the folder: it goes into photos as that song's cover, which The song page shows (a song the person
  gave another cover keeps theirs).
- An `.mp4` sent to `reels/` is a finished film, kept as the app's own Export keeps one (a film of the Library, its details beside it);
  `jam.film` names it by that id.
- A video that was only opened is not worked on: Jam measures its song's drop and loudest stretch when it opens one that has none and
  saves them, and a save that changes nothing else keeps the time of the last change (`workOf` in `server/main.ts`).
- `tests/tools/make-showcase-jam.mjs` writes the videos of our own from their folders (Moonlit Oolong Walk here, La Calabaza and Three
  Kittens in `tests/fixtures/jam/`); raise its `REV` when they are made again for good.
- Jam ships Moonlit Oolong Walk and no other video; its songs (below) each come as a jam of their own. La Calabaza and Three Kittens
  were retired on 26 October for their 13 and 15 s songs (ACE-Step makes poor short songs): they are kept in `tests/fixtures/jam/` for
  the browser and seeding tests (`tests/tools/examples-with-fixtures.mjs` puts them back beside the examples). Two more, Toc Toc and
  Hotel Lobby, were retired on 25 October: they played the Mixer trends'
  original recordings (commercial songs, which are no longer in the repository), so their folders are gone, and the rules above did
  the rest: an untouched copy leaves an older data folder at its next start, one that was worked on stays. The sounds and dances they
  copied into `data/audio/` and `data/videos/` (`trend-*-sound.m4a`, `trend-*-dance.mp4`) stay there: only the video and its edit are
  taken out, so those files can be deleted by hand from a data folder that is going to be shared or hosted.

### Jam's songs: `song.json`

`{ id, rev, name, genre, star, about, track, cover, song: { tags, lyrics, bpm, key, language, timesignature, seconds, passes, seed } }`:
the track goes into the audio library as `<id>.mp3`, a song of The song's shelf, with its cover (put into photos as `<id>-cover.jpg`)
and what it was made from (`tags`, `lyrics`, `bpm`, `key`), so a video that takes it as its track has its words and tempo too. Each also
comes as a jam of its own, same id, in Your jams: the song as its track, its cover as its picture, the rest of the video left to make.
The songs go in before the videos, so Jam's video is the newest jam, the one it opens on; the shelf starts with the song of the video
open, then the library.

- `song` holds the settings Jam's song page sends to `/api/audio/song`, its seed with it. The songs are whole, 200 s: ACE-Step makes poor
  short songs, so a part is cut from a whole one later (The track), and The song's shelf only holds songs (a sound under 30 s is a clip).
- They were made with [`scripts/jam-songs.mjs`](../scripts/jam-songs.mjs) on the owner's own ComfyUI with their AceStep1.5XL-Superior
  graph: the app's workflow (`workflows/audio/song.json`, ACE-Step 1.5 XL sft, three passes) with the `jkass_quality` sampler and their
  `AudioQualityEnhancer` master, neither of which Comfy Cloud has (there, the same settings make a song with `heun` (the same method as jkass_quality) and no master, for
  about 5 cents).
- The track ships loudness-matched (-14 LUFS) as a 96 kbps MP3; the cover is an 800 px JPEG drawn with GPT Image from the star's cast
  sheet (the prompts: [`docs/brand/songs/`](../docs/brand/songs/)). Titles, lyrics and covers are our own: no real song, artist or person.
- A song is worked on once the person gives it a cover or a video cover of their own, works on its jam or deletes it: a newer version
  then leaves it as it is.

