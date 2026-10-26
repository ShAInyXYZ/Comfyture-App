# Jam v2: the band you pick and an audio director that makes the clip

*Plan of 26 October 2026, from three read-only research passes (the Band code and our casts; the Edit pipeline and the models Comfy Cloud offers; how
music videos are directed and how AI workflows keep a character). Nothing here has been built except what is marked **done**.*

## The idea

Jam already makes a song (**The song**), hears it (**The track**, **The words**), casts a performer and a look (**The band**) and cuts shots on the beat
(**The edit**). Two things are weak. The band is a picture picker with ten crew faces: our own characters hide in a library, a character has no voice,
and nothing the band is reaches the song. The edit makes one look per kind of shot and cuts the same three ideas on every bar: nobody has *directed* the clip.

**v2:** you pick a band (optional) of characters with a voice, a style and a look, the song is sung the way they sing, and an **audio director** reads
the finished song (its sections where they really are, its lyrics on their real times, its beats, its mood) and writes a storyboard of short shots that
tell a story the song stands for, with the band in every shot, lip-sync only where it earns its cost, and the lyrics as an editable layer on top.

## What exists (and what the audits found)

| Piece | State |
|---|---|
| Whole songs, written by Pickle from a real guide, on the owner's workflow | **done** (`knowledge/jam/acestep-guide.md`) |
| Lyrics on the times they are sung at (Demucs vocals, Whisper word times, the written text kept) | **done** (`scripts/lyrics-words.py`, `scripts/jam-lyrics.mjs`, `web/js/lyrics-align.js`): 82 to 90% of the written words matched on 6 of 8 songs |
| Lyrics display under the player; sections and markers placed from that timing | **done** (`web/js/song-lyrics.js`) |
| Director craft rules | **done** (`knowledge/jam/director-guide.md`) |
| The band today | `body.artist` + up to 2 `body.band[]`, a role phrase each; the lead picker offers 10 Mixer crew + "Your photo"; our 6 cast characters only through the library; **Paprika, Crumpet and Taro are in no picker**; no character has a voice (Macaron has a free-text `voice` note: the only one) |
| Voices already in our songs | 9 characters have one in their shipped tags (Praline, Brioche, Paprika, Crumpet, Pickle, Ketkout, Sesame, Truffle, Bagel). Tofu, Taro, Mochi, Meringue and the humans have none |
| A shot today | `{from, to, kind: performance \| dance \| broll}`: no prompt, no character, no camera, no transition. Three hard-coded sentences. 9:16 only, 2 to 10 s. Three distinct start frames for a whole video. One take per shot |
| Lip-sync today | LTX-2.5 with the song's vocals stem, one singer, the distilled model. Shipped example: shot 4 of Moonlit Oolong Walk |
| Kitchen | a storyboard writer (`server/story.ts`), @-tagged character references, a first-frame-per-shot flow, a take log and the Cut editor. Reusable; but text-first, with no times |
| Cut | lyrics are already title items on their own lane, 8 styles, drawn at export: the "lyrics as a layer" half is built |

## Design

### The Band

**Character** (the same record for ours and the user's): `id, name, kind (cast | mine), species, face, picture, sheet?, look, wardrobe, personality,
voice { tags, gender, delivery, language, mode: sing | rap | hum | mime }, perform { style, moves, energy, danceTrend? }, genres`. A **band** is a lead and
up to two members (the existing `MAX_BAND`), snapshotted on the jam as `body.act` so a jam never breaks when a character is edited.

- **Presets.** A static file, as `mixer-trends.js` is: our 19 characters with face, picture, look; the 9 voices copied from their shipped songs; the
  rest drafted once by the writer, reviewed, committed. `danceTrend` from the Mixer trends. Add Paprika, Crumpet and Taro to the picker and to Pickle's `artist` op.
- **A user's own character.** A name and a picture (or one line). The writer (GPT-6 Luna, the app's default) answers the schema as JSON, a clamping reader
  checks it (the voice tags follow the guide's order, no artist names, no BPM or key in them); with no key, an editable form with a keyword fallback.
  The sheet and the portrait are separate priced keys, armed twice (the app's `pay()`), never automatic.
- **Into the song.** `voiceTags(act)` goes into Pickle's setup as a `VOICE:` line with the language; the song page shows "Sung by Praline: ..." and a mismatch
  check on The band warns when the made song's voice disagrees with the lead. A duet is experimental (ACE-Step documents no method): a lead with
  parenthesised backing is the default.
- **Into the video.** Each member's look, wardrobe and style go in the prompts (text only); a mime character turns lip-sync off; a trend's dance becomes the
  default dance reference.

### The Edit: the audio director

1. **Direct it** (about 1 credit, the writer): input = bars, sections (placed by the lyric timing), lines with times, a vocals-stem flag, the vibe, the song's tags
   and mood, the band as tags, a credit budget. Output = the JSON of `director-guide.md`: logline, motif, palette, arc, and shots with `from/to`, type
   (performance, dance, story, broll, abstract, motif), who, who sings, size, camera, prompt, transition, lipsync, why. A server reader snaps every shot to
   a bar, closes gaps, splits a shot over 10 s, and **demotes any lip-sync that fails the sung check** (60% of the shot sung, medium or close, one named singer).
   `plan()` stays as the no-writer fallback.
2. **Stills first.** One first frame per shot (not three for the whole video), drawn with the band as references by tag, priced and previewed before any
   video: the user edits the storyboard here.
3. **Rehearse (free).** The stills held for each shot's slot with Ken-Burns from the camera note, the song and the lyrics layer, rendered with ffmpeg. This is the
   judge's path: no key needed.
4. **Make the video** (priced, armed twice), per shot type, open weights by default: performance = LTX-2.5 with the vocals slice (the singer named in the
   prompt, 10 s at most); story, broll, abstract, motif = image-to-video from the still; dance = the existing pose-guided path. Several takes per shot with a
   picked one, and a retake that keeps the old.
5. **Lyrics layer.** Unchanged in kind: title items restyled any time; never in a frame. Each cue enters at the vocal onset (from the timing), at most 42
   characters and two lines, inside the safe area. A shot links to a line by time overlap.

**The Edit's screen** (one scrollable dashboard, fits 1280x720): the monitor and timeline as now; a **Storyboard** strip of cards (still, times, type, lip-sync
lamp, credit pill, take lamp); a selected-shot editor (prompt, who, camera, type, Redraw, Roll, takes); section names above the ruler and a lyric lane below.
Foot keys: Direct it, Draw stills (N cr), Rehearse (free), Make the video (N cr), Export.

### Models and prices (Comfy Cloud's catalogue today; 211 credits to the dollar)

| Use | Model | Price |
|---|---|---|
| default video, lip-sync and not | LTX-2.5 (open weights) | about 4.8 cr per second |
| optional lip-sync engines, after one approved paid test | Kling Avatar 2.0 12 to 24 cr/s; LTX-2.5 audio-to-video API 39 to 51 cr/s; sync.so 40 cr/s | |
| dance, minute-scale, to try | Wan Dancer; InfiniteTalk; Wan S2V (open weights, 25 to 53 GB, quality and price unknown) | GPU time |
| cheap preview of a partner shot | Seedance 2.5 Draft | preview rate |

A whole 240 s song rolled on LTX alone is about 860 credits: the plan never does that by default. A **budget** is passed to the director, and the user rolls
the shots that matter (the chorus hooks first) and rehearses the rest.

## Build order (each step its own commit, tests first, nothing paid without a price and a yes)

1. **Presets and voices**: `web/js/band-presets.js` (19 characters, the 9 evidence-based voices, `voiceTags`); a node test on shapes and on every picture existing. Free.
2. **Picker, Pickle's `artist` op and `JAM_CREW` use them**; `body.act` written by the cast functions. Extends `tests/jam-band.test.ts`.
3. **Presets shelf in The Band** (a strip of faces with voice chips; fits 1280x720); a headless-browser check with no key.
4. **Song side**: the `VOICE:` line and language into `songPrompt`, the "Sung by" chip, `context()` for Pickle, the mismatch check. Unit tests only.
5. **Video side of the band**: look, wardrobe and style in `withBand` and the prompts; `danceTrend` as the default; mime turns lip-sync off.
6. `server/jam-director.ts`: the brief (from `director-guide.md`), `readShots` (clamp, snap, demote) with `tests/jam-director.test.ts` on canned and broken answers. No network.
7. **Shot schema** (prompt, who, camera, type, lipsync, transition, takes) with old projects and the examples still loading; `plan()` fills it without a writer.
8. `/api/jam/direct` and the Direct it key (about 1 credit, stubbed writer in tests).
9. **Per-shot stills**, a priced key, Ken-Burns in `syncEdit`, **Rehearse** (free). Extends `tests/jam-editor.browser.mjs`.
10. **Storyboard strip** and the selected-shot editor with credit pills; takes with a pick.
11. **User-made characters**: the store, `/api/jam/character`, the Imagine key; the optional sheet and portrait keys.
12. **Shipped example**: Moonlit Oolong Walk gets its `act`, a storyboard and drawn stills (Codex GPT Image, free), a rehearsal film; the Jam tour grows a step.
13. **Behind a flag, after the owner's yes**: one paid lip-sync test per engine; Wan Dancer for dance shots.

## Decisions for the owner

- Which paid tests may be run (one lip-sync clip per engine, about 50 to 250 credits each), and whether Wan Dancer / InfiniteTalk (25 to 53 GB of weights on the local ComfyUI) are worth trying.
- Whether a user-made character may use a picture the writer sees (vision on Luna is **unverified**), or only words.
- Landscape: 9:16 is hard-coded in Jam today. The director can plan 16:9; the video path needs the aspect as a setting.
- Duets: ACE-Step documents no method; the default is a lead plus backing, until a test says otherwise.

## Risks

Identity drifts a few seconds past a first frame (short shots, medium or close, the references every time); partner lip-sync costs 12 to 51 cr/s (a budget
caps it); a real shot schema change touches the project format, the examples and `jam-editor.browser.mjs`; the judge must see it work with no key
(presets, the example's storyboard and the rehearsal are all free and shipped); a song made on Cloud has no heard timing unless "The words" listens
(the estimate by sections is the fallback, and a heard `timing` is stored whenever the local tool or the words step has run).
