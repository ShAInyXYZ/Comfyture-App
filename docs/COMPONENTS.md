# Components: build it once, use it everywhere

This page is for anyone writing code in Comfyture. It has four parts:

1. **The lego catalogue**: the shared pieces that exist today. Reach for these first.
2. **Duplicates found**: pieces built more than once, with evidence, and the one shared piece each should become.
3. **The order to merge them**: safe, high-value merges first, with the tests that guard each one.
4. **Rules for new code**: when to make a shared piece, where it lives, what to call it.

About this audit:

- It was written on 25 October 2026 against commit `55044d4`. It changed no code.
- Line numbers are from that commit. Code moves, so if a range looks wrong, search for the quoted name.
- Every duplicate cites lines that were read. The evidence came from several read-only passes over the code, and a sample of each pass was re-checked against the code. Where two copies are alike only in part, the text says which part. Anything found by reading but not run says so ("likely bug").
- Weight, page errors, accessibility, test status and rights are covered in the [25 October audit](AUDIT.md) and not repeated here. One point from it matters for merging: `tests/jam-editor.browser.mjs` is stale from its windows section on, and two checks in `tests/macaron-ui.browser.mjs` fail. Until they are fixed, they are a weak safety net for Jam and Macaron.
- [README.md](README.md) is the map of all the docs.

---

## 1. The lego catalogue

### Client building blocks (`web/js`)

| Piece | What it does | Used by |
|---|---|---|
| [dom.js](../web/js/dom.js) `h`, `icon`, `sprite`, `pad2`, `ago` | `h("div.cls#id", props, ...children)` builds elements; line icons; sprite icons; two-digit padding; "5 min ago". | 105 files (`h` 102, `icon` 75, `sprite` 54, `ago` 11, `pad2` 4). |
| [controls.js](../web/js/controls.js) `dropdown` | A select: grouped rows, a second line, a meta value (prices), arrows, Enter, Escape. | 13 files, e.g. the model menus, Spice's and Macaron's project chips. |
| [controls.js](../web/js/controls.js) `float`, `stick` | Place a floating panel by its trigger and keep it there while the page scrolls. | dropdown, tilePicker, 3 more. |
| [controls.js](../web/js/controls.js) `tilePicker`, `toggle`, `knob` | A grid of pictures to pick from; an on/off switch; a detented knob. (`selector` has no user.) | home (tilePicker), 3 files (toggle), settings (knob). |
| [pills.js](../web/js/pills.js) `pillField`, `pillText`, `pill`, `expandTags` | Prompts where each `@name` is a pill. The text underneath stays plain. | Story, the chat bar, the Oven, Toaster, home, the Stage. |
| [mentions.js](../web/js/mentions.js) `mentionAt`, `putMention` | The `@word` being typed at the caret, and a name put in its place. | The chat bar, home, the Oven, Toaster. |
| [peek.js](../web/js/peek.js) `peek`, `peekPills` | A hover card with what a name stands for. | Stage, Toaster, every pill field. |
| [tooltip.js](../web/js/tooltip.js) `installTooltips` | Every `title` becomes one shared tooltip, with keycaps. Installed once. | app.js (so: every page). |
| [picker.js](../web/js/picker.js) `openPicker`, `pictureOf`, `onServer` | The add-a-picture popover: computer, our cast, stars, the Library. | 8 files: macaron-assets, macaron-idea, macaron-studio, jam-band, panels/mixer, utensils-fx-controls, utensils, utensils-templates-api. |
| [attach.js](../web/js/attach.js) `attachMenu` | The attach key's frames: computer, Library, the Stage's control maps. | home, Story, the Oven, the chat bar. |
| [viewer.js](../web/js/viewer.js) `view(src, kind)` | Full-screen viewer: zoom and pan a picture, play a video. | 23 files. |
| [saving.js](../web/js/saving.js) `keyedSaver` | One debounced save per key, with `flush` and `drop`. Pure, so it has a node test. | Cut, Jam, Spice, Toaster ([tests/saving.test.ts](../tests/saving.test.ts)). |
| [api.js](../web/js/api.js) `api.*`, `subscribe` | The server's endpoints, the live demo's snapshot, live events. | 26 files. |
| [store.js](../web/js/store.js) `changed`/`onChange`, `toast`, `waitFor`, `inProject` | Scoped redraws, the one toast, waiting on a job, "is this item in the open film". | 97 files. |
| [project.js](../web/js/project.js) `align` | Keeps Story, Shot, Cut and the Stage on the open film. | app. |
| [router.js](../web/js/router.js) `PRODUCTS`, `PAGES`, `currentPage`, `go` | Hash routing for the seven products and Kitchen's rooms. | 28 files. |
| [harnesses.js](../web/js/harnesses.js) `harnessOf`, `barOf`, `offersOf`, `setOffers`, `setRoom`, `tell`, `introOf` | The pets: who answers in the bar, what it says in each room, the chips above it. | The chat bar and 9 more. |
| [tour.js](../web/js/tour.js) + [tours/](../web/js/tours/) | The tour engine. Each product's tour is data. | Every product (merged tonight, see below). |
| [brioche/harness.js](../web/js/brioche/harness.js) `briefOf`, `toolOf`, `promptOf`, `cleanAnswer` | A pet built from specs: each workspace's spec gives the brief, the tool, the prompt and the checked answer. | Macaron (page and server). The other pets don't use it yet (S2). |
| [photo.js](../web/js/photo.js) `normalize`, `imageFrom` | Normalise a picture to JPEG; the first image of a drop or paste. | store (normalize); the Oven and Kitchen's sources (imageFrom). |
| [utensils-home-ui.js](../web/js/utensils-home-ui.js) `drag()` (54-87) | A 0-to-1 drag with pointer capture, arrows, Home and End. | Utensils' home demos, the shelf. The right base for wipes and scrubs (C9, C10). |
| [utensils-audio-wave.js](../web/js/utensils-audio-wave.js) `peaks`, `drawPeaks`; [panels/jam-track-audio.js](../web/js/panels/jam-track-audio.js) `analyse`, `drawBars` | Two waveform modules (see C10). | Utensils audio; Jam's track, stems and song. |
| [panels/editor.js](../web/js/panels/editor.js) `editorParts`, `drawEditor`, `waveCanvas` | Cut's timeline editor. | Cut, and Jam's edit and words. |
| [spice-bake.js](../web/js/spice-bake.js) `loadVideo`, `seekTo` (19-45) | Load a video and seek it reliably. | Spice. Should also serve every "frame of a video" helper (C10). |
| [writer-menu.js](../web/js/writer-menu.js) | The model picker, grouped by maker, with prices. | 5 files. |

### Styles (`web/css`)

| Piece | What it gives | Where |
|---|---|---|
| Tokens | Fonts (`--font-sans`, `--font-mono`), sizes (`--fs-micro` to `--fs-hero`), surfaces (`--bg`, `--s1`-`--s3`, `--card`, `--sunk`, `--line`, `--line2`), ink (`--text`, `--muted`, `--dim`, `--faint`), accent (`--accent`, `--accent-ink`, `--accent-soft`, `--accent-line`), states (`--ok`, `--info`, `--warn`, `--err`), shadows (`--float`, `--float-sm`), radii (`--r-sm`, `--r`, `--r-lg`, `--r-panel`, `--r-screen`, `--r-pill`, scaled by `--corner-k`), spacing (`--sp-1`-`--sp-9`), motion (`--t-fast`, `--ease-out`), `--lamp`. | [material.css](../web/css/material.css) |
| `.label`, `.lamp[data-tone]`, `.seg`, `.field`, `.mono`, `.readout` | Mono eyebrow label; status lamp (tones `ok`, `busy`, `warn`, `crit`, `accent`); segmented progress; input field. | [material.css:124-151](../web/css/material.css#L124-L151) and on. |
| `.key` + `.is-primary`, `.is-quiet`, `.is-accent`, `.is-icon`, `.is-sm`, `.is-mono`, `.is-armed` | The key (button) and its variants. | [app.css:177-210](../web/css/app.css#L177-L210) |
| `.card`, `.card-head`, `.card-num`, `.card-title`, `.card-hint`, `.card-tools`, `.card-label` | The card. | [app.css:137-165](../web/css/app.css#L137-L165) |
| `.chip`, `.chip-thumb`, `.chip-select`, `.pill` | Chips and pills. | app.css:231, 506, 592, 1225 |
| `.tab`, `.tab-thumb`, `.tab-name`, `.tab-close`, `.tab-add` | The project and take tab strip (Shot, Story, Cut, Stage, Toaster). | app.css:52, 69-121 |
| `.sel-*`, `.tile-*`, `.picker`/`.pk-*`, `.attach-*`, `.peek`, `.typing`, `.cmp-*` | The dropdown, tile picker, picture picker, attach menu, hover card, typing dots, the Oven's and Stage's wipe. | app.css |
| `.ctl-project-*` | The "Your projects" window. | [control.css:300-312](../web/css/control.css#L300-L312) (Stage and Toaster) |

### Server (`server`)

| Piece | What it does | Used by |
|---|---|---|
| [examples.ts](../server/examples.ts) `seedExamples`, `placeMedia`, `placeThumb` | Puts each product's examples in by one rule (merged tonight). | main.ts `EXAMPLE_KINDS` (1004-1034); [tests/examples.test.ts](../tests/examples.test.ts). |
| main.ts `projectRoute(kind)` + `readProject`/`writeProject`/`listProjects` | One JSON file per project, list newest first, create, read, update, delete. | [main.ts:614-643](../server/main.ts#L614-L643): stories, cuts, mixes, brands, jams, spice-shots, toasts. |
| main.ts `petAnswer`, `petTurns` | Ask a pet through its tool (Claude) or as JSON (others); the turns, cleaned. | [main.ts:492-508](../server/main.ts#L492-L508): Truffle, Paprika, Crumpet, Praline. |
| [llm.ts](../server/llm.ts) `routerAsk`, `pickLlm`, `defaultLlm`, `takesTools`, `imageBlock` | The writers' models on Comfy Router or in ComfyUI. | every LLM route |
| [media.ts](../server/media.ts) `sendFile`, `imageSize`, `typeFor` | Static files with ranges, ETags and gzip; picture sizes from bytes. | main.ts, macaron.ts ([tests/send-file.test.ts](../tests/send-file.test.ts)) |
| engine.ts `storeImage` (986) | A picture into the Library, named by its hash. | engine, main.ts |
| [judge.ts](../server/judge.ts), [target.ts](../server/target.ts), [limits.ts](../server/limits.ts) | Judge mode's spend gate; where renders go; size limits. | 6, 1 and 3 modules |

---

## 2. Merged tonight

1. **The example seeders** became kinds of one seeder, [server/examples.ts](../server/examples.ts) (commit `855af05`). Spice's shots, Jam's showcases, Macaron's brands and the new Toaster and Kitchen examples are entries of `EXAMPLE_KINDS` ([main.ts:1004-1034](../server/main.ts#L1004-L1034)). They share one rule: in once, a newer version replaces only an untouched copy, a deleted one stays deleted, a retired one goes. Tested by [tests/examples.test.ts](../tests/examples.test.ts).
   - **Left over: the Stage.** Its examples moved to `examples/stage/`, but `seedStages` ([main.ts:850-867](../server/main.ts#L850-L867)) still runs the old rule. It does nothing once `data/control/stages` exists, so a stage example added in a later version never arrives. A stage's id is random (`newStageId`, main.ts:428), so the ledger cannot track it. To finish the merge: give each example stage a fixed id and make it a kind. Effort S. Risk: the Stage page, [tests/examples.test.ts](../tests/examples.test.ts).
2. **The pets' quick chips**: one `offersOf()` in [harnesses.js](../web/js/harnesses.js) (around line 170), drawn by the one chat bar ([panels/assistant.js:544](../web/js/panels/assistant.js#L544)). Toaster's Render page offers its own through `setOffers` ([panels/toaster.js:1036](../web/js/panels/toaster.js#L1036)). Commit `e535c32`. Tested by [tests/harnesses.browser.mjs](../tests/harnesses.browser.mjs).
3. **The tour engine**: [web/js/tour.js](../web/js/tour.js), one engine for every product, with each product's tour as data in [web/js/tours/](../web/js/tours/). It starts from the bar's chip or the header's compass. Commit `6820b59`.

---

## 3. Duplicates found

Each entry gives the copies, how alike they are, the one piece to build, the risk, the effort (S, M, L) and the value. Groups: **S** server, **C** client components, **L** client logic, **K** CSS.

### Server

#### S1. The Stage keeps its own copy of the project store

- **Copies**
  - Shared: `projectRoute` [main.ts:614-643](../server/main.ts#L614-L643), with `readProject`, `writeProject`, `listProjects` (437-453).
  - Stage: types and helpers [main.ts:389-429](../server/main.ts#L389-L429) (`readStage`, `writeStage`, `listStages`), routes [2209-2278](../server/main.ts#L2209-L2278).
- **How alike**: the same logic. One JSON file each. The list is newest first. `PUT` takes a name, a body and a thumb. `DELETE` answers with the list.
  - What differs: `scene` and `renders` instead of `body`, ids start with `stage-`, and the Stage can export and import a shareable file.
- **Build**: one route with a small spec per kind:
  ```ts
  projectRoute(kind, { dir = kind, fields = ["body"], idPrefix = kind.slice(0, 5), key = "project", exportFile?, importFile? })
  ```
- **Risk**:
  - The Stage page reads `{ stage }` and `{ stages }`, not `{ project }`. Keep the keys per kind (`key`) or change `projectsOf` ([control/stage-page.js:1164-1536](../web/js/control/stage-page.js#L1164-L1536)).
  - Judge mode refuses deletes by path ([tests/judge.test.ts](../tests/judge.test.ts) lists `/api/control/stages/…`). Keep that list in step.
  - No unit test calls `projectRoute`. The routes are exercised through the server by [tests/seed.test.ts](../tests/seed.test.ts) (lists), [tests/jam-editor.browser.mjs](../tests/jam-editor.browser.mjs) (`api/cuts` create, read, render) and [tests/toaster-projects.browser.mjs](../tests/toaster-projects.browser.mjs). Nothing tests the Stage's routes.
- **Effort** M. **Value**: about 70 lines. It also lets the Stage join the client store (C1).

#### S2. Pet plumbing, written once per pet

- **The turns, cleaned six ways**
  - `petTurns` [main.ts:502-508](../server/main.ts#L502-L508).
  - Inline at 1290 (Cut and Jam), 1415-1422 (Kitchen's Shot assistant), 1489 (Story), 1515 (Macaron), 2123-2131 (Stage).
  - The limits drift: 1200 or 1500 characters; `did` kept as 8×80, 12×60 or 12×80; only the Stage keeps `failed`.
- **Asking the model, four ways**
  - `petAnswer` ([main.ts:493-500](../server/main.ts#L493-L500), temperature 0.3).
  - Macaron re-writes it inline at [1517-1521](../server/main.ts#L1517-L1521). It uses the writer role (`pickLlm(input.model)`, not `"assistant"`), temperature 0.5 and 4000 tokens.
  - Cut, Jam and Story use `write()` (486-490), with no tool.
  - The Stage uses its own `askClaude` (2144-2147).
- **Asking again when the answer can't be read, three ways**
  - Toaster [1632-1637](../server/main.ts#L1632-L1637) (no `{`).
  - Story [1493-1501](../server/main.ts#L1493-L1501) (`out.broken`).
  - Stage [2150-2153](../server/main.ts#L2150-L2153) (`unreadable`).
- **"The first `{…}` of the reply, else the words as a reply", eleven times**
  - [mixer-assist.ts:94-102](../server/mixer-assist.ts#L94-L102), [spice-assist.ts:162-170](../server/spice-assist.ts#L162-L170), [toaster-assist.ts:207-216](../server/toaster-assist.ts#L207-L216), [utensils-assist.ts:240-248](../server/utensils-assist.ts#L240-L248), [cut.ts:670-678](../server/cut.ts#L670-L678), [assistant.ts:120-129](../server/assistant.ts#L120-L129), [engine.ts:149-157](../server/engine.ts#L149-L157), [story.ts:104-112](../server/story.ts#L104-L112), [web/js/brioche/harness.js:192-200](../web/js/brioche/harness.js#L192-L200).
  - Two more copies come with their own JSON mender: [control.ts:572-588](../server/control.ts#L572-L588) (`mendJson`) and [story.ts:217-222](../server/story.ts#L217-L222) (`loose`).
  - The fallback words differ: "I didn't catch that…", "I didn't get that…", "Sorry, I lost my words…", "I answered without building anything…".
- **The field sanitizers, copied**
  - `cut`, `list`, `things`, `num`, `oneOf`, with identical bodies, in [mixer-assist.ts:62-65](../server/mixer-assist.ts#L62-L65), [spice-assist.ts:114-121](../server/spice-assist.ts#L114-L121), [toaster-assist.ts:136-143](../server/toaster-assist.ts#L136-L143) and [utensils-assist.ts:108-111](../server/utensils-assist.ts#L108-L111).
  - Cousins: `str`/`int` (assistant.ts:56, 117), `text` (main.ts:229, story.ts:9, song.ts:7), and `num`/`oneOf`/`hex` with defaults (utensils-edit.ts:74-78, utensils-fx.ts:95-99).
- **Only Brioche is built from specs** ([web/js/brioche/harness.js](../web/js/brioche/harness.js)). Paprika, Truffle, Crumpet and Praline each hand-write the same four parts: a brief string, a tool schema, a prompt builder and a reader. For Paprika these are [spice-assist.ts:26-77](../server/spice-assist.ts#L26-L77) (tool), 79-94 (brief), 124-156 (prompt) and 162-276 (reader).
- **Build**: `server/pets.ts`:
  ```ts
  turnsOf(messages, { keep = 12, chars = 1200, did = [8, 80], failed = false }): Turn[]
  askPet({ model, brief, tool, prompt, image?, maxTokens?, temperature?, again?: (reply) => string | null }): Promise<string>
  firstJson(reply): { raw } | { words }          // one mender for every reader
  const sane = { cut, list, things, num, oneOf, hex, text }
  ```
  Later, generalise `brioche/harness.js` into `web/js/pet-harness.js` and move the other four pets onto specs, one at a time.
- **Risk**: low for the first three parts, which are well tested. [tests/harnesses.test.ts](../tests/harnesses.test.ts) runs every reader (`readSpiceAnswer`, `readMixerAnswer`, `readUtensilsAnswer`, `readCutAnswer`, `readMacaronAnswer`, `readAnswer`, `readControlAnswer`, `readStoryAssist`). Also covered by [spice-assist.test.ts](../tests/spice-assist.test.ts), [toaster-assist.test.ts](../tests/toaster-assist.test.ts), [brioche-harness.test.mjs](../tests/brioche-harness.test.mjs), [cut.test.ts](../tests/cut.test.ts), [utensils-knowledge.test.ts](../tests/utensils-knowledge.test.ts), [comfy-apps.test.ts](../tests/comfy-apps.test.ts) and the macaron tests.
  - Watch the fallback words: tests may assert them.
  - Macaron's model role is a behaviour change. Decide it on purpose.
- **Effort**: S for `turnsOf`, `firstJson` and `sane`; M for `askPet` with retries; L for moving the pets onto specs. **Value**: 6 turn cleaners, 11 JSON preambles, 4 copies of 5 sanitizers, 3 retry loops. About 120 lines now, and more with specs.

#### S3. Two ffmpeg job runners that are twins (Utensils' Edit and FX)

- **Copies**: [utensils-edit.ts](../server/utensils-edit.ts) against [utensils-fx.ts](../server/utensils-fx.ts):
  - `EditError` 24-30 / `FxError` 28-34; `atempoChain` 162-170 / 184-192 (identical); `VENC`, `AENC`, `FAST`, `EVEN` 156-159 / 173-176 (identical).
  - `probe` 419-431 / 476-488 (FX also clamps fps to 1-120); `exists` 433-440 / 490-497; `sha` 442-447 / 499-504.
  - `JobState` 465-473 / 516-524 (identical); `why()` 476-479 / 527-530 (identical); the two-slot queue `slot`/`free` 492-501 / 554-564 (identical); `keep` 516-528 / 573-586.
  - `runStep` with `-progress` parsing 573-592 / 638-661; `start` 595-625 / 677-715; `view` 627 / 717 (identical); `preview` 630-651 / 720-743; the jobs route in `handle` 691-701 / 758-768 (identical).
- **The page side is a twin too**: [web/js/utensils-edit-api.js](../web/js/utensils-edit-api.js) and [web/js/utensils-fx-api.js](../web/js/utensils-fx-api.js) differ only in the base path and the extra calls. Both start a job, poll it every 250 ms, stop it, preview and probe.
- **Build**:
  - `server/ffmpeg-jobs.ts`: `createJobs({ data, slots: 2 })` → `{ start(tool, prepare, plan, keep), view, stop, route(method, rest) }`, plus `probe`, `exists`, `sha`, `why`, `atempoChain`, the encoder constants and one `MediaError`.
  - The page: `jobsApi(base)` → `{ run, stop, preview, probe }` in `web/js/jobs-api.js`.
- **Risk**: low to medium. [tests/utensils-edit.test.ts](../tests/utensils-edit.test.ts) and [tests/utensils-fx.test.ts](../tests/utensils-fx.test.ts) cover both (`createEdit`, `createFx`, `atempoChain`, `capabilities`); [tests/spice.browser.mjs](../tests/spice.browser.mjs) uses FX's capabilities. Keep the fps clamp.
- **Effort** M. **Value**: about 250 server lines and 35 page lines.

#### S4. Keeping media by its hash, and probing it

- **"sha256 of the bytes, 16 characters, into `data/<shelf>`", written twelve times**:
  - engine.ts:986 `storeImage`.
  - main.ts: [193-213](../server/main.ts#L193-L213) `storeVideo`, 679-687 `keepAudio`, 1306-1325 (a video's sound), 1754-1759 (Spice's bake), 1785-1791 (`keep` for video jobs), 1900-1905 (Mixer's controls), 2374-2378 (samples).
  - macaron.ts:92-97 `keepExport` (named slug plus 8 characters), comfy-templates.ts:1149-1175, utensils-edit.ts:516-528, utensils-fx.ts:573-586.
- **ffprobe, wrapped six ways**: main.ts:215-222 `probeVideo`, main.ts:667-678 `probeMedia` (cached), utensils-edit.ts:419-431, utensils-fx.ts:476-488, comfy-templates.ts:1179, and macaron.ts:175-180 and 202 inline.
- **`exists()`, defined six times**: main.ts:181-188, engine.ts:299, presets.ts:26, utensils-edit.ts:433, utensils-fx.ts:490, comfy-templates.ts:1002.
- **Build**: `server/library.ts`:
  ```ts
  keepFile(bytes, { shelf, ext, name? }) → { file, url, ...probe }
  probe(path)   // one ffprobe, cached
  exists(path)
  ```
  Macaron's named exports can keep their own names through a `name` option.
- **Risk**: the URLs must stay `/media/<shelf>/<hash>.<ext>`, because projects store them. Tests: [examples.test.ts](../tests/examples.test.ts), the utensils-edit and utensils-fx tests, [send-file.test.ts](../tests/send-file.test.ts).
- **Effort** S-M. **Value**: about 20 places, about 100 lines.

#### S5. Three Comfy Router request builders

- **Copies**: [router-images.ts:178-204](../server/router-images.ts#L178-L204) `routerDraw`, [router-videos.ts:117-149](../server/router-videos.ts#L117-L149) `routerVideo` (with `why` at 106), [llm.ts:64-80](../server/llm.ts#L64-L80) `routerAsk`.
- **How alike**: all three use the same URL (`https://api.comfy.org/v2/models/<path>`), the same headers (`X-API-Key`, `Idempotency-Key`) and the same error digging (`out.error.message`, `out.message`, `out.detail`). Two of them also read credits from `x-comfy-credits-used` and fetch the result's URL when it isn't base64.
- **Build**: `server/router.ts` with `routerPost(path, body, { signal })` → `{ out, credits }`, `routerError(name, res, out)` and `bytesOf(answer)`.
- **Risk**: no test calls these, because they spend credits. Add a test with a stubbed `fetch`, as [tests/account.test.ts](../tests/account.test.ts) does for the balance.
- **Effort** S. **Value**: 3 places, about 40 lines.

#### S6. Small JSON files under `data/`

- **Copies**: `readPoses`/`writePoses` [main.ts:349-360](../server/main.ts#L349-L360), `readModels`/`writeModels` 369-380, `readAudioIndex`/`noteAudio` 649-665, Mixer's stars 1870-1885.
- **How alike**: the same "read JSON, else an empty value; make the folder, write". Only `noteAudio` chains its writes. Mixer's stars write without making the folder first.
- **Build**: `readJson(path, fallback)` and `writeJson(path, value)`, serialised per path, in `server/library.ts`.
- **Risk**: low. **Effort** S. **Value**: 4 places, about 30 lines, and no lost writes.

### Client components

#### C1. The project store, written eight times

- **Copies** (load, open, new, save, rename, duplicate, remove, last opened):
  - [jam.js:64-144](../web/js/jam.js#L64-L144)
  - [spice.js:62-176](../web/js/spice.js#L62-L176)
  - [toaster.js:101-254](../web/js/toaster.js#L101-L254)
  - [mixer.js:50-120](../web/js/mixer.js#L50-L120)
  - [macaron.js:75-211](../web/js/macaron.js#L75-L211)
  - [story.js:136-250](../web/js/story.js#L136-L250)
  - [cut.js:145-306](../web/js/cut.js#L145-L306)
  - [control/stage-page.js:1164-1536](../web/js/control/stage-page.js#L1164-L1536) (`projectsOf`)
- **How alike**: the same logic against the same REST shape (`PUT {name, body, thumb}` to `api/<kind>/<id>`, then patch the list row). The drift:
  - Autosave delay: Jam, Mixer and Macaron wait 400 ms, Spice 500, Toaster 600, Cut 800, Story 900, the Stage 1200.
  - After a save, Story and Cut never update `updatedAt`.
  - Jam, Mixer, Macaron and Spice write `thumb: undefined` into the row. Cut and Toaster guard against it.
  - On a load error, only Toaster retries.
  - Mixer's `openMix` doesn't flush first; Macaron's resets about 10 view fields by hand.
- **Build**: `web/js/projects.js`:
  ```js
  projectStore(kind, { state, key, blank, normalize, thumb, name, delay = 500, remember, tabs, first: "new" | "none", onOpen })
  // → { load, open, create, save, saveNow, flush, rename, duplicate, remove, close, patch, saving }
  ```
  It writes `state.list`, `state[key]`, `state.ready` and `state.error`, so the panels keep reading `spice.shot` and `jam.jam`. It is built on `keyedSaver` and `local` (L2).
- **Risk**: each product's reset-on-open moves into `onOpen` (macaron.js:92-113, toaster.js:132-146, Cut's quiet open, Jam's edit). Tests: [saving.test.ts](../tests/saving.test.ts), [macaron-ui.browser.mjs](../tests/macaron-ui.browser.mjs) ("a save waiting for its 400 ms is not lost"), [jam-editor.browser.mjs](../tests/jam-editor.browser.mjs) (renames), [spice.browser.mjs](../tests/spice.browser.mjs), [toaster-projects.browser.mjs](../tests/toaster-projects.browser.mjs), [toaster.browser.mjs](../tests/toaster.browser.mjs). No test drives new, duplicate, close or delete for Story, Cut, Mixer or the Stage. Write a node test of `projectStore` with `fetch` stubbed first.
- **Effort** L, or M for Jam, Spice, Toaster, Mixer and Macaron first. **Value**: 8 stores, about 500 lines.

#### C2. Autosave timers and "saved" lamps

- **Copies**
  - `keyedSaver` is used by [cut.js:153](../web/js/cut.js#L153), jam.js:126, spice.js:153 and toaster.js:180.
  - Own timers instead: [story.js:136-168](../web/js/story.js#L136-L168) (one `saveTimer`, 900 ms), [mixer.js:94-109](../web/js/mixer.js#L94-L109), [macaron.js:165-194](../web/js/macaron.js#L165-L194) and stage-page.js:1358-1365 (1200 ms). store.js:67-77 and 739-749 do the same for localStorage.
  - Three saved lamps: the Stage (stage-page.js:1217, 1323-1326), Toaster (toaster.js:125-130, drawn in toaster-projects.js:62 and 133-139) and Story (panels/story.js:278, which always says "Saved"). The Stage's and Toaster's lamps have the same tooltips ("Not saved yet", "Changed — saving in a moment", "Saved HH:MM").
- **Bugs found by reading (not run)**
  - **Deleting the open story after any edit toasts "No such project."** `deleteStory` ([story.js:245-250](../web/js/story.js#L245-L250)) deletes, then `closeStory` opens another story. `openStory` (211) sees `saveTimer`, which is never reset after a save (167). It then sends a `PUT` for the deleted story (160), and the server answers 404 ([main.ts:626-627](../server/main.ts#L626-L627)). Cut avoids this by dropping the pending save (`forgetCut`, [cut.js:157, 297](../web/js/cut.js#L295-L301)). Moving Story onto `keyedSaver` fixes it.
  - **Likely**: deleting a mix while its save is pending sends a `PUT` after the `DELETE` (mixer.js:112-120). Reopening a mix within 400 ms can read the old body (openMix doesn't flush).
  - **Likely**: `keyedSaver` doesn't wait for the previous send of the same key (saving.js:13-19), so two `PUT`s can overlap and the older body can land last. Only Macaron chains its writes (macaron.js:163-180).
  - **Likely**: no `pagehide` or `beforeunload` flush exists anywhere in `web/`, so edits made in the last moment before the tab closes are lost.
- **Build**
  - `keyedSaver` gains per-key chaining (from Macaron) and an `onState(key, tone)` callback.
  - One `saveLamp(store)` element serves the Stage, Toaster and Story.
  - One `pagehide` handler flushes every store.
- **Risk**: extend [saving.test.ts](../tests/saving.test.ts) for chained sends. [toaster-projects.browser.mjs](../tests/toaster-projects.browser.mjs) checks the lamp, Ctrl+S and the `.ts-saved` tooltip.
- **Effort** S-M. **Value**: 4 hand-made timers and 3 lamps (about 65 lines), plus the fixes.

#### C3. Project bars, tabs, chips and "Your projects" windows

- **Tab bars**
  - The Stage ([stage-page.js:1217-1306](../web/js/control/stage-page.js#L1217-L1306)) and Toaster ([panels/toaster-projects.js:44-158](../web/js/panels/toaster-projects.js#L44-L158)) are the same bar. `showPreview` and `renameField` (stage-page.js:1241-1268 against toaster-projects.js:82-109) differ only in `el`/`h`, one label and the redraw call (checked with `diff`).
  - Story ([panels/story.js:42-69](../web/js/panels/story.js#L42-L69)) and Cut ([panels/cut.js:103-127](../web/js/panels/cut.js#L103-L127)) are line-for-line copies. Their tabs have `tabindex="0"` but no keydown, so they can't be opened from the keyboard.
  - Shot's take strip ([panels/tabs.js:12-135](../web/js/panels/tabs.js#L12-L135)) has the same wheel scrolling and the same preview placement (`Math.min(innerWidth - 256, box.left)`).
  - The shell (`div.subbar > div.subbar-in > nav.tabs + div.subbar-actions`) is written five times: index.html:84-89, stage-page.js:70-72, toaster-projects.js:63-76, panels/story.js:55-56, panels/cut.js:113-115.
  - The CSS is copied too: [toaster-projects.css:2-8](../web/css/toaster-projects.css#L2-L8) repeats [control.css:12-18](../web/css/control.css#L12-L18) rule for rule.
- **"Your projects" window and import**: stage-page.js:1469-1488 against toaster-projects.js:210-236 (same `dialog.ctl-projects-window` and cards). Import: stage-page.js:1448-1466 against toaster-projects.js:192-207.
- **Project chip with a settings window**: Spice ([panels/spice.js:79-121](../web/js/panels/spice.js#L79-L121)) and Macaron ([panels/macaron.js:156-224](../web/js/panels/macaron.js#L156-L224)) use the same `dropdown` pattern with "new" and "settings" rows, and the same comment. Jam builds its own menu (panels/jam.js:30-48, 180-184).
- **Project rows and cards**: Jam (panels/jam.js:35-40), Mixer (panels/mixer.js:393-398), the Stage and Toaster cards, Kitchen home (panels/home.js:648-681).
- **Behaviour drift**: closing the open tab goes to the first tab in Story and Cut, but to the neighbouring tab in the Stage and Toaster. A first visit opens 6 tabs in Story and Cut, 8 in the Stage and none in Toaster.
- **Build**: promote toaster-projects.js to `web/js/panels/project-bar.js`:
  ```js
  projectBar({ store, noun, blank, tabsKey, show, keys: ["browse", "duplicate", "export", "import", "delete"], extra }) // → { el, draw }
  tabStrip(nav, { items, sig, tab, add })      // also Shot's strip
  projectsWindow({ store, title, blank }); projectChip({ store, label, onSettings }); projectCard(row, { open, remove, layout })
  ```
- **Risk**: [toaster-projects.browser.mjs](../tests/toaster-projects.browser.mjs) selects `.ts-tabs .tab`, `.tab-close`, `.tab-name`, `.tab-add`, `.tab-rename`, `.ts-saved` and `.ctl-project-card`, so keep those names. [macaron-ui.browser.mjs](../tests/macaron-ui.browser.mjs) reads `.mcb-brand .sel-label`. [jam-editor.browser.mjs](../tests/jam-editor.browser.mjs) clicks `.jm-jam` and `.jm-menu-open`. No test covers the Stage, Story or Cut bars.
- **Effort** M. **Value**: 5 bars, 2 windows, 3 chips, 4 card lists; about 400 lines and 6 CSS rules.

#### C4. Two-press keys: "Yes, spend it" and "Click again to delete"

- **Price keys** (the first press shows the price, the second spends):
  - [panels/jam-band-pay.js:5-33](../web/js/panels/jam-band-pay.js#L5-L33) (6 s)
  - [spice-ui.js:89-120](../web/js/spice-ui.js#L89-L120) (8 s, with a pay-key builder)
  - [toaster.js:1070-1079](../web/js/toaster.js#L1070-L1079) (8 s, the same code as Spice's)
  - [utensils-space-vfx.js:208-241](../web/js/utensils-space-vfx.js#L208-L241) (8 s)
  - [utensils-space-audio.js:91-110](../web/js/utensils-space-audio.js#L91-L110) (8 s)
  - [utensils-space-templates.js:359-366](../web/js/utensils-space-templates.js#L359-L366) (6 s)
  - Macaron's mockup key ([macaron-mockup.js:127-131](../web/js/macaron-mockup.js#L127-L131), through `arming`)
  - The labels drift: "Yes, spend it", "Yes, run it", "Yes, place it", "Press again to start".
- **Delete keys**: [macaron-ui.js:222-233](../web/js/macaron-ui.js#L222-L233) `arming` (3 s, about 28 call lines), stage-page.js:1219-1229 (2.5 s), toaster-projects.js:44-57, panels/story.js:26 and 64-68, panels/cut.js:119-127, panels/jam.js:40, panels/mixer.js:398, panels/home.js:261-267, spice-ui.js:117-121, panels/library.js:17-27 and panels/takes.js:80-86 and 148-153. The last two never time out.
- **How alike**: the same logic (arm by id, time out, run on the second press). The timeouts drift: 2.5, 3, 6 or 8 s, or never.
- **Build**: in `controls.js`, `twoStep(key, run, { ms = 3000, armed: "Click again to delete" })`; and `payKey({ id, label, price, run, free })` (8 s, "Yes, spend it" plus "Not now"), built from Spice's.
- **Risk**: [toaster-projects.browser.mjs](../tests/toaster-projects.browser.mjs) ("one click on Delete only asks"), [spice.browser.mjs](../tests/spice.browser.mjs), [toaster.browser.mjs](../tests/toaster.browser.mjs), [utensils-apps.browser.mjs](../tests/utensils-apps.browser.mjs). A paid run must never start from one press (a standing rule of this repo), so every paid key keeps its second press.
- **Effort** S. **Value**: about 18 places, about 120 lines.

#### C5. The pet's card at the head of each left panel

- **Copies**: each is a face, a bold name and a small tag.
  - Spice: [panels/spice.js:134-137](../web/js/panels/spice.js#L134-L137) `div.sp-id`, plus an "Ask Paprika" key.
  - Jam: [panels/jam.js:59-61](../web/js/panels/jam.js#L59-L61) `div.jm-pet`.
  - Toaster: [panels/toaster.js:85](../web/js/panels/toaster.js#L85) `div.ts-id`.
  - Utensils home: [utensils-home-head.js:21-23](../web/js/utensils-home-head.js#L21-L23) `div.hp-pet`.
  - Utensils ledge: [panels/utensils.js:45-46](../web/js/panels/utensils.js#L45-L46) `div.ut-ledge-pet`, with its line at 201.
- **Styles**: [sp-shell.css:22-29](../web/css/sp-shell.css#L22-L29), [jm-shell.css:14-18](../web/css/jm-shell.css#L14-L18), [toaster.css:169-173](../web/css/toaster.css#L169-L173), [ut-home.css:23-28](../web/css/ut-home.css#L23-L28), [ut-shell.css:39-40](../web/css/ut-shell.css#L39-L40).
- **How alike**: the same look, with drift:
  - Face size: 2.75rem; `clamp(3.5rem, 8dvh, 4.75rem)`; `clamp(4rem, 8.4dvh, 5.25rem)`; `clamp(7rem, 9.5vw, 9.5rem)`; or a 4.75rem rounded square.
  - Ring: 1px or 2px.
  - Tag: mono uppercase (Jam, Utensils home) or muted sans (Spice, Toaster).
  - None uses `introOf()` from harnesses.js, which already says "Name · tag".
- **Build**: `petCard(product, { size: "s" | "m" | "l", say, ask })` in `web/js/pet-card.js`, reading the harness, with one `.pet-card` style (sizes as modifiers).
- **Risk**: small. Tests that look at these heads: [harnesses.browser.mjs](../tests/harnesses.browser.mjs), [spice.browser.mjs](../tests/spice.browser.mjs), [toaster.browser.mjs](../tests/toaster.browser.mjs).
- **Effort** S. **Value**: 5 places, about 40 lines of JS and 30 of CSS.

#### C6. Bringing a file in: inputs, uploads, drops, "where from" menus, Library grids

- **Hidden "file from the computer" input, built about 15 times**
  - Named helpers: macaron-ui.js:208-213 `chooseFiles`, panels/jam-ui.js:78-83 `pickFile`, panels/mixer.js:49-53, utensils.js:190-194, utensils-audio-mix.js:166-170, utensils-edit-controls.js:46-51, spice-engines.js:178-187, panels/toaster.js:296-302, stage-page.js:680-685.
  - Inline: utensils-audio-bench.js:32-46, macaron-ugc-win.js:49-53, utensils-templates-api.js:122-124, utensils-space-edit.js:79-83, panels/editor.js:579-590.
  - Dead code: panels/image.js (127, 164, 182) and panels/assistant.js (228, 279) build an input that is never clicked.
- **Uploads**
  - "Upload by kind" is written five times: utensils.js:201-234, utensils-templates-api.js:101-113, spice-engines.js:124-143, store.js:1394-1423, panels/home.js:310-333.
  - Hand-made `POST`s to `api/photos` instead of `api.upload`: panels/toaster.js:286-288 and stage-page.js:670-672 (twins), toaster.js:1054-1055, stage-page.js:570-572 and 876-881, control/remote.js:804-806, panels/story.js:34-35 (no error handling), panels/home.js:294-299.
  - "Fetch a URL, then upload the blob": `onServer` [picker.js:10-13](../web/js/picker.js#L10-L13) and `inLibrary` [macaron.js:1255-1260](../web/js/macaron.js#L1255-L1260) are the same memoised map. There are 6 more copies.
- **Drops and pastes**
  - Page-wide handlers, each checking its page and routing by type: panels/home.js:334-358, panels/jam.js:186-199, panels/macaron.js:286-299, panels/mixer.js:433-447, panels/spice.js:222-238, panels/utensils.js:231-245, utensils-space-edit.js:88-110, panels/sources.js:377-384.
  - Element drop zones, with three highlight classes (`.is-over`, `.is-drop`, `.is-dropping`): picker.js:91-99, panels/sources.js:48-64, panels/story.js:93-96, panels/toaster.js:303-310, stage-page.js:745-748, utensils-space-templates.js:143-152, panels/cut.js:61-71.
- **Library grids**
  - Four grids of the user's pictures, each with the same filter and the same empty words: picker.js:68-84, [attach.js:42-66](../web/js/attach.js#L42-L66), panels/toaster.js:319-354 and stage-page.js:693-721.
  - Five separate loads of `api/photos`, besides `loadPhotos` in store.js:1146-1148.
- **Own "where from" menus**, each with its own outside-click and Escape: panels/toaster.js:361-383 (computer, Library, the Oven), stage-page.js:734-743, macaron-studio.js:24-54 `pickAsset`, utensils-audio-mix.js:219-237 (sounds). The popover plumbing itself (close, outside, Escape, placement) is also copied between picker.js:25-33 and 100-120 and [attach.js:20-29 and 104-121](../web/js/attach.js#L104-L121).
- **The reference-sheet editor**: stage-page.js:642-760 `openSheet` against panels/toaster.js:433-452 and 969-983. Same feature, same words ("A sheet holds N pictures."). Only the cap differs (8 against 6).
- **Build**
  - `chooseFiles({ accept, multiple }) → Promise<File[]>` and `onFiles(target, { when, accept, paste, onFiles })`, with one `.is-drop` class.
  - `web/js/media.js` `keep(fileOrBlobOrUrl, { kind?, name? })`, which detects the kind, measures sounds, memoises URLs and passes existing photos through, plus `labelOf(file)`.
  - `libraryGrid({ kind, isOn, onToggle })` on one cached `library.photos()`.
  - `openPicker` grows `own: [...]`, `make()` (the Oven) and `kind: "audio"`, so the four menus become calls.
  - One `popover(anchor, el, { place })` for the plumbing shared by picker, attach, dropdown and tilePicker.
- **Likely bugs (from reading, not run)**
  - `api.uploadAudio` ([api.js:46](../web/js/api.js#L46)) sends no name, so every uploaded sound is filed as "Sound" ([main.ts:1329](../server/main.ts#L1329)).
  - A video's sound comes back with no length (main.ts:1306-1325), and three callers keep `seconds: undefined`: jam-song.js:108-116, utensils-audio-mix.js:233, utensils-audio-bench.js:38-39.
  - Macaron's moodboard says "Drop pictures here" (macaron-idea.js:224) but has no drop handler. The page-wide handler (panels/macaron.js:288-292) files the picture among the project's pictures instead.
- **Risk**: `normalize()` re-encodes to JPEG, so it must stay opt-in (logos and cut-outs need transparency). Tests: [toaster.browser.mjs](../tests/toaster.browser.mjs) (paste, add menu, Library toggles), [utensils-apps.browser.mjs](../tests/utensils-apps.browser.mjs) (drop on `.ut-tpl-well`), [spice.browser.mjs](../tests/spice.browser.mjs), [song-cover.browser.mjs](../tests/song-cover.browser.mjs), [jam-editor.browser.mjs](../tests/jam-editor.browser.mjs), [macaron-ui.browser.mjs](../tests/macaron-ui.browser.mjs). No test drives `openPicker`'s or `attachMenu`'s own DOM, and the page-wide drop handlers are untested.
- **Effort**: M-L in all; do inputs and drops (S) first. **Value**: about 80 places, about 500 lines.

#### C7. Utensils' input wells and results

- **Wells**: utensils-bench.js:113-123 `inputWells`, utensils-fx-controls.js:39-45 `pictureWell`, utensils-vfx-bench.js:18-30, utensils-audio-bench.js:22-51 and 133-135, utensils-edit-controls.js:190-211, utensils-space-templates.js:131-154. They share identical markup (`button.ut-well-pic`, `span.ut-well-text`, a "Take it out" key) and one style (ut-picture.css:56-62).
- **Results**:
  - The result stage is drawn three times: utensils-bench.js:149-168, utensils-space-templates.js:257-265, utensils-edit-stage.js:257-265.
  - Result strips: utensils-bench.js:170-181 and utensils-space-edit.js:226-240 are near-identical, and there are 3 more.
  - Result keys (hand on, download, forget): 4 copies.
- **Build**: `well({ kind, value, label, hint, pick, clear, drop })`, `resultStage`, `resultStrip` and `resultKeys`, all in utensils-bench.js.
- **Risk**: [utensils-apps.browser.mjs](../tests/utensils-apps.browser.mjs). The rest is untested.
- **Effort** S-M. **Value**: about 16 places, about 160 lines.

#### C8. Thumbnails, media cards, hover-play, download keys

- **Thumbnail by kind** (a picture, a muted `video#t=`, or a sound glyph), about 14 places: panels/utensils.js:125, utensils-bench.js:119, panels/assistant.js:131-137 `thumb`, spice-ui.js:140-144 `thumb`, panels/cut.js:34-36, panels/takes.js:17-27, panels/tabs.js:12-18, panels/library.js:48-50, and more.
- **A take's still**, computed four times: takes.js:22, library.js:50, tabs.js:14 and 29, monitor.js:18-19.
- **Film card twins**: [panels/library.js:71-90](../web/js/panels/library.js#L71-L90) and [panels/takes.js:147-169](../web/js/panels/takes.js#L147-L169) share the badge, the length, the download link, a two-step delete and the viewer. `slug` is identical in both (library.js:14, takes.js:145).
- **Download keys** built by hand with `?download=`: about 18.
- **`keep(key, make)` element caches**: jam-ui.js:85-87, utensils-bench.js:17-18 and mixer.js:42-47 are identical, and none ever evicts.
- **Build**: in media.js, `thumbOf(item, { at })`, `runStill(run)`, `mediaCard({ item, badge, actions, hoverPlay })`, `downloadKey(url, name)` and `keepEl`.
- **Risk**: [song-cover.browser.mjs](../tests/song-cover.browser.mjs). The Kitchen Library and the take log are untested.
- **Effort** M. **Value**: about 40 places, about 150 lines.

#### C9. Before/after wipes, built eight times

- **Copies**:
  - [utensils-bench.js:23-44](../web/js/utensils-bench.js#L23-L44) `compare` (`--split`, no keyboard)
  - [panels/image.js:424-457](../web/js/panels/image.js#L424-L457) `compareView` (the Oven: `--x`, a `role=slider` handle, arrow keys)
  - [control/stage-page.js:1003-1031](../web/js/control/stage-page.js#L1003-L1031) (the same handle and keys as the Oven, copied; it already shares the Oven's `.cmp-*` CSS)
  - [panels/toaster.js:1162-1173](../web/js/panels/toaster.js#L1162-L1173) `comparePic` (inline clip-path, no keyboard)
  - [spice-viewer.js:273-300](../web/js/spice-viewer.js#L273-L300) (`--wipe`, arrows ±0.05)
  - utensils-home-picture.js:22-48 and utensils-home-vfx.js:27-48 (through `drag()`)
  - welcome-popular.js:57-71 (follows the pointer)
- **How alike**: the same logic: a fraction from the pointer's x, a CSS variable, a clip. There are three keyboard schemes, and two copies have no keyboard at all.
- **Build**: `wipe(el, { value, onChange, keys })` in controls.js, built on `drag()` (moved from utensils-home-ui.js), with one `.wipe` style.
- **Risk**: tests read the current names. [spice.browser.mjs](../tests/spice.browser.mjs) reads `--wipe`, [oven.browser.mjs](../tests/oven.browser.mjs) `.img-compare`, [toaster.browser.mjs](../tests/toaster.browser.mjs) `.ts-wipe`, [utensils-apps.browser.mjs](../tests/utensils-apps.browser.mjs) `.ut-compare`. Keep the names or update the tests in the same commit.
- **Effort** S-M. **Value**: 8 places, about 120 lines, and every wipe works from the keyboard.

#### C10. Scrubbing, ranges, transports, waveforms

- **Scrub** (time from the pointer's x, with pointer capture), about 9 places: stage-page.js:432-442, utensils-edit-stage.js:103-115, utensils-vfx-stage.js:208-219, jam-track.js:184-194, panels/editor.js:608-614, spice-viewer.js:372-385, panels/mixer.js:317-327, panels/jam-words.js:205-213, utensils-audio-mix.js:204-217.
- **In/out range drags**:
  - [spice-viewer.js:432-470](../web/js/spice-viewer.js#L432-L470) and [spice-fx.js:308-345](../web/js/spice-fx.js#L308-L345) `framesStrip` are near-identical.
  - Also utensils-edit-stage.js:116-136 and jam-track.js:336-390.
- **Word timing**: panels/inspector.js:174-207 (Cut) and panels/jam-words.js:43-75 (Jam) do the same thing. Each moves a word's start between its neighbours, rounds it to 0.01, and ends the previous word there.
- **Transports**: about 14 "play key that follows the media" copies, each with its own "a / b" time.
  - Only three of them stop the other sounds first: utensils-audio-wave.js:66-85, utensils-library.js:676-684 and jam-track.js:66-85. Everywhere else two sounds can play at once.
- **Waveforms**:
  - Two shared modules already exist: [jam-track-audio.js:10-70](../web/js/panels/jam-track-audio.js#L10-L70) and [utensils-audio-wave.js:20-64](../web/js/utensils-audio-wave.js#L20-L64).
  - Own copies: jam-song.js:556-617 (a copy of `peaks` and `drawPeaks`), utensils-bench.js:52-75, monitor.js:168-189 and editor.js:473-519.
  - About 13 places decode a sound from a URL.
- **A frame of a video into the Library**, three times: home.js:300-309, cut.js:924-942, store.js:838-853. `loadVideo`/`seekTo` (spice-bake.js:19-45) already do it robustly.
- **Build**:
  - In controls.js, `scrub(el, { length, seek, keys })`, `span(el, { from, to, min, onChange })` and `ruler(length)`.
  - `wordBar(item, setWord)`, shared by Cut and Jam.
  - `transport(media, { format, seek, loop })` with one "now playing", so only one sound plays at a time.
  - One `audio.js` (offline `bufferOf`, `peaks`, `drawBars`) merging the two modules.
  - `frameAt(url, t)` built on `loadVideo`.
- **Likely bug (from reading)**: utensils-bench.js:66 and monitor.js:172 make a new `AudioContext` per sound and never close it. jam-track-audio.js:1-3 explains why it uses an offline context instead.
- **Risk**: [spice.browser.mjs](../tests/spice.browser.mjs) (`.sp-scrub`, the layer bars, the flame drag), [jam-editor.browser.mjs](../tests/jam-editor.browser.mjs) (stale in part), [song-cover.browser.mjs](../tests/song-cover.browser.mjs).
- **Effort** M. **Value**: about 60 places, about 600 lines.

#### C11. Progress displays and typing dots

- **Copies**:
  - The running and failed states of a render tile are the same in [control/stage-page.js:937-945](../web/js/control/stage-page.js#L937-L945) `runTile` and [panels/assistant.js:422-433](../web/js/panels/assistant.js#L422-L433) `renderTile`: "Rendering…", typing dots, a bar at `progress × 100 %`, and "That picture didn't work.". Only their done states differ.
  - Thin bars: `.msg-render-bar` (app.css:456) and `.ctl-run-bar` (control.css:225) are identical. More bars: toaster.css:209, mixer.css:177, ut-shell.css:111-115, ut-home.css:69-72, macaron.css:822-823.
  - There is a ring in panels/utensils.js:165-182, and percent text in about 7 files.
  - Typing dots are built by hand (`h("span.typing", {}, h("i"), h("i"), h("i"))`) 16 times in 7 files.
- **Build**:
  - `progressBar(p, { tone })` with `role=progressbar`, shown as indeterminate below 2%.
  - `dots()`.
  - `jobFace(run, { aspect })` for the running and failed tile.
  - Keep `.seg` and the ring as variants.
- **Risk**: [oven.browser.mjs](../tests/oven.browser.mjs) (`.img-wait`, `.img-pct`), [toaster.browser.mjs](../tests/toaster.browser.mjs), [harnesses.browser.mjs](../tests/harnesses.browser.mjs).
- **Effort** S-M. **Value**: about 30 places, about 100 lines.

#### C12. Key-value "facts" lists

- **Copies**:
  - [utensils-library.js:634-646](../web/js/utensils-library.js#L634-L646) (`.lb-facts`)
  - [panels/inspector.js:62-63](../web/js/panels/inspector.js#L62-L63) (`.cut-facts`)
  - [control/stage-page.js:533-540](../web/js/control/stage-page.js#L533-L540) (`.ctl-facts`, through its own `fact()`)
  - utensils-audio-bench.js:114 (`.ua-beat-facts`)
  - CSS: cut.css:92-93, ut-library.css:178, control.css:124, ut-audio.css:63-64.
- **How alike**: the same idea (a short label and its value) in four looks: Cut and the beat finder show a muted label beside a mono value, the Stage lists rows, and the Library draws a bordered two-column grid.
- **Build**: `facts([[label, value], ...], { layout: "rows" | "grid" })` in dom.js, and one `.facts` style.
- **Effort** S. **Value**: 4 places, about 25 lines.

### Client logic

#### L1. The fetch-JSON helper, written fourteen times

- **Copies** (`call(path, init)` + `send(path, method, body)`):
  - Products: [toaster.js:90-96](../web/js/toaster.js#L90-L96), [story.js:35-41](../web/js/story.js#L35-L41), [macaron.js:44-50](../web/js/macaron.js#L44-L50), [spice.js:51-57](../web/js/spice.js#L51-L57), [mixer-trend.js:15-21](../web/js/mixer-trend.js#L15-L21), [jam.js:51-57](../web/js/jam.js#L51-L57), [mixer.js:38-44](../web/js/mixer.js#L38-L44), [cut.js:49-55](../web/js/cut.js#L49-L55).
  - Pages and tools: [panels/home.js:80-85](../web/js/panels/home.js#L80-L85), [control/stage-page.js:1166-1171](../web/js/control/stage-page.js#L1166-L1171), [utensils.js:343-348](../web/js/utensils.js#L343-L348), [utensils-edit-api.js:4-9](../web/js/utensils-edit-api.js#L4-L9), [utensils-fx-api.js:4-9](../web/js/utensils-fx-api.js#L4-L9), [utensils-templates-api.js:24-30](../web/js/utensils-templates-api.js#L24-L30).
  - The one in [api.js:6-22](../web/js/api.js#L6-L22) (`request`, `post`) also knows the live demo.
- **How alike**: identical bodies. The error fallbacks differ: `Request failed (status)`, `res.statusText`, "The stage could not be reached", or `status` attached.
- **Build**: export `request`, `getJson(path)` and `sendJson(path, method, body)` from api.js, and import them everywhere. The live demo's read-only rule then holds on every page.
- **Risk**: low. The static demo's snapshot paths only cover `api.*` reads; a product read that goes through `request` in demo mode would now be refused for non-GET. Every page loads in [harnesses.browser.mjs](../tests/harnesses.browser.mjs).
- **Effort** S. **Value**: 14 places, about 80 lines.

#### L2. localStorage: six identical wrappers, about 45 try blocks, 43 keys

- **Wrappers**: the same `read`/`write` try/catch pair is in [story.js:23-34](../web/js/story.js#L23-L34) (named `keepLocal`), [cut.js:37-48](../web/js/cut.js#L37-L48), [spice.js:15-26](../web/js/spice.js#L15-L26), [toaster.js:19-30](../web/js/toaster.js#L19-L30), [panels/toaster-projects.js:9-20](../web/js/panels/toaster-projects.js#L9-L20) and [control/stage-page.js:1174-1185](../web/js/control/stage-page.js#L1174-L1185).
- **Inline try/catch** around each access, about 45 in all:
  - The product stores: jam.js (69-71, 85-87, 107-109), mixer.js (55-57, 76-78, 87-89), macaron.js (80-82, 108-110, 127-129, 136-138, 155-157).
  - About 17 sites in store.js.
  - panels/home.js, panels/sources.js, macaron-create.js, panels/jam-song.js, utensils.js, utensils-audio-mix.js, utensils-guide.js.
- **One key, four readers**: `comfyture.utensils` is parsed separately in utensils.js:54-61, utensils-edit-tools.js:135-138, utensils-space-audio.js:17-20 and utensils-vfx-tools.js:244-247.
- **"Reopen the last project"** is written per store: jam.js:66-73, macaron.js:79-84, mixer.js:54-60, toaster.js:105 and spice.js:66. Story and Cut are twins (story.js:192-202, cut.js:199-209). The Stage has its own (stage-page.js:1515-1520).
- **Keys** (all prefixed `comfyture.`):
  - Kitchen: `draft.v2`, `tabs.v1`, `edit.v1`, `chat.v1`, `image.v1`, `stage.inputs`, `stage.model`, `llm`, `llm.assistant`, `artist`, `video`, `project`, `card.v1`, `home.draft`, `home.ideas`, `story.tabs`/`.last`, `cut.tabs`/`.last`, `stage`, `stage.tabs`.
  - Jam: `jam.open`, `jam.workspace`, `jam.song.3`.
  - Macaron: `macaron.open` (and `.open.<id>`), `macaron.space`, `macaron.family`.
  - Mixer: `mixer.open`, `mixer.loras`.
  - Spice: `spice.open`, `spice.dept` (and the session key `spice.pending`).
  - Toaster: `toaster.open`, `toaster.prefs`, `toaster.mode`, `toaster.tabs`.
  - Utensils: `utensils`, `utensils.mix`, `utensils.guide`.
- **Build**: `web/js/local.js` with `get(key, fallback)`, `set(key, value)` (null removes the key), `json(key, fallback)`, `pick(key, allowed, fallback)` and `lastOpen(key, list)`. Keep every key string: tests set `comfyture.jam.workspace` ([song-cover.browser.mjs](../tests/song-cover.browser.mjs)), `comfyture.macaron.space` ([macaron-create.browser.mjs](../tests/macaron-create.browser.mjs)) and `comfyture.toaster.mode` ([toaster.browser.mjs](../tests/toaster.browser.mjs)).
- **Effort** S. **Value**: about 17 places, about 100 lines.

#### L3. Time formatters, about 25

- **Copies**:
  - jam-ui.js:74-76 `clock`, `fine`, `mins`; utensils-fx-controls.js:48.
  - [spice-plate.js:14](../web/js/spice-plate.js#L14) and [utensils-edit-stage.js:12](../web/js/utensils-edit-stage.js#L12) are identical.
  - `time` in utensils-bench.js:14, panels/utensils.js:28 and utensils-space-vfx.js:28.
  - Macaron: macaron-content.js:30 and macaron-create.js:18; macaron-studio-space.js:19 and macaron-ugc-win.js:15.
  - stage-page.js:37 `fmt` and monitor.js:201 `stamp`.
  - `tc` (HH:MM:SS:FF) in [panels/editor.js:19-23](../web/js/panels/editor.js#L19-L23) and [panels/inspector.js:16-20](../web/js/panels/inspector.js#L16-L20) is identical (checked with `diff`).
  - Several "x.x s" helpers. macaron-ui.js:216 and panels/mixer.js:35 are identical.
  - Two near-shared helpers exist but go unused:
    - utensils-bench.js:14 exports `time`, but no module imports it. utensils-space-vfx.js imports `compare` from that same file and defines its own `time` at line 28.
    - utensils-fx-controls.js:48 `clock(s, true)` already gives "m:ss.t", the format spice-plate.js and utensils-edit-stage.js re-write.
  - stage-page.js:1187-1190 re-writes `ago` with different words. Its tab preview and Toaster's (which uses dom.js's `ago`) say the same thing two ways.
- **Cosmetic bugs (from reading)**: spice-plate.js:14 and utensils-edit-stage.js:12 show "0:60.0" at 59.96 s, because the seconds are rounded after the minutes are taken. macaron-studio-space.js:19 shows "0:75" past a minute.
- **Build**: `clock(s, { tenths, hours, fps })` and `secs(s)` in dom.js, next to `pad2`. Leave utensils-edit-cues.js:19-23 alone: it is the SRT format, tested by [utensils-edit.test.ts](../tests/utensils-edit.test.ts).
- **Risk**: tests compare text (Spice's frame counter in [spice.browser.mjs](../tests/spice.browser.mjs), [jam-editor.browser.mjs](../tests/jam-editor.browser.mjs)).
- **Effort** S. **Value**: about 25 places, about 40 lines, two bugs.

#### L4. Little helpers copied per file

- **`clamp(v, lo, hi)`**: 16 client files (beats.js:7, cut.js:57, edit.js:9, fx.js:7, jam-sections.js:10, lyrics.js:9, panels/editor.js:18, panels/inspector.js:14, spice-elements.js:100, spice-layers.js:16, spice-model.js:15, utensils-audio-mix.js:18, utensils-edit-controls.js:13, utensils-edit-cues.js:8, utensils-edit-geometry.js:7, utensils-edit-stage.js:10).
- **`slug`**: macaron-book.js:20, macaron-content.js:192, panels/library.js:14, panels/takes.js:145, toaster-model.js:88.
- **`num`/`hex`** with defaults: fx.js:8, lyrics.js:10 and 126, spice-elements.js:101-102.
- **Build**: `web/js/sane.js` with `clamp`, `num`, `hex` and `slug`. These are pure, so they can share a node test with the server's `sane` (S2).
- **Effort** S. **Value**: about 25 places, about 30 lines.

#### L5. Error toasts, busy flags and notices

- **Copies**
  - store.js has `fail` (212) and `attempt` (214-220), but exports neither. panels/toaster-projects.js:37 and panels/home.js:109 re-write `fail`, and about 100 inline `toast(e.message, { tone: "crit" })` calls are spread over about 40 files.
  - The busy scaffold is written at 38 `.busy.add(` sites (e.g. [cut.js:880-890](../web/js/cut.js#L880-L890), [jam.js:209-215](../web/js/jam.js#L209-L215)): mark busy, redraw, try, toast on error, then unmark and redraw. panels/jam-song.js:167-179 `busyWith` is a local helper for the same thing.
  - **When a project list fails to load**, four looks: Toaster's notice card (panels/toaster.js:102 and 1305-1310, with Try again), a bare line in Story and Cut (panels/story.js:454, panels/cut.js:156), Kitchen home's line (panels/home.js:696). Jam, Macaron, Mixer and Spice only `console.warn` (jam.js:75, macaron.js:86, mixer.js:66, spice.js:70), so the person sees nothing.
  - **Tones**: toaster.js sends `tone: "warn"` 7 times, but only `.toast[data-tone="crit"]` is styled ([app.css:862](../web/css/app.css#L862)). A warning looks like a plain toast.
- **Build**:
  - Export `fail(e)` and `task(busy, key, fn, redraw)` from store.js. `task` returns fn's value, or shows a crit toast and returns nothing.
  - `notice(el, { title, text, retry })` from Toaster's card, for every product.
  - A styled `warn` tone.
- **Risk**: Jam's busy flags are kept per jam (jam.js:29-46). No test targets this directly.
- **Effort** S. **Value**: about 130 places, about 250 lines, and four products that stop failing silently.

#### L6. Keyboard shortcuts and the "am I typing?" guard

- **Page handlers**, each with its own dispatch (`k = e.key.toLowerCase(); if (mod && k === "z") …`):
  - [panels/editor.js:941-959](../web/js/panels/editor.js#L941-L959) (Cut and Jam)
  - [control/stage-page.js:1085-1103](../web/js/control/stage-page.js#L1085-L1103) (Stage)
  - [panels/story.js:442-449](../web/js/panels/story.js#L442-L449) (Story)
  - [panels/toaster.js:1350-1388](../web/js/panels/toaster.js#L1350-L1388) (Toaster)
  - [spice-canvas.js:220-247](../web/js/spice-canvas.js#L220-L247) (Spice FX, capture phase)
  - spice-viewer.js:483-494
  - [macaron-studio.js:252-273](../web/js/macaron-studio.js#L252-L273)
  - macaron-book.js:313-318, panels/toaster-projects.js:239-243 (Ctrl+S), app.js:234-239 (Ctrl+Enter)
- **The drift**:
  - The typing guard exists in four variants (`input, textarea`; `… select`; `… [contenteditable]`; `… :not([contenteditable=false])`).
  - "My page is on screen" is decided five ways. Two of them re-implement `currentPage` from the hash (macaron-studio.js, utensils.js:137).
  - "A window is open" is also decided five ways.
  - Duplicate is Ctrl+D on the Stage, Toaster and Macaron, but plain D in Spice, and D opens the 3D page in Toaster.
  - The Q/W/E/R tool tables of Toaster and the Stage are the same (panels/toaster.js:43-48, stage-page.js:22-27).
- **Escape closers**:
  - About 52 Escape checks in 32 files. [macaron-win.js:61-66](../web/js/macaron-win.js#L61-L66) and [spice-win.js:39-44](../web/js/spice-win.js#L39-L44) are the same (Macaron also skips while `.mc-pop` is open).
  - Plus 35 per-field `keydown: (e) => e.stopPropagation()` calls.
- **Field keys copied**:
  - The @ picker's arrows, Tab/Enter and Escape: panels/assistant.js:247-268, panels/image.js:134-156, panels/home.js:429-490.
  - The rename field: toaster-projects.js:91-108 and stage-page.js:1250-1267 (identical).
  - The compare slider's keys: panels/image.js:450-455 and stage-page.js:1021-1027 (identical).
  - Menu arrows: loras.js:63-74, panels/image.js:275-285 and 645-655.
- **Likely bug (from reading)**: only Toaster checks for an open `.viewer`, so Cut's, the Stage's and Story's keys still act behind the full-screen viewer.
- **Build**: `web/js/shortcuts.js`:
  ```js
  keys(page, { "mod+z": undo, "mod+shift+z mod+y": redo, " ": play, "delete backspace": remove, escape: deselect }, { when, capture })
  typing(target)    // the one guard
  overlay()         // a window, the viewer, the Oven or a popover is open
  layer(el, { escape }) → pop   // the top layer hears Escape first
  ```
  Also `mentionPicker(input, { list, onPick })` in mentions.js, `renameField(value, done)` and `menuKeys(menu, anchor)`.
- **Risk**: keep the capture order (Spice's canvas before the viewer; popovers take Escape before pages). Tests: [toaster.browser.mjs](../tests/toaster.browser.mjs), [jam-editor.browser.mjs](../tests/jam-editor.browser.mjs), [spice.browser.mjs](../tests/spice.browser.mjs), [macaron-ui.browser.mjs](../tests/macaron-ui.browser.mjs), [toaster-projects.browser.mjs](../tests/toaster-projects.browser.mjs). The Stage's and Story's keys are untested.
- **Effort** M. **Value**: 10 handlers, about 16 closers, about 10 field-key copies; about 300 lines.

#### L7. Undo stacks, six of them

- **Copies**
  - **Stage**: control/stage.js:1357-1393 (cap 120, its top is the current state, `batch`).
  - **Toaster**: toaster.js:258-298 (cap 120, merges steps within 1 s).
  - **Spice**: spice-fx-ops.js:13-48 (one stack per shot, cap 40, a held change is one step).
  - **Macaron**: macaron.js:255-344 (cap 60, nested `begin`/`settle`/`end`).
  - **Story and Cut are twins**: [story.js:139-184](../web/js/story.js#L139-L184) and [cut.js:159-193](../web/js/cut.js#L159-L193) (cap 80; Cut's stack also serves Jam's editor).
  - **"Undo what the pet just did"** is written three times: store.js:1602-1610 `undoAssistant`, toaster-assist.js:345 `undoToaster` and macaron-assist.js:111 `undoMacaron`. The Stage does the same through its own history (control/assist.js:72).
- **How alike**: every stack keeps snapshots in two capped stacks. There are two models: commit after a change (Stage, Story, Cut) or mark before it (Toaster, Spice, Macaron). The caps are 40, 60, 80 and 120.
- **Build**: `web/js/history.js`:
  ```js
  const h = history({ snap, restore, limit })
  h.reset(); h.commit({ key, ms }); h.begin(); h.end(); h.undo(); h.redo(); h.canUndo; h.canRedo
  ```
- **Risk**: Macaron nests batches; the Stage keeps the current state on top. Tests: [toaster.browser.mjs](../tests/toaster.browser.mjs), [jam-editor.browser.mjs](../tests/jam-editor.browser.mjs), [macaron-ui.browser.mjs](../tests/macaron-ui.browser.mjs) (one step per batch, across brands), [spice.browser.mjs](../tests/spice.browser.mjs). The Stage's and Story's undo are untested.
- **Effort** M. **Value**: 6 stacks and 3 pet undos, about 200 lines.

#### L8. Waiting for jobs

- **Copies**
  - "Watch the job, wait, clean up" is written three times: toaster.js:641-657, spice-engines.js:259-268, utensils.js:351-358.
  - Only two of them check first whether the job has already finished. About 20 other `waitFor` callers don't (e.g. macaron.js:528, jam.js:213, mixer-trend.js:170): a possible race, not seen happen.
  - **Cut re-implements `waitFor`**:
    - `waitJob` ([cut.js:857-865](../web/js/cut.js#L857-L865)) opens a new `EventSource("api/events")` for every job. It only closes it when that job reports back.
    - `waitRun` (866-874) polls `state.runs` every 1.5 s.
    - store.js:177-184 already has both, fed by the one event stream.
  - Polling by timer: panels/jam-song.js:223-233 (every 1.2 s) and pipeline.js:94-111 (every 3 s).
  - The same template job is polled by two loops: utensils-templates-api.js:45-55 and toaster.js:1033-1055.
  - `drawPicture` (store.js:1013-1016) is re-inlined at jam.js:775-776 and panels/jam-song.js:196-197.
  - There are seven sleep helpers.
- **Build**:
  - store.js gets `waitForJob(started, { onProgress })`, which checks the status first, and `waitForRun(id, { onProgress })`, fed by the run events.
  - api.js gets `pollJob(path, { first, every, signal })`, and one `sleep`.
- **Risk**: Toaster's 3D job must resume after a reload. Tests: the Toaster, Spice, utensils-apps and song-cover browser tests.
- **Effort** M. **Value**: about 12 places, about 100 lines, and one event connection instead of one per Cut job.

#### L9. Redraw signatures and keeping focus

- **Copies**
  - **63 signature functions** (`sig = () => JSON.stringify([...])`) in 38 files. 28 places compare a signature, and no shared helper exists.
  - **The workspace loop**, the same in three products: [panels/macaron.js:264-275](../web/js/panels/macaron.js#L264-L275), [panels/utensils.js:209-224](../web/js/panels/utensils.js#L209-L224), [panels/spice.js:192-203](../web/js/panels/spice.js#L192-L203). Each skips a part whose signature hasn't changed, and asks again when `update()` returns false.
  - **Window hosts**: macaron-win.js:105-109 and spice-win.js:75-79 are the same. spice-win.js says it in its own header ("The same pattern as Macaron's … kept apart"). panels/jam-ui.js:110-158 is a third.
  - **"Typing holds the redraw"**: `typingIn` is defined in 7 Macaron files (macaron-content.js:32, macaron-idea.js:37, macaron-shoot.js:42, macaron-ugc-win.js:16, macaron-graphics.js:135, macaron-assets.js:206, macaron-kit.js:206). It is written inline 7 more times, besides the app's own (app.js:102).
  - **Smaller copies**:
    - `fill(el, ...kids)` is identical in macaron-ui.js:73 and spice-ui.js:66.
    - app.js:166-212 holds four identical dock functions.
- **Build**: `web/js/redraw.js` with `whenChanged(sig, draw)`, `drawParts(parts, last, isOn)`, `typingIn(el, { except })` and `keepFocus(el, draw)`. Move `fill` to dom.js, and make one `dock(page, slot)` table.
- **Risk**: the `update() === false` contract, and Spice's outer signature, which adds busy, armed and pointer state. Tests: macaron-ui, macaron-create, spice, spice-picture, utensils-apps, toaster-projects and jam-editor browser tests.
- **Effort** M. **Value**: about 45 places, about 190 lines.

#### L10. Popovers: outside click, Escape, placement

- **16 hand-made popovers**:
  - [controls.js:202-212 and 338-339](../web/js/controls.js#L202-L212) (dropdown) and 396-404 and 462-463 (tilePicker).
  - loras.js:44-78, panels/image.js:255-288 and 612-658, panels/account.js:25-64.
  - attach.js:20-29 and 104-121, and picker.js:25-33 and 100-120 (the same `place()` and `ResizeObserver`).
  - macaron-studio.js:27-53, utensils-library-pick.js:51-80, utensils-audio-mix.js:220-226, panels/takes.js:91-92.
  - Listeners that stay on all the time: panels/toaster.js:365-383, panels/jam.js:181-184, panels/jam-edit-smart.js:32-33, panels/utensils.js:69-70.
- **What already exists**: `float`/`stick` in controls.js, but only 3 popovers use them.
- **Build**: `popover(panel, anchor, { width, onClose, arrows }) → { close }`. It places the panel with `float` and `stick`, arms its listeners after a tick, takes Escape through `layer()` (L6), and gives focus and `aria-expanded` back.
- **Risk**: [account.browser.mjs](../tests/account.browser.mjs), [toaster.browser.mjs](../tests/toaster.browser.mjs) (`.send-menu`, `.ts-add-menu`), [macaron-ui.browser.mjs](../tests/macaron-ui.browser.mjs) (`.mc-pop`, `.picker`), [harnesses.browser.mjs](../tests/harnesses.browser.mjs).
- **Effort** M. **Value**: about 250 lines.

#### L11. Ids, number formats, downloads and drags

- **Ids**: about 17 `uid` or `newId` generators. Two are identical: spice-roto.js:20 and spice-assist.js:57. A shared `uid(prefix)`, shaped like design.js:86, would cover them all. Check first whether tests assert id formats (edit, macaron, spice-layers, toaster).
- **Number formats**:
  - Bytes are formatted three times; utensils-edit-tools.js:81 divides by 1000 where the others use 1024.
  - Thousands: panels/status.js:6 and panels/account.js:9 are identical.
  - `pad2` is re-written four times although dom.js has it.
  - About 60 inline `≈ ${n} cr` in 33 files; only Jam has a helper (`cr`, panels/jam-ui.js:90).
  - Put them in one `format.js` with `clock`, `timecode`, `bytes`, `credits`, `int` and `pct` (L3).
- **Downloads**: six blob saves (macaron.js:976-983, macaron-patterns.js:186-195, macaron-kit.js:509-514, macaron-book.js:32-38, toaster.js:209-221, stage-page.js:1440-1447). macaron-kit.js never revokes its URL. There are also about 19 inline `?download=` links. Build `download(blobOrUrl, name)`.
- **Pointer drags**: 31 move/up pairs in 20 files, and only 9 of those files handle `pointercancel`. Build one `drag(e, { move, up })`, the same base as C9 and C10.
- **Effort** S each.

### CSS

#### K1. Icon keys, five copies (three identical)

- **Copies**:
  - [jm-band.css:92-95](../web/css/jm-band.css#L92-L95) `.jm-iconkey`, [macaron-win.css:74-78](../web/css/macaron-win.css#L74-L78) `.mc-iconkey` and [ut-shell.css:163-167](../web/css/ut-shell.css#L163-L167) `.ut-iconkey` are the same key: 2.5rem, a `--line2` border, a .875rem radius, muted turning to text on hover, an icon of 1.125rem.
  - [sp-shell.css:96-100](../web/css/sp-shell.css#L96-L100) `.sp-iconkey` drifts: 2.25rem, a .75rem radius, a pressed state.
  - [toaster.css:177-181](../web/css/toaster.css#L177-L181) `.ts-iconkey` drifts: a `--sunk` background and a .75rem radius.
  - Also `.img-key` (app.css:1138) and `.media-key` (app.css:287). The shared `.key.is-icon` (app.css:205) is 1.875rem, so the products made their own.
- **Build**: `.key.is-icon.is-lg` (2.5rem) and `.is-danger` in app.css, then delete the product copies.
- **Effort** S. **Value**: about 30 rules.

#### K2. The big yellow key, eight copies

- **Copies**:
  - `.sp-primary` [sp-shell.css:109](../web/css/sp-shell.css#L109) (`clamp(3.25rem, 7dvh, 4.5rem)`, radius 1.125rem)
  - `.ut-primary` [ut-shell.css:154](../web/css/ut-shell.css#L154) (3.25rem, 1rem)
  - `.jm-primary` [jm-edit.css:104](../web/css/jm-edit.css#L104) (3rem, 1rem)
  - `.jt-primary` [jm-track.css:22](../web/css/jm-track.css#L22) (`clamp(2.75rem, …)`, 1rem)
  - `.mx-go` [mixer.css:140](../web/css/mixer.css#L140) (3.75rem, `1rem × --corner-k`)
  - `.mc-go` [macaron.css:650](../web/css/macaron.css#L650) (3rem, `.875rem × --corner-k`)
  - `.welcome-go` [welcome.css:24](../web/css/welcome.css#L24) (3.25rem)
  - `.img-go` [app.css:1145](../web/css/app.css#L1145) (2.75rem, mono)
- **How alike**: every copy has an accent background, accent ink, bold type and no border. Heights, radii and font weights drift.
- **Build**: `.key.is-go` with `--go-h` (sizes `.is-lg` and `.is-xl`), in app.css.
- **Risk**: visual. The browser tests click these by class: keep the old class names as aliases until the tests move.
- **Effort** S. **Value**: 8 rules and their hover and disabled states, about 40 lines.

#### K3. Lamps: one shared, three home-made

- **Copies**:
  - Shared: `.lamp[data-tone]` [material.css:136-151](../web/css/material.css#L136-L151). It is square and has the tones `ok`, `busy`, `warn`, `crit` and `accent`.
  - Spice: `.sp-lamp` [sp-shell.css:46-50](../web/css/sp-shell.css#L46-L50) is round, with the tones `done`, `busy` and `stale`, and its own `sp-pulse` keyframes (identical to `lamp-pulse`).
  - Jam: `.jm-lamp` [jm-shell.css:63-66](../web/css/jm-shell.css#L63-L66) is a ring with a check, driven by `data-state` `done` and `next`.
  - Home: `.film-lamp` (home.css:241).
- **Keyframes copied**: the pulse `sg-pulse` (jm-song.css:125) and `ue-pulse` (ut-edit.css:57) are identical, and the spinners `jm-spin` (jam.css:110), `sg-spin` (jm-song.css:201) and `img-spin` (app.css:1144) are three copies.
- **Build**: one `.lamp` with a shape modifier (`.is-round`, `.is-ring`) and the tones `done` and `stale` added. Keep `lamp-pulse` and one `spin` in material.css.
- **Risk**: [spice.browser.mjs](../tests/spice.browser.mjs) may read the stack's lamps.
- **Effort** S. **Value**: about 20 rules and 4 keyframes.

#### K4. Eyebrow labels (small mono uppercase), 158 rules

- **Copies**: two shared classes already disagree. `.label` ([material.css:124-129](../web/css/material.css#L124-L129)) is weight 500 with .14em spacing in `--dim`. `.card-label` ([app.css:162](../web/css/app.css#L162)) is weight 600 with .22em spacing in `--text`. On top of these, 158 rules in about 35 files write `text-transform: uppercase` with their own spacing. The most are in app.css (17), macaron.css (15), ut-home.css (11) and macaron-win-kit.css (11).
- **Build**: one `.eyebrow` with tone modifiers, from a token pair `--eyebrow-track: .18em` and `--eyebrow-size`.
- **Effort** S, file by file. **Value**: about 150 declarations.

#### K5. Scrollbars, with no shared class

- **Copies**: `scrollbar-width: thin` is written 83 times in 31 files, and `scrollbar-width: none` 18 times in 9 files. Only one rule sets `scrollbar-color` (ut-library.css:82), and only one hides the WebKit bar (home.css:27-28).
- **Build**: `.scroll-y`, `.scroll-x` and `.no-scrollbar` utilities in app.css, with one `scrollbar-color` from the tokens.
- **Effort** S. **Value**: about 100 declarations, and one look for every scrollbar.

#### K6. Squircle corners, opted into 32 times

- **Copies**: 32 `@supports (corner-shape: squircle) { … }` blocks in 23 files, each listing its own classes (e.g. [material.css:75-78](../web/css/material.css#L75-L78), [sp-shell.css:122-123](../web/css/sp-shell.css#L122-L123), [macaron.css:846-847](../web/css/macaron.css#L846-L847)). On top of these, 85 radii in 10 files are written `calc(Xrem * var(--corner-k))`.
- **Build**: one `.sq` class (or `[data-sq]`) under a single `@supports` in material.css, and radius tokens that already multiply by `--corner-k` (K7).
- **Effort** S-M. **Value**: about 30 blocks, plus a rule anyone can follow.

#### K7. Values written by hand where tokens exist

- **Counts across `web/css`**:
  - **Radii**: 965 radii written literally, against 108 that use a `--r-*` token. The token scale (`--r` .1875rem, `--r-lg` .3125rem, `--r-panel` .875rem: [material.css:61-68](../web/css/material.css#L61-L68)) no longer matches what the products use: .5rem 145 times, .75rem 135, .875rem 131, .625rem 103, 1rem 87.
  - **Accent tints**: `rgba(242, 255, 89, …)` is written 76 times in 23 files, although `--accent-soft` and `--accent-line` exist. `#F2FF59` appears 49 times in CSS and JS.
  - **Colours**: 534 hex colours and 680 `rgba()` in all. The most are in ut-home.css (52 hex, 55 rgba), ut-shelf.css (35, 49), jam.css (34, 44) and macaron.css (25, 47).
- **Build**:
  - Radius tokens for the sizes in use: `--r-chip` .375rem, `--r-key` .5rem, `--r-tile` .75rem, `--r-card` 1rem, all `× --corner-k`.
  - Accent tint tokens at the opacities used (.12, .14, .16, .45).
  - Then swap the literals, one file at a time.
- **Risk**: visual only. Swapping for a token with the same value changes nothing.
- **Effort** M (mechanical). **Value**: the theme lives in one file again.

#### K8. Page shells and side columns

- **Full-height page**: `#page-X { width: 100%; height: calc(100dvh - var(--head)); margin: 0; overflow: hidden; display: flex; flex-direction: column }` is written five times: control.css:5, jam.css:6, cut.css:7, story.css:5, toaster.css:7.
- **Side columns and gaps drift**:
  - Spice uses `clamp(18.5rem, 21.5vw, 26rem)` ([sp-shell.css:6](../web/css/sp-shell.css#L6)), Macaron 19.5rem (macaron.css:5), Toaster `clamp(17.5rem, 19vw, 22rem)` and `clamp(16rem, 17vw, 20rem)` (toaster.css:11-13), Mixer `minmax(19rem, 23rem)` (mixer.css:6).
  - Each defines its own gap variable (`--sp-gap`, `--ut-gap`, `--mc-gap`, `--jm-gap`, `--ts-gap`). Utensils and Macaron use the same formula, `clamp(.875rem, .5rem + 1.2dvh, 1.5rem)`.
- **Jam's grid is set twice**: [jam.css:8-16](../web/css/jam.css#L8-L16) sets `22rem` and a gap of .875rem. [jm-shell.css:12](../web/css/jm-shell.css#L12) sets `21.5rem` and `var(--jm-gap, 1rem)`, and it loads after (index.html:55-56), so the first rule's columns and gap never apply.
- **Build**: `.page-fill` in app.css, and `--side-w` and `--page-gap` tokens, with a product overriding only when it means to.
- **Effort** S. **Value**: 5 shells, 6 gap variables, one dead rule.

#### K9. Breakpoints

- **Copies**: there are 35 different `@media` widths and heights. The common ones are 1280px (26 uses), 980px (19) and 760px (9). Next come 1100, 820, 1500 and 1400px (7 to 4 uses each), then about 20 single-use values (520, 860, 1180, 1520…).
- **Build**: CSS variables don't work inside `@media`, so write the set down in material.css's header (1280, 980, 760, 520) and snap new rules to it.
- **Effort** S, as a habit. **Value**: fewer one-off layouts.

---

## 4. The order to merge them

Safe and high-value first. "Guarded by" lists the tests to run before and after. Every merge also runs the unit suite (`node --test tests/*.test.ts tests/*.test.mjs`).

| # | Merge | Effort | Risk | Guarded by |
|---|---|---|---|---|
| 1 | **Pet plumbing basics** (S2): `turnsOf`, `firstJson`, `sane` in `server/pets.ts`. | S | Low | harnesses.test.ts, spice-assist.test.ts, toaster-assist.test.ts, brioche-harness.test.mjs, cut.test.ts, utensils-knowledge.test.ts, comfy-apps.test.ts |
| 2 | **Tiny client helpers** (L1-L4, L5, L11): `getJson`/`sendJson` from api.js, `local.js`, `format.js` (`clock`, `bytes`, `credits`), `sane.js`, `fail`/`task`, `uid`, `download`. | S | Low | a new node test for the pure ones; harnesses.browser.mjs (every page loads); spice.browser.mjs (frame counter) |
| 3 | **One saver for every store** (C2): Story, Mixer, Macaron and the Stage onto `keyedSaver` with per-key chaining and a `pagehide` flush. This fixes the Story delete toast. | S-M | Low-Med | saving.test.ts (extend it), macaron-ui.browser.mjs, toaster-projects.browser.mjs |
| 4 | **Two-press keys** (C4): `twoStep` and `payKey`. | S | Low-Med | toaster-projects.browser.mjs, spice.browser.mjs, toaster.browser.mjs, utensils-apps.browser.mjs |
| 5 | **The Stage's examples as an example kind** (finishes the merge of `855af05`). | S | Low | examples.test.ts |
| 6 | **The ffmpeg job runner** (S3), server and page. | M | Low-Med | utensils-edit.test.ts, utensils-fx.test.ts, spice.browser.mjs |
| 7 | **CSS legos** (K1-K5, K8): icon key, go key, lamp, eyebrow, scroll utilities, page shell. | S each | Low (visual) | the browser suites, with a look at each page |
| 8 | **Media, server and page** (S4, S6, C6 first part): `keepFile`/`probe`/`readJson`; `chooseFiles`, `onFiles`, `media.keep`. | M | Med | examples.test.ts, utensils-edit/fx tests, toaster.browser.mjs, utensils-apps.browser.mjs, song-cover.browser.mjs |
| 9 | **Router requests** (S5). | S | Med (no tests; they spend credits) | write a stubbed-`fetch` test first |
| 10 | **Waiting for jobs** (L8): `waitForJob`, `waitForRun`, `pollJob`; Cut stops opening an event stream per job. | M | Low-Med | toaster, spice, utensils-apps, song-cover browser tests |
| 11 | **Shortcuts and popovers** (L6, L10): `keys`, `typing`, `layer`, `popover`. | M | Med | toaster, jam-editor, spice, macaron-ui, account browser tests; add a Stage key test first |
| 12 | **History** (L7) and **redraw helpers** (L9). | M | Med | toaster, jam-editor, macaron-ui, spice browser tests |
| 13 | **Project store and project bar** (C1, C3, S1). | L | Med-High | write a `projectStore` node test first; then toaster-projects, macaron-ui, jam-editor, spice and toaster browser tests |
| 14 | **Media controls** (C9, C10, C11): `wipe`, `scrub`, `span`, `transport`, one `audio.js`, `progressBar`. | M | Med | spice, oven, toaster, utensils-apps, song-cover browser tests; fix jam-editor.browser.mjs first |
| 15 | **Pets on specs** (S2, second part): Paprika, Truffle, Crumpet and Praline on Brioche's engine. | L | Med | the assist tests of each pet, plus harnesses.test.ts |
| 16 | **Tokens** (K6, K7): radius and accent tokens, one squircle class, then the literals. | M | Low (visual) | the browser suites |

---

## 5. Rules for new code

- **Look first.** Before writing a helper or a widget, read the catalogue above and grep for the verb (`grep -rnE "function clock|const clock" web/js`).
- **The second copy makes it shared.** The second time you need something, move the first copy into a shared module and import it from both places. Don't paste a third.
- **Where shared pieces live:**
  - Page building blocks: `web/js/<name>.js`, with no product prefix (`dom.js`, `controls.js`, `media.js`, `local.js`).
  - A piece only one product uses stays in that product's files (`spice-*.js`, `panels/spice.js`).
  - The server's shared pieces go in `server/<name>.ts` (`examples.ts`, `pets.ts`, `library.ts`).
  - A pure module the page and the server both need goes in `web/js` and is imported by the server, as `brioche/harness.js` and the `*-harness.js` files already are.
- **Styles:** tokens go in material.css and shared component classes in app.css. A product file holds only that product's layout and looks. Use a token, not a literal, for colours, radii and shadows. When a value shows up a third time, add a token.
- **Naming:**
  - Name components with plain nouns (`projectBar`, `wipe`, `lamp`, `petCard`) and actions with verbs (`chooseFiles`, `keepFile`).
  - Shared classes carry no product prefix (`.key`, `.lamp`, `.facts`).
  - Variants are `.is-*`. State lives in `aria-*` and `data-*`.
- **Merging keeps tests honest.** Keep a class name a test selects, or change the test in the same commit. A new shared pure function gets a node test. A new shared widget is covered by the browser tests of its first two users.
- **Paid runs always ask first.** Any key that spends credits uses the shared pay key (C4) and shows its price.
