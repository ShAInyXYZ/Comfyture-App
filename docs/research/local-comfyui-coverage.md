# What runs on Local ComfyUI, section by section

30 Oct 2026. Measured against this machine's ComfyUI (v0.42 on :8188, 3705 node types, 170 model files) and read from the code.
Nothing paid was run.

## The three choices

| Choice | Render jobs (the app's own workflows) | Writers and pets, partner models | Templates (Utensils, Backstage, trends, Story's roll) |
|---|---|---|---|
| **Comfy Cloud** | Comfy Cloud | Comfy Router (key, credits) | Comfy Cloud (key, credits) |
| **Both** (new) | Your ComfyUI when it has every node and model file the job names; Comfy Cloud when not | Comfy Router | Comfy Cloud |
| **Local ComfyUI** | Your ComfyUI. A job it cannot run now stops at once and names what is missing (it used to fail inside ComfyUI) | Comfy Router if a key is set; else Gemma 4 in ComfyUI | Comfy Cloud if a key is set; else they refuse |

So the switch only ever moved the render jobs. With a key, Local mode still spends credits on writers, partner models and every
Template, and the price labels hide that (they show only on Comfy Cloud).

## Which workflows this ComfyUI can run

**Runs here (10):** Qwen Image 2.1 and its edit (the default artist), image-generate, frame-edit, sound effects (sfx), songs on ACE-Step
1.5 XL (song.json), Trellis2 3D (shape, texture, refine), pose keypoints.

**Cannot run here (30), and what it lacks:**

| Missing here | Workflows that need it |
|---|---|
| LTX-2.5 (22B transformer, VAEs, its Gemma 4 encoder, upscalers); this machine has LTX-2.3 | every video take (i2v, guided, production, motion, swap), Sound for a clip, IC-LoRA tools, outpaint |
| Gemma 4 E4B / E2B | the Gemma writer and pets (assistant, director), the prompt enhancer |
| Qwen 3.5 prompt models (`qwen3.5_9b_qwen_image_2.1_pe_*`) | "Improve the prompt" in the Oven |
| ACE-Step 1.5 turbo AIO | Music (Cut, Pickle, trend tracks) |
| MiniMax Music 3 | Jam's default song model |
| BiRefNet, SAM 3.1 | cutout, matte (Spice Cut out, reference cutouts) |
| SeedVR2, 4x-UltraSharp | video and picture upscale |
| FLUX 3 Klein, Krea 2 Turbo int8, Qwen 2.1 Turbo, Z-Image Turbo | those artists in the Oven's picker |
| nodes AudioStemSeparate, AudioSpeechToTextWhisper, AudioBPMDetector | Jam "Hear the track" and lyric sync |

## Section by section (Local ComfyUI)

✅ works here · 🔑 works with a key, on Comfy Router or Cloud, spends credits · ❌ fails here (missing model) · 🌐 needs only internet

### Home
- ✅ projects, uploads, examples, tours; take thumbnails (Qwen 2.1)
- 🔑 idea takes (writer), "Try it" on a template
- 🌐 the "Popular on Comfy Cloud" shelf (browse only)

### Kitchen · Story
- ✅ cast, prop, location and shot stills (Qwen 2.1)
- 🔑 writing (idea, script, world, board) and its assistant; end frames (hard-coded to GPT Flare); rolling a shot (a Template, always Cloud)
- ❌ the same writing with no key (Gemma 4 missing)

### Kitchen · Shot
- ✅ paint the last frame, generate a frame; share, frame grab, reels (ffmpeg)
- 🔑 shot assistant; rolls with a partner video model (Kling, Veo…)
- ❌ every LTX roll: draft, standard, production, extend, copy motion, references, resound, LoRAs; Director (Gemma only, no Router branch); prompt enhance; reference cutouts fall back to "used as it is"

### Kitchen · Cut
- ✅ timeline render, captions, sound effects, take sound to a track
- 🔑 the Cut assistant
- ❌ Make music

### Kitchen · Stage
- ✅ the 3D scene, poses, saved stages, control video, Blender bridge, render image (Qwen 2.1 edit)
- 🔑 the Stage assistant
- ❌ "Improve" the prompt

### Kitchen · Library
- ✅ browsing and deleting
- ❌ cutout, matte, upscale from it

### Mixer
- ✅ split an edit at its cuts, stars, the shelf, final cut; cast redraw (Qwen 2.1 edit, or Flare with a key)
- 🔑 Praline; the 10 Template trends; character voice swap
- ❌ rolling a mix shot; the 8 engine trends (LTX-2.5 swap); trend tracks (music)

### Jam
- ✅ upload, slice, beats (in the browser), romaji, cover picture, looks (Qwen 2.1), songs on ACE-Step XL, sound effects, render and captions
- 🔑 Pickle (song writer, chat), Backstage pictures (Flare) and videos (Templates) and its video-prompt writer (Router only)
- ❌ MiniMax songs (the default), Hear the track and lyric sync (3 nodes missing), every video roll (performance, dance, b-roll, cover video), music clips

### Macaron
- ✅ brand kit, layouts, book, PDF, mockup warp, motion, exports (browser and ffmpeg); template shoot pictures on Qwen 2.1
- 🔑 Brioche; Make a picture, UGC shots and mockups (hard-coded to Flare); video takes on a partner model
- ❌ template video takes on LTX

### Spice
- ✅ viewer, clip library, frame grabs, chain editing
- 🔑 Paprika; Restyle and Slow motion (Templates)
- ❌ every IC-LoRA tool, Cut out, Upscale, Sound (LTX-2.5, SAM 3.1, SeedVR2)

### Toaster
- ✅ clay scene, render (Qwen 2.1 edit), 3D model on Trellis2 (talks to :8188 directly, whatever the switch)
- 🔑 the pet and writer; the 4-view object sheet prefers Nano Banana; the 3D fallback (a Template)

### Cabinet
- ✅ the whole library; a shoot on Qwen 2.1 edit
- 🔑 a shoot on GPT Flare (its default)
- ❌ the other open artists in the picker

### Utensils
- ✅ all 12 edit tools and the FX (ffmpeg), sound effects, Truffle's knowledge and search; Variations and Edit picture on Qwen 2.1
- 🔑 Truffle; every Template (form, price, run, mini apps), always on Cloud
- ❌ Upscale, Cut out, Upscale video, Sound for video, Extend, Lip-sync, Music
- 🌐 browsing the ~700 templates

## What "Both" changes

On Both, each of the 30 workflows above goes to Comfy Cloud (with the key) and the 10 stay here, job by job, with no setting per
section. The local jobs also carry the Comfy key, so a partner node inside one would work (the bridge passes it to ComfyUI). Writers,
partner models and Templates are as on the other two.

## Open points to decide

1. **Video on this machine.** Download LTX-2.5 (about 60 GB for the int8 set), or make LTX-2.3 variants of the shot workflows.
2. **Writers with no key.** Download Gemma 4 E4B, or hide the writer when it is missing; give the Director a Router branch.
3. **Templates on Local.** They always go to Comfy Cloud. Running them locally means converting the UI format to API format, rebuilding the form from /object_info and downloading each template's models: a project of its own.
4. **Honest pickers.** Grey out what the ComfyUI lacks (artists, Jam's MiniMax default, the music tool), using the same /object_info check, and show credits on Local when a Router or Template call will spend them.
5. **Hard-coded Flare** in Story's end frame, Backstage, Macaron's UGC and mockups: fall back to the picked open artist.
6. **Jam hearing.** Install the three audio nodes (a newer ComfyUI or their custom node pack).
