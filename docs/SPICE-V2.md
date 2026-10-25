# Spice v2: the AI edit bay

Spice stops being a VFX house that does by hand what ffmpeg and a canvas can do. It becomes where a clip is **edited by AI models**, the way a finishing editor works: conform the footage, select, clean, direct the change, control the motion, extend, finish. Paprika, the baby chameleon, is the editor who knows which model does which job.

The local, self-hosted version comes later. First the AI side, on Comfy Cloud, through the template runner the app already has (`server/comfy-templates.ts`: catalog, form, price estimate, run). Every paid run asks first; development runs on `COMFYTURE_FAKE_TEMPLATES=1`, so nothing here spends credits.

## Status (2026-10-26)

Built and tested, at **#/spice?bay** (the VFX house is still #/spice until the bay covers what the judges' walk shows of it; a key beside Paprika's name in each leads to the other):

- **The rules** (`web/js/spice2-model.js`, `tests/spice2.test.ts`): the seven stages, 41 engines named after templates of the live catalog (checked against it), takes with a marked pass, Paprika's plan, the ledger (and as text), the checks before a paid run, the price, her pick without a model, Conform's plan.
- **The server** (`server/bay-assist.ts`, `server/bay-example.ts`, the `spice-bays` store in `server/main.ts`): Paprika's brief and the reader of her answers, the examples seeder.
- **The screen** (`web/js/bay*.js`, `web/js/panels/bay.js`, `web/css/bay.css`): rail, viewer with its wipe, the stage's engines grouped by what they are for, the form, takes, the plan, Finish's free export and ledger, her bar, her tour (`web/js/tours/bay.js`).
- **Safe on a judges' copy**: runs go through the template runner, so the judge spend gate and `COMFYTURE_OPEN_WEIGHTS` apply (the bay also hides partner engines under open weights, and says before the press when no Comfy key is saved).
- **The example**: "The yard at dusk" (`examples/bay/lantern/`, pictures drawn with Codex's GPT Image, clips made by `scripts/bay-example-media.sh`): a clip and a take for Conform, Clean, Direct and Finish. Its Clean and Direct takes are **stand-ins drawn to show the result**, and each says so (`source: "example"`); nothing in it was run on Comfy Cloud.
- Tests: `tests/spice2.test.ts`, `tests/bay-assist.test.ts`, `tests/bay-example.test.ts`; in a browser, `tests/bay.browser.mjs` and `tests/bay-example.browser.mjs`.

**Not yet**: a real run of any engine (no credits were spent; every paid path is stood in for in the tests), Select's matte on the viewer, Control/Extend takes in the example, the website's Spice section and video, and the retirement of the VFX house.

## What the old Spice was, and why it goes

Six departments (Plate, Roto, Paint, Light, FX, Comp), five of them done mostly on this machine: a canvas compositor for effect layers, ffmpeg grades, a free weather and spark server. That is a compositing tool. It gives no AI edit. The AI parts (SAM3, removers, Beeble, upscale) were attached to it as options. v2 turns this round: the models are the departments' engines, and ffmpeg only conforms and exports.

## The pipeline

One shot, seven stages in the order a finishing editor runs them. Each stage keeps **takes** (every run is a take, none overwrites another), and the one marked is the stage's pass. A later stage works from the pass of the one before.

| # | Stage | Job | Engines (Comfy Cloud templates, from the live catalog) |
|---|---|---|---|
| 1 | **Conform** | Import the clip, trim to the range, fix fps, size and length to what the editors accept (10 s per take for most), a proxy for the viewer, slate numbers from 1001 | ffmpeg (free, local) |
| 2 | **Select** | The subject or area the next stages must change or keep, clicked once, tracked through the clip, out as a matte | SAM3 (`utility_*` / the runner's SAM3 template), Bria guided background removal for a still |
| 3 | **Clean** | Take something out: an object, a person, subtitles, a watermark, a wire | VOID (`utility_void_video_inpainting`), LTX 2.3 Obscura Remova, Remove Subtitles, Remove Watermark (`template_ltx2_3_*`, open LTX LoRAs) |
| 4 | **Direct** | Change what is in the clip by describing it, or recast a person or a look. Two modes: *by words* (swap a background, restyle, add or remove an element, relight) and *recast* (a new character in the same moves) | by words: Gemini Omni 1.1 Flash Edit (`api_google_gemini_omni_flash_1_1_edit`, 10 s), Seedance 2.5 Edit, Runway Aleph 2, Luma Ray 3.2 Edit, Kling O3 Edit (with a reference picture), Wan 2.7 Edit; relight: Beeble SwitchX, Bernini-R. Recast: Higgsfield Genjutsu motion transfer, Wan Animate 2, SCAIL-2 |
| 5 | **Control** | The LTX 2.5 IC-LoRA bay: re-render the clip under a guide taken from it, keeping what the guide holds. *Union control* (depth, pose or edges of the source kept, the look redrawn), *Ingredients* (a reference sheet of characters, props and places held across the clip), *Outpaint* (a new aspect ratio), *Retake* (a part redrawn between two frames). H3's reference-to-video (FastH3 OmniRef, open, eight steps; H3 R2V takes up to three reference videos) as the second engine for a reference-led redo | `video_ltx2_3_ic_lora` (union), `template_ltx2_3_ic_lora_ingredients`, `template_ltx2_3_lora_video_outpainting`, LTX 2.5 FLF2V, `video_fasth3_ominiref_r2v`, `video_minimax_h3_r2v` |
| 6 | **Extend** | Make the clip longer or join two takes: continue it by up to 10 s a step (to 40 s), or bridge two takes between the last frame of one and the first of the next | Gemini Omni 1.1 Flash Extend, LTX 2.5 FLF2V and the LTX 2.3 style-transition LoRA (a bridge), MiniMax H3 multiframe reference |
| 7 | **Finish** | Upscale, sound that fits the picture, clean speech, then export with the ledger of what was run and what it cost | video upscale (the runner's), Mirelo SFX 2.0 video-to-SFX, VEED Clean Audio, ffmpeg export |

"H3 Omni mini" was asked for; it is not in Comfy Cloud's template catalog read on 2026-10-25 (718 templates, newest dated 2026-10-23). The closest are **FastH3 OmniRef** (2026-10-20, open, 8 steps) and the MiniMax H3 family. The engine list is read from the catalog, so when the name appears it is one more engine of Control, with no code change.

## How a stage works

- **The engine menu is the catalog.** Each stage names the *kinds of template* it takes (by name pattern and tags); the engines shown are the ones the live catalog has right now. A new template with the right tags appears by itself.
- **Paprika recommends.** From the brief, the footage and the stage, the assistant picks an engine and says why in a line (cost, length limit, what it keeps). The person can pick another.
- **Price before yes.** The runner's `estimate_credits` is free; the button shows it. A paid run is sent only on the person's click.
- **Takes, not overwrites.** A run adds a take under its stage with the engine, the prompt, the seed (when there is one), the credits and the time. A/B between any two takes on the wipe. One take is marked as the stage's pass.
- **Hand-offs are real files.** A stage's pass is a clip in the library; the next stage's engine gets it as its input through the runner's upload (`POST /api/assets`).
- **Limits are checked before a run.** Gemini Omni edits up to 10 s; most editors want 24 or 25 fps and an even size; a picture reference is needed for Kling O3. The form says it before sending, not after paying.

## The screen

Keeps the app's rules: one scrollable dashboard screen, NeuronKit parts, icons with words in tooltips, yellow for interaction only.

- **Left, the stage rail**: the seven stages as a vertical strip, each with its lamp (empty, working, done), its marked take's frame, and the credits spent.
- **Centre, the viewer**: the source against the open stage's pass on a draggable wipe, a transport, a timeline with a bar per stage and the takes as ticks; Select's matte can be shown as an overlay.
- **Right, the stage panel**: the engines as cards (name, maker, open or partner, length limit, price), the form of the chosen one (clip in, words, reference pictures, a few settings), Paprika's note, and the run button with its price.
- **Under the viewer, the takes**: every run of the stage, newest first, with its prompt, engine and cost; mark, compare, delete.

## The scenario that builds and tests it

"No need to use our already generated footage": the test shots are written for this and drafted with Codex's GPT Image (free); the clips come from a first real run only when the person says so. The story, **The Lantern Round** (three shots, about 8 seconds each), uses the app's own cast:

1. **The yard at dusk.** Taro walks across a market yard carrying a paper lantern. A modern street sign and a delivery van (wrong for the story) stand in the back. *Clean* removes the van, *Direct* turns the sign into a hand-painted one.
2. **The rain.** Same yard, same walk, daytime in the take. *Direct* (relight) makes it a rainy blue-hour evening; *Control* with union control keeps Taro's walk exactly while the look is redrawn.
3. **The wish.** A wide shot from behind Taro as he looks up. *Extend* continues it by 8 seconds into a lantern release; *Control* (Ingredients) holds Taro's look from a sheet across the new part.

Finish: upscale, rain and footsteps from Mirelo, export of the 3-shot reel with its ledger.

This scenario uses every stage once and gives each its failure to catch: a length over a limit, a missing reference, a clip at the wrong fps, an engine that left the catalog.

## Build order (each step is tested and committed alone)

1. **The model** (`web/js/spice2-model.js`): stages, engines as rules over catalog items, takes, the marked pass, the ledger, limits. No page, no network; unit tests.
2. **The engine menu on the server** (`server/spice2.ts`): reads the catalog through the existing runner, answers each stage's engines with their forms and prices; fake mode for tests.
3. **The screen**: rail, viewer, stage panel, takes. Headless-browser tests on fake runs.
4. **Paprika**: the assistant picks engines and writes the edit plan from a brief (the existing `spice-assist.ts` pattern).
5. **The scenario**: the three shots' briefs, first frames from Codex, their specs as examples.
6. **Retire the old Spice** once the new one covers its footage, example shots and the website's Spice section; the website's Spice section and video are redone last from the new screen.

The old `spice-*.js` stays working until step 6.
