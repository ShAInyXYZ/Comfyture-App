# Video to video with LTX-2.5

How Comfyture swaps who is in a clip while keeping how it moves, camera, timing and lip sync included, and how we make a trend's preview video with our own characters. Everything here was checked against Lightricks' own example workflows and model cards (October 2026), and tested on Comfy Cloud.

## What runs where

There are two ways to use LTX-2.5 from Comfy Cloud, and they do different things:

- **Open weights in a ComfyUI graph.** Comfyture sends its own workflow (`workflows/*.json`) to Comfy Cloud, which runs it on its GPUs with the model files it hosts. The graph decides the model file, the LoRAs and IC-LoRAs, the steps. This is the only way to give LTX-2.5 a video, a pose, a LoRA. Billed by GPU time.
- **Lightricks' hosted API** (the partner nodes `LtxApi25TextToVideo`, `LtxApi25ImageToVideo`, `LtxApi25AudioToVideo`; "LTX-2.5 Fast" and "LTX-2.5 Pro"). Comfy Cloud forwards a prompt, a first frame or a soundtrack to Lightricks' servers. No input video, no LoRAs, so no video to video.

## The model

LTX-2.5's open weights come as **dev** (the full model: about 30 steps with real guidance) and **distilled** (trained to finish in 8 steps at CFG 1). Every one of Lightricks' LTX-2.5 example workflows for ComfyUI runs the distilled transformer, IC-LoRA ones included; dev only appears in their Python guided pipelines. Comfyture follows the examples.

Their two-stage recipe, used as is:

| | Stage 1 | Stage 2 |
|---|---|---|
| Size | half the output, multiples of 64 (768×512 for a 3:2 output of 1536×1024) | ×2 by `ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0` |
| Steps | `ManualSigmas` `1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0` | `0.909375, 0.725, 0.421875, 0.0` |
| Sampler | `euler_ancestral`, `CFGGuider` at 1 | `euler`, CFG 1 |
| First frame | `LTXVImgToVideoInplace`, strength 1 | pinned again, strength 1 |

Files on Comfy Cloud: `ltx-2.5-22b-distilled-transformer-bf16`, `gemma4-12b-with-proj-ltx-2.5-bf16` (text encoder), `ltx-2.5-video-vae-bf16`, `ltx-2.5-audio-vae-bf16`, `ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0`.

Rules:

- Frames are `8n + 1`, at 24 fps. The last frame or two come out softer: render eight frames more than you need and trim.
- Use the 2.5 upscaler with the 2.5 model. The 2.3 upscaler (`ltx-2.3-spatial-upscaler-x2-1.1`) and the old stage-2 schedule (`0.85, 0.725, 0.4219, 0.0`) are LTX-2.3's; Lightricks' notes say not to mix them.
- LoRAs and IC-LoRAs trained on LTX-2.3 mostly load on 2.5 (the official 2.5 examples use several), at about 1.2 for style LoRAs. Validate each one.

## Swapping who is in a clip

Two graphs, both built by `buildSwap()` in `server/workflows.ts`:

- **`workflows/shot-swap-dev.json` (best quality, used for our trend previews).** It runs the dev model with Lightricks' guidance: 30 Euler steps, `MultimodalGuider` at video cfg 3, rescale 0.7 and audio-to-video guidance 3, the voice's lever on the mouths. STG is off, because it crashes on Comfy Cloud's current ComfyUI. The first stage is 960×640; the second, 1920×1280, uses dev with the distilled LoRA. The pose is read once at full size and **added again in the second stage**, so mouths and paws keep the source's fine motion. Union strength is 0.7. Lightricks' default negative prompt is used without its anti-cartoon terms. One 5 s shot takes about 4–5 minutes. The study behind it: [LTX-2.5-STUDY.md](LTX-2.5-STUDY.md).
- **`workflows/shot-swap.json` (fast).** This is the distilled version described below, about 1 minute a shot.

The fast graph is Lightricks' `LTX-2.5_ICLoRA_Union_Control_Distilled` example, node for node, plus the frozen-audio part of their `LTX-2.5_A2V_Two_Stage_Distilled` example:

1. **The motion:** the source clip, resized to the stage-1 size, goes through `DWPreprocessor` (body, hands and face) and into `LTXAddVideoICLoRAGuide` with the union-control IC-LoRA (`ltx-2.3-22b-ic-lora-union-control-ref0.5`, strength 1). "ref0.5" means the guide is read at half the generation size: `LTXICLoRALoaderModelOnly` reads that factor (2) from the file and hands it to the guide node. Feed the guide at the generation size; the node does the rest.
2. **Who is in it:** the first frame, an edited still with the new characters standing exactly where the people stood, at their size. It is pinned in both stages. Its quality goes into every frame.
3. **The mouths:** the track (isolated vocals) is encoded with `LTXVAudioVAEEncode` and frozen with `SetLatentNoiseMask` (a `SolidMask` of 0) in both stages, so the picture is generated to it. Only the picture is decoded; the track itself goes into the file.
4. After stage 1, `LTXVCropGuides` drops the guide; stage 2 keeps the IC-LoRA on the model.

Why face landmarks on: the real performers' lips are in time with that very vocal track, so the face guide and the frozen audio agree, and the guide says which character is singing when. On our cats it gave clean muzzles.

Tested and dropped, with what they do instead:

- `edit_anything_v2_ltx2.5` (an instruction-editing IC-LoRA, the clip itself as the guide): the people's bodies, clothes and even a face came back under the cats' heads.
- Head swap LoRAs (`ltx23-head_swap_v3`): keep the human body and clothes.
- Real-to-anime style IC-LoRAs: the people stay people.
- Ingredients, Dual-Character, CrossView, Motion-Track: no way in for the clip's motion, or they move the camera.

## Lip sync to a given track

Only audio-to-video with the track frozen follows a track you give it (above). LipDub (now "Dub-It", LTX-2.3 only) and the ID-LoRAs generate *new* speech from the prompt, in the source's voice; they cannot follow a song.

- Condition on the isolated vocals; Lightricks' advice for music videos. Comfyture's Jam listen job separates them on Comfy Cloud (`workflows/jam-analyze.json`). Put the full mix in the final file.
- The track must cover every frame. Shorter, and the model makes up the mouths at the end.
- Name who sings in the prompt, and keep the vocals dry; heavy reverb reads as backing singers.

## Making a trend's preview

Our trend presets are previewed by our own characters doing the trend, instead of the original video. The steps, for one clip:

1. **The clip,** cropped to a shape its people fit in (3:2 for Hotel Lobby, whose two performers stand apart), uploaded (`POST /api/videos`) and split at its cuts (`POST /api/mixer/split`). Each shot comes back with its first frame and its own clip, the shot's last frame held eight more. The takes can be another shape (step 3).
2. **The vocals:** the clip's sound as a track (`POST /api/audio` with the video), then `POST /api/jam/listen`.
3. **The skeleton, rebuilt for the characters:**
   - Run `workflows/pose-keypoints.json` on each shot's clip (DWPose's keypoints as JSON text).
   - Then run `node scripts/retarget-pose.ts keypoints.json pose.mp4 pose-first.png`. It keeps every move but gives each person the characters' build (`KITTEN` in `server/pose.ts`), leaves out the hands and face points, and draws it the way DWPose does.
   - Without this, a person's skeleton turns small characters into tall ones with fingers.
   - For a frame of another shape, add `--size`. Hotel Lobby's preview is 9:16 for phones (`--size 1152x2048`), made from a 3:2 clip, where a straight crop cuts the pair in half. The characters are laid out again (`reframe()` in `server/pose.ts`): side by side, closer together, across the frame's width, feet on one floor. Each shot is laid out once for all its frames, so every move stays. A wide shot, where everyone's feet show, keeps air around them. The script prints the spot between the two at eye height, where a shared microphone hangs.
4. **First frames,** one per shot: GPT Image (Codex) with the shot's first frame, the characters' identity sheets and the trend's approved artwork. Run one session per frame in parallel. The brief: the same framing, backdrop and props; the characters posed on the rebuilt skeleton (`pose-first.png`, and the same over the frame), at its size and proportions; paws, never fingers; no text. Check the set side by side once, then stop.
   - For another shape there is no source frame to draw over, so draw the new frame's stage instead: the backdrop, the skeleton, the props where they go. Hang the microphone at the characters' eye height. Left where the people had it, it hangs far above small characters.
5. **Takes,** one per shot, in parallel: `node --env-file=.env scripts/try-swap.ts spec.json` with the rebuilt pose video as the clip and `"control": "ready"`, the first frame, the vocals and the start time, `8n + 1` frames covering the shot plus its held frames, the first stage's size (576×1024 for a 9:16 take of 1152×2048), and a prompt in Lightricks' style: one paragraph, present tense, the action first, each character by name and look, who raps, then the sound.
6. **The cut:** each take trimmed to its shot's frames, joined, the clip's own sound muxed in.
7. **Review** side by side with the source. Review copies use Opus audio: VS Code's player has no AAC decoder and plays AAC videos silent.

The source clips stay in `docs/brand/mixer-crew/` and are never committed; the previews replace them in the app.

## Traps we hit

- **Cuts on a plain backdrop** score about 0.2 on ffmpeg's scene score; a fixed 0.3 found none of Hotel Lobby's. The splitter now takes six times the clip's busy frames, between 0.1 and 0.3.
- **Shot clips one frame off:** times are rounded to the millisecond, so seeking to a cut can land after its first frame and read the next shot's. Seek half a frame early and cut by frame count.
- **Takes shorter than their shots:** `8n + 1` rounding cut up to 0.3 s off every take. Hold the clip's last frame eight more.
- **Our first motion workflow** ran the 2.3 upscaler and schedule, gave the model no audio and laid the song on afterwards: smeared paws, warped faces, mouths out of time. That is what `shot-swap.json` replaces.
- **Comfy Cloud** now and then loses a job ("RIP to the server your workflow was running on", or `cannot unpack non-iterable MTPHead object` from its model prefetch). Roll it again.
- **A black take that "succeeded":** one exact prompt gave all-black frames every time, with any seed, first frame or pose; the same prompt with one word less came out right. It is not the length (prompts are padded to 1024 tokens, and a longer one worked). Look at every take before cutting, and change a word, not the seed.

## Sources

- Lightricks' LTX-2.5 example workflows and their README: https://github.com/Lightricks/ComfyUI-LTXVideo/tree/master/example_workflows/2.5
- LTX-2.5 model card: https://huggingface.co/Lightricks/LTX-2.5
- IC-LoRAs and union control: https://docs.ltx.io/open-source-model/usage-guides/ic-lo-ra, https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-Union-Control
- Audio to video: https://docs.ltx.io/open-source-model/usage-guides/audio-to-video
- Prompting: https://docs.ltx.io/open-source-model/usage-guides/prompting-guide
- Dub-It (LipDub): https://docs.ltx.io/open-source-model/feature-guides/audio/dub-it-beta
- Edit Anything: https://huggingface.co/Alissonerdx/EditAnything
