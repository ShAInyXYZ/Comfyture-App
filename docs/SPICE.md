# Spice: the AI VFX suite

Spice is the VFX house of Comfyture, run by Paprika. It was rebuilt on 26 October 2026 on the owner's call: no compositor, no effects shot on black, no ffmpeg grades passed off as departments. **AI is the engine**: every tool is a workflow on Comfy Cloud, and the footage itself is generated.

## What it is

- A **scenario** is a few shots. Each **shot** is its **plate** (a clip LTX-2.5 rolls from a first frame and a few words, five seconds at 720p with its sound; or any clip dropped in) and the **chain** of passes the tools made on it, each on the one before.
- A **pass** keeps the clip it ran on and the clip it made; the viewer wipes between them. A new run goes on the pass you are looking at, so a chain can branch: the passes that were on top go to the **bin**, and a take put back rebuilds the chain to where it was made. Nothing is overwritten, every clip stays in the library.
- Every run shows its price on its yellow key, which asks on the first press and spends on the second. Paprika sets things up from words; the person presses the key.
- **Paprika's read** (`POST /api/spice/read`): one frame of the shot open goes to the assistant model with the shot's words and the tools by id; she answers through the `spice_read` tool (`server/spice-assist.ts`) with what the shot is, what looks off, a question, and two or three chains, each two to five steps of a tool, its words, its size, the box it fills or the aspect it widens to. The page keeps the read with the shot (`shot.read`) and shows the chains as cards with their price: **Run it** runs them one on the other with one yes (the key asks first; a step that fails stops the chain and says why); **Step by step** sets the first step up on the tool card. A chain she answers in the bar with comes to the same cards. The example ships her read of each shot (`scripts/spice-example-reads.mjs`).
- **One panel beside the viewer** (PAPRIKA, `web/js/spice-tools.js` suiteSpace): her read and her chains over the library's key, or, once a tool is picked, the tool's card (its words, dials, the yellow key) under the way back (**Her chains**). The viewer has the room: its pass row is labelled and numbered, a line under it says what the pass looked at was told and cost, and a sound pass shows its clip whole, with no wipe.
- **The library** (**Browse the N tools**, a window with a search field and what the dots mean): every tool a card with a frame of what a real run was given beside the frame it made (`web/brand/spice/previews/<tool>.jpg`, made by `scripts/spice-previews.mjs` from the example's passes and one draft run of every other tool on the plate that suits it, 119 credits in all); a tool with no run yet, or whose run failed, says so on its card. A card picks its tool and closes the window.
- **The box**: a tool that fills a region (Inpaint) draws its box on the viewer in the LoRA's green; a drag moves it, its corner sizes it, and the tool card says where it is. Paprika places it from the frame she saw.

## The tools (`GET /api/spice/tools`, `server/spice.ts`)

| Family | Tools | How they run |
|---|---|---|
| Restore | Deblur, Refocus, Motion deblur, Decompression, Uncompress, Restoration, Dearchive, Deinterlace | IC-LoRA of LTX-2.3 on the app's own graph (`workflows/ic-lora.json`) |
| Upscale | Video upscale, Refine upscale (failed on a real run), **Upscale** (SeedVR2, the app's own graph: 720, 1080, 1440) | IC-LoRA; engine |
| Grade and light | Day to night, Ungrade, Colorization, Colorizer | IC-LoRA |
| Clean | Subtitles, Watermark, Obscura (a thing in front of the lens gone; it failed on a prop in the scene), Clean plate (the frog gone from its crate), Edit anything (a scarf put on) | IC-LoRA |
| Frame | Outpaint (the clip padded black: the pad stayed black on our footage, so it is marked failed), In-outpainting (the official LoRA: a green canvas, drawn; the one to widen with, to scope, 16:9, square, 9:16, the footage merged back), Inpaint (a box of the frame) | IC-LoRA with the clip made ready on this machine |
| Camera | Cameraman (a camera move), Crossview (a new angle), Any trajectory (needs a track) | IC-LoRA |
| Control | Union control: pose, edges, depth (the clip redrawn under its own motion from new words) | IC-LoRA |
| Effects and edits | Water (rain), Shave, Cross-eyed, **Restyle** (Wan VACE, a template of the catalog) | IC-LoRA; template |
| Cut out | **Cut out**: SAM3 finds what you name and follows it: a green screen, the matte kept beside | engine (`workflows/matte.json`) |
| Finish | **Sound** (LTX-2.5 writes a silent clip's sound), **Slow motion** (frame interpolation, a template) | engine; template |
| Needs more than a clip | Ingredients, Lipdub, Head swap, Motion track, Inpaint reference, Greenscreen avatar, HDR... | listed, not offered a run |

The IC-LoRAs' settings come from their model cards (`workflows/ic-loras.json`: the guide each is shown, the words its card gives, its strength, whether it recommends one pass). Each carries `status`: `verified` once a real run was looked at and did what the card says (its `note` says what to expect), `failed` with what was seen, or `untested`. Draft runs the clip at a shorter side of 320 (a credit or two), standard at 544 doubled by the second pass (about six credits a second).

One route runs any of them: `POST /api/spice/run { video, tool, words, scene, seconds, size, strength, aspect, region, height }` answers a job: an engine job watched on the event stream, or a template job of the runner, polled. Every run goes through the engine's spend gate (a judges' copy counts it as a render) and `COMFYTURE_OPEN_WEIGHTS` refuses a partner's template.

## The example: Truffle's Jam Heist (`examples/spice/heist/`)

Our own scenario, our own cast. The five first frames were drawn with Codex's GPT Image from the cast's sheets (`docs/brand/products/spice-v3/`: the brief, a text per shot, `run.sh`), the plates rolled by LTX-2.5 on Comfy Cloud (`scripts/spice-example.mjs shots`, 5 × 5 s at 1280x704, 41 credits in all), then the tools chained on each (`scripts/spice-example.mjs passes`, standard size), and the folder baked (`scripts/spice-example.mjs bake`, clips re-encoded small):

- **SH010 · The yard**: Truffle crosses the yard with the jar; a white van is in the plate (and a road sign that stayed: see below). Inpaint paints the van out, region by region; Day to night; In-outpainting to scope; Sound.
- **SH020 · The lookout**: Pickle keeps watch on a crate. Water (rain); Crossview (a new angle); Cut out (a green screen of Pickle).
- **SH030 · The jar**: a close-up that missed focus. Refocus; Upscale to 1080; Sound.
- **SH040 · 1958**: the first heist as a scratched newsreel. Restoration; Colorization; Upscale.
- **SH050 · The dance**: the two on the counter at dusk. Union control: pose (the same dance redrawn on a snowy night); Sound. (Wan VACE's Restyle ran too and gave the clip back as it was: it is in the suite with a red dot.)

Every pass in the example is a real run; the manifest of what each cost is kept with the work folder, and the example counts nothing as spent. What did not work is on record too, on the cards' notes: Obscura, asked for the van, took the jar instead (its card says it removes from the foreground), asked for the road sign it turned the raccoon into a bird, and asked for the jar between the dancers it left it and moved the raccoon; Inpaint, given the sign's region three times (a strip, then the whole right fifth of the frame), drew the sign back each time; Outpaint's black pad stayed black at 2.39:1 and at square where In-outpainting's green pad was drawn; and the first Day to night, told of warm bulbs and pools of light, stayed golden hour until it was given its card's own words at strength 1.3. The previews' runs also turned two cards green: Clean plate took the frog off its crate in a wide shot, and Edit anything put a red scarf on the raccoon as asked (and turned him to the camera with it).

## The code

- `web/js/spice-model.js`: the rules (a scenario kept, the chain, the bin, the prices). `web/js/spice.js`: the state and the store (`spice-scenarios`). `web/js/spice-tools.js`: the registry on the page, the tool picked, the run, the TOOL, TOOLS and BIN bentos. `web/js/spice-viewer.js`: the viewer with its wipe and the chain. `web/js/panels/spice.js`: the screen, the shots, the windows. `web/js/spice-engines.js`: jobs, the LTX shot, clips brought in. `web/js/spice-guide.js`: Paprika's read, her chain cards, a chain run with one yes. `web/js/spice-assist.js` + `server/spice-assist.ts`: Paprika in the bar, and her read. `web/js/tours/spice.js`: the tour. `web/css/sp-shell.css`, `sp-viewer.css`, `sp-suite.css`, `sp-win.css`.
- `server/spice.ts`: the registry (with each tool's preview and, for one that fills a box, its default box), the run route, the read route, the example seeder. `server/iclora.ts`: the IC-LoRA graph. `scripts/spice-previews.mjs`: the tools' pictures. `scripts/spice-example-reads.mjs`: the example's reads.
- Tests: `tests/spice.test.ts`, `tests/spice-assist.test.ts`, `tests/iclora.test.ts`, `tests/iclora-judge.test.ts`; in a browser, `tests/spice.browser.mjs` and `tests/spice-laptop.browser.mjs`.

## Not yet

A free-form mask for Inpaint (it takes a box, drawn on the viewer), the tools that need a reference sheet or a track, a reference picture for a partner relight, and the local (self-hosted) version of the graphs.
