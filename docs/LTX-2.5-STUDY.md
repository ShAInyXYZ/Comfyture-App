# LTX-2.5 for video-to-video character replacement with lip sync

*A study for Comfyture's trend previews. October 2026.*

## Abstract

We want an 18-second music performance re-performed by two original 3D animated characters: the same shots, moves, camera and timing, with mouths in time with the original vocals. This study reviews LTX-2.5 (Lightricks' 22-billion-parameter joint audio-video diffusion transformer) from its code, model cards, documentation and community reports. It then tests the methods it suggests on Comfy Cloud. Three findings shape the result. First, every official LTX-2.5 ComfyUI workflow uses the distilled model, but the audio-to-video guidance that drives lip sync only works on the full ("dev") model. Second, in the official two-stage control graph the motion guide is read at a quarter of the output size and dropped before refinement, which caps the detail of hands and mouths. Third, a human pose skeleton pulls cartoon characters toward human proportions, and nothing in the stack holds a character's identity beyond its first frame. Our v3 pipeline runs the dev model with Lightricks' own guidance, re-applies the pose at full resolution in the second stage, and freezes the isolated vocals into both stages.

## 1. Introduction

The task is *character replacement with motion and audio preserved*. Inputs: a source clip (two performers rapping at a hanging microphone in front of an orange backdrop, five shots), our two characters (Praline and Sesame, upright Pixar-like kittens), and the source's vocals. Output: the same 18 seconds, with the kittens in the performers' places.

Constraints: everything runs on Comfy Cloud, as ComfyUI graphs over open weights; the output becomes a trend preview, so it must look finished.

Questions studied:

1. Which LTX-2.5 variant and settings give the best quality, and how do they map to ComfyUI nodes?
2. How should a video's motion be transferred onto characters with different proportions?
3. How do we lip-sync to an *existing* track?
4. What resolution is right?

## 2. The model

### 2.1 Architecture

LTX-2.5 is a 48-block dual-stream diffusion transformer [A1, A2].

- **The two streams.** The video stream is 4096-dimensional (32 heads × 128) and the audio stream 2048-dimensional. Each block runs self-attention, then cross-attention to the text, then audio↔video cross-attention, then a feed-forward layer.
- **Size.** The dev transformer is a 42 GB bf16 file, about 21 billion parameters. The growth from LTX-2's 19B to 22B is all in the text path [A3].
- **The video VAE** compresses 32×32 pixels and 8 frames into one 128-channel latent (causal in time: `1 + (F − 1)/8` latent frames). In 2.5 it decodes with a *diffusion decoder*, for sharper faces and fewer smears in fast motion; a lighter convolutional decoder also ships [A4, A5].
- **The audio VAE** encodes 16 kHz stereo mel spectrograms into about 25 tokens per second.
- **The text encoder** is Gemma 4 12B (fine-tuned for LTX in 2.5).
  - All of its hidden states are normalized and concatenated, then projected to each stream.
  - Bidirectional connectors with learnable register tokens sit between the encoder and the transformer.
  - Text enters every block through cross-attention [A1, A3].
- **Positions** use 3D RoPE: time in seconds, plus pixel coordinates. The range spans 20 seconds, which is also the maximum clip length [A1, A6].

### 2.2 Training

What is published:

- LTX-2's flow-matching training on audio-rich video, with a frozen Gemma [A1].
- A design built around a roughly 0.5 MP base generation followed by upscaling.
- Native portrait up to 1080×1920 from LTX-2.3 on [A7].
- A 20-second maximum.

Not published: the training resolutions, frame counts and fps; how distillation was done; any dev-versus-distilled measurements. The 2.5 distilled model is said to "retain much more of the full model's visual quality, prompt adherence, and motion consistency" than earlier ones [A8].

### 2.3 Variants

| Variant | File (Comfy Cloud) | Use |
|---|---|---|
| dev | `ltx-2.5-22b-dev-transformer-bf16` | 30 guided steps; all LoRA training; guided text/image/audio-to-video |
| distilled | `ltx-2.5-22b-distilled-transformer-bf16` (and int8, nvfp4) | fixed 8 steps at CFG 1; every official ComfyUI workflow, IC-LoRA graphs, DFR |
| distilled LoRA | `ltx-2.5-22b-distilled-lora-450-bf16` | turns dev into a fast refiner for the second stage |

Lightricks calls distilled "not preview quality": DFR, their production path for image-to-video, runs only on it [A9, A10]. Their staff also say dev "will give you better details and versatility but it requires 30 steps" [A11]. Our experiments (Section 6) explain the apparent contradiction for this task: the audio-to-video guidance that drives lip sync needs dev.

## 3. Inference

### 3.1 Latent geometry

Video tokens = `(1 + (F − 1)/8) × (H/32) × (W/32)`. Single-stage sizes are multiples of 32, two-stage finals multiples of 64. Frames are `8n + 1`.

| Size (121 frames) | Tokens | Note |
|---|---|---|
| 768×512 | 6,144 | Python default stage 1 (3:2) |
| 960×544 | 8,160 | official stage 1 (16:9) |
| 960×640 | 9,600 | our v3 stage 1 (3:2) |
| 1536×1024 | 24,576 | Python default final (3:2) |
| 1920×1088 | 32,640 | HQ preset final (16:9) |
| 1920×1280 | 38,400 | our v3 final (3:2) |

Sizes far beyond the training range degrade. Lightricks tiles anything larger [A6]. One latent cell is 32×32 pixels and 8 frames, so a 100-pixel face at stage 1 spans about three cells. That is why faces and mouths need resolution.

### 3.2 The distilled recipe (official ComfyUI graphs)

1. **Stage 1** at half the output size: `ManualSigmas` `1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0`, `euler_ancestral`, `CFGGuider` at 1.
2. **Upscale** ×2 with `ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0`.
3. **Stage 2:** 3 steps on `0.909375, 0.725, 0.421875, 0.0`, `euler` [A5].

Two cautions. Comfy-Org's own 2.5 templates still use the 2.3 stage-2 schedule (`0.85, …`), which Lightricks calls wrong for 2.5. The 2.3 upscalers are not interchangeable with 2.5's [A5, A12].

### 3.3 The dev recipe (Lightricks' Python defaults for 2.5)

`constants.py` gives a 2.5 checkpoint the 2.4 row: the 2.3 settings, plus image compression 18 [A13].

- **Steps and scheduler.** 30 steps, deterministic Euler, `LTX2Scheduler(max_shift 2.05, base_shift 0.95, stretch, terminal 0.1)`. The pipelines call it without a latent, so the shift is the fixed 4096-token one (2.05).
- **Guidance, per modality, on the denoised estimate:**

  `pred = c + (cfg − 1)(c − u) + stg·(c − p) + (m − 1)(c − i)`, then rescaled toward the conditional's standard deviation by `r`.

  Here `c` is conditional, `u` unconditional (the negative prompt), `p` perturbed (STG: block 28's self-attention bypassed), and `i` isolated (audio↔video cross-attention cut in every block) [A14].
- **Values.** Video: cfg 3, STG 1 on block 28, rescale 0.7, modality 3. Audio: cfg 7, the rest the same. That is four model passes per step: 120 evaluations against distilled's 8.
- **Negative prompt.** A long default listing artifacts. It also lists "cartoonish rendering, 3D CGI look", which must go for animated characters.
- **Stage 2.** Dev plus the distilled LoRA at 1.0, the 3-step schedule, no guidance, audio frozen.
- **HQ preset.** res_2s, 15 steps, STG off, rescale 0.45, distilled LoRA at 0.25 in stage 1 and 0.5 in stage 2, 960×544 → 1920×1088.

The modality term is what lip sync rides on. Lightricks' audio-to-video pipeline describes its `--a2v-guidance-scale` 3.0 as "may increase lipsync quality" [A15]. Users who tried modality guidance on distilled found it "unusable at every strength" [A16].

### 3.4 In ComfyUI

| Python | ComfyUI node (pack) | Settings |
|---|---|---|
| LTX2Scheduler | `LTXVScheduler` (core) | 30, 2.05, 0.95, stretch, 0.1, latent **unconnected** |
| MultiModalGuider | `MultimodalGuider` + `GuiderParameters` (ComfyUI-LTXVideo) | skip_blocks "28"; VIDEO cfg 3, stg 1, rescale 0.7, modality 3 |
| — (core-only) | `LTXVSpatioTemporalGuidance` → `LTXVModalityGuidance` → `LTXVDualCFGGuider` | no rescale equivalent |
| image CRF 18 | `LTXVPreprocess` img_compression 18 | core default is 35 |
| stage 2 | `LoraLoaderModelOnly` distilled LoRA 1.0, `CFGGuider` 1, `ManualSigmas` | euler |

Pitfalls:

- `GuiderParameters` defaults `modality_scale` to 0, which pushes *against* sync.
- `skip_blocks` defaults to empty.
- Connecting the latent to `LTXVScheduler` at full resolution sends the shift to about 9.
- STG in `MultimodalGuider` may conflict with ComfyUI's newer attention containers. Fall back to stg 0, as the HQ preset does [A3].

## 4. Conditioning

### 4.1 The first frame

`LTXVImgToVideoInplace` pins an image into the first latent frame. It is "first-frame / keyframe conditioning, not an identity encoder": even at strength 1, identity drifts through large motion [A17].

### 4.2 In-context LoRAs

IC-LoRAs take their guide as extra tokens appended to the sequence (`LTXAddVideoICLoRAGuide`), and `LTXVCropGuides` removes them after sampling.

The union-control IC-LoRA (`ltx-2.3-22b-ic-lora-union-control-ref0.5`) learned canny, depth and pose [A18]:

- **What the file is.** Rank 64, video modules only, version metadata 2.3. Its reference downscale factor is 2: the guide is resized to half the stage size, encoded, and spread over every other latent cell. Stage sizes must therefore be multiples of 64 [A19].
- **Training.** The base, resolution and frame count are unpublished. Lightricks trains IC-LoRAs on dev and validates them there at 960×544×89, 30 steps, CFG 3, STG 1; they apply to dev or distilled [A20, A21].
- **Official use.** Distilled at CFG 1. The guide is read at **a quarter of the output size** (half the stage, of a half-size stage 1) and dropped before the refine pass. Lightricks' Python pipeline can keep it in stage 2 (`--stage-2-ic-lora`) [A19, A22].
- **Detail loss.** The AVControl paper notes that reducing a pose or depth canvas beyond 2× "causes some loss of structural fidelity" [A23].

### 4.3 Audio to video

Only the official audio-to-video recipe follows a *given* track [A5, A24]:

1. Encode the track (`LTXVAudioVAEEncode`) and give it a zero noise mask (`SolidMask` 0 → `SetLatentNoiseMask`) in both stages.
2. Decode only the picture, and mux the original waveform.

Requirements:

- **The track must be as long as the video.** Otherwise the model makes up the remaining mouths [A25].
- **Isolated vocals work best for music** [A26].
- **Name who sings in the prompt.** Two singers can both end up mouthing the words [A27].

Dub-It (formerly LipDub) and the ID-LoRAs generate new speech, so they cannot follow a song [A28]. Community reports say pose guides weaken lip sync on 2.3 [A29]; we test this in Section 6.

### 4.4 Identity

The only official 2.5 identity adapter is Ingredients (a reference sheet, dev-trained at 768×448×121) [A30]. Stacking it with union control is undocumented, and their downscale factors conflict [A19].

## 5. Character replacement methods

| Method | Motion source | Character source | Verdict |
|---|---|---|---|
| Union pose IC-LoRA + first frame | DWPose skeleton | first frame | best available; human proportions |
| Union depth / canny | depth / edges | first frame | carries the human silhouette |
| Edit Anything v2 (LTX-2.5) | whole source video | instruction | **tested: human bodies return** |
| Edit Anything v0.1 motion transfer (2.3) | source video | edited first frame | custom sampler; fails on cuts and fast motion [A31] |
| Head swap (BFS v3) | source video | face reference | keeps human bodies |
| Masked reference inpaint (R2V) | none inside the mask | reference image | motion re-invented |
| Layout-to-Render (2.5) | a 3D blocking render | look image | needs our own 3D animation [A32] |
| Motion Transfer (2.5, Lightricks) | driving video | look still | documented, not released [A33] |

Retargeting the skeleton to the characters' proportions is a mitigation the literature uses: bone lengths are scaled per limb and re-anchored [A34]. We have not tried it yet.

## 6. Experiments

**Setup.**

- **Source.** 1536×1024 (3:2), cut at five shots by an adaptive scene detector (Section 6.5).
- **Vocals.** Separated on Comfy Cloud.
- **First frames.** GPT Image edits of each shot's first frame from the characters' identity sheets, upscaled with 4x-UltraSharp.
- **Rendering.** Every take runs on Comfy Cloud.

### 6.1 v1: the app's first motion graph

The settings:

- Distilled two-stage, but the 2.3 upscaler and the 2.3 stage-2 schedule.
- No audio given to the model; the song was laid on afterwards.
- Output 1408×1024, center-cropped.

Result: fast motion smeared and faces warped, and the mouths had no relation to the song.

### 6.2 v2: Lightricks' distilled union graph, with frozen vocals

The settings:

- The official 2.5 Union Control graph, node for node.
- The first frame pinned in both stages.
- The shot's isolated vocals frozen in both stages.
- Output 1536×1024.

Ablations on shot 2:

| Variant | Observation |
|---|---|
| face landmarks on | sharp paws and fur in fast motion; clean muzzles |
| face landmarks off | no visible difference |
| + Pixar Toon style LoRA | no visible difference |
| Edit Anything v2 instead of union | cat heads on human bodies, a human face behind |

Against v1 at the fastest frames, v2 keeps paw pads, fur and eyes where v1 smears. Reviewed by eye, it was still not good enough: the guide was read at 384×256, and lip sync on distilled has no audio-to-video guidance.

### 6.3 v3: dev with Lightricks' guidance, and the pose at full resolution

Changes from v2:

- **Model and guidance.** Dev transformer. `MultimodalGuider` with video cfg 3, STG 1 on block 28, rescale 0.7, modality 3. `LTXVScheduler` at 30 steps, Euler.
- **Size.** Stage 1 at 960×640; stage 2 at 1920×1280.
- **Pose.** Read once from the full-size clip at DWPose resolution 1024. It guides stage 1 halved, then **is added again in stage 2 at full size**, and is cropped before decoding.
- **Stage 2 model.** Dev plus the distilled LoRA at 1.0.
- **Negative prompt.** Lightricks' default without the anti-cartoon terms, plus "human body, human hands, human face, clothes".
- **Decode.** Larger tiles (1024/256, temporal 128/48).

Ablation: union strength 1.0 against 0.7 (the documented softer guide, for stylized characters).

### 6.4 Results

**STG fails on Comfy Cloud.** With STG on, the first stage stops with `'AttentionTensorContainer' object has no attribute 'shape'`, as the code review predicted (Section 3.4). v3 therefore runs `MultimodalGuider` with STG off and everything else as Lightricks' defaults: cfg 3, rescale 0.7, modality 3. Lightricks' HQ preset also runs without STG. That leaves three passes per step instead of four.

**Shot 2, v2 against v3,** compared at the fastest frames, at full resolution:

- Fur is denser and better defined.
- Paws read as paws, and the paw thrust holds its shape.
- Faces are cleaner. Open-mouth shapes (teeth, tongue) are clearly formed on the sung syllables, where v2's mouths were small and blurred.
- Union strength 1.0 and 0.7 follow the source's moves equally closely. 0.7 is kept for the stylized characters, as the union-control documentation suggests for a softer guide.

**Cost.** One 4.7 s take at 1920×1280 took 3.5–5.5 minutes on Comfy Cloud, against about 1 minute for v2.

### 6.5 v4: the skeleton rebuilt for kittens

v3 copied the moves faithfully but its cats were humanoid: tall, long-armed, with hands for paws. The pose it followed was a human's: 18 body points with human bone lengths, 21 points per hand (fingers), and 70 face points.

v4 rebuilds the skeleton before the model sees it (`server/pose.ts`):

1. **Keypoints.** DWPose's keypoints come back as data: `POSE_KEYPOINT` through `PreviewAny` to `SaveText` (`workflows/pose-keypoints.json`).
2. **Rebuild.** Each person is tracked to a character, and every bone keeps its angle frame by frame but takes a kitten's length: neck 0.75, face 1.4 (a wide head sitting on the shoulders), shoulders 0.7, arms 0.55, body 0.6, legs 0.5 of the person's.
3. **Placing.** Where the feet show (the wide shot), the kitten stands on the same floor and comes out small. Elsewhere its nose stays on the person's nose, so the face is where the mouth and the microphone are.
4. **Dropped points.** Hands and face points are left out. Paws stay paws, and the voice, through the audio-to-video guidance, moves the mouths.
5. **Drawing.** The result is drawn exactly as DWPose draws (17 limbs, its colours, 4 px), checked against its own render, and fed to the dev graph as a ready-made control (`control: "ready"`) at strength 0.8.

The first frames were redrawn to that skeleton: five GPT Image sessions in parallel, each given the shot's frame, the kitten skeleton over it, and the characters' sheets.

**Result.** Small, chibi kittens with round paws and toe beans, doing the source's moves: the paw thrusts, the turn-around, the paw to the mouth, the salute. Same detail as v3. Cost 240 credits for the 18 s (5 takes plus upscales), the same as v3.

### 6.6 v5: a portrait take from a landscape clip

The trend's preview is watched on a phone, in 9:16. The clip is 3:2 and its two performers stand apart, so a 9:16 crop cuts both in half in every medium shot.

v5 lays the characters out again for the new frame (`reframe()` in `server/pose.ts`, `--size` in `scripts/retarget-pose.ts`):

1. **Per shot, once.** One transform for all of a shot's frames, so every move and every turn of the camera stays.
2. **Closer together.** Each character keeps room around its skeleton for the head, body and tail drawn over it. The gap between them closes to a quarter of a body: room for the microphone.
3. **Across the frame.** The row spans the frame's width. A wide shot, where everyone's feet show, spans half of it, so it still reads as the camera pulled back.
4. **One floor.** Feet sit at 0.8 of the height: where the ankles are, else where the build's short legs put them under the hips.

The first frames were drawn for the new frame: there is no source frame to draw over, so each GPT Image session got the new stage instead: the backdrop, the skeleton, and the source's own microphone hung between the two at eye height. Kept where the people had it, as in v4's wide shot, it hung far above the kittens.

Takes ran at 576×1024 (1152×2048 out), with v4's seeds and settings.

**Result.** The same kittens and moves at the phone's shape, the microphone at their heads in every shot. The five takes cost 217 credits.

### 6.7 Smalltown Boy: animals as the performers

The second trend's source is two real cats standing up, filmed for a phone (9:16). DWPose, built for people, finds nothing in it. AnimalPose (AP-10K, 17 animal points) finds both cats in most frames, with reliable eyes and noses but unreliable legs up close.

`parseAnimalPoses()` maps those points onto the body points the union IC-LoRA was trained on:

- The front legs become arms and the back legs become legs.
- The ears are set out from the eyes, and a missing neck is placed below the nose.
- A cat close to the lens keeps only its head.

The `CAT` build turns a real cat's proportions (a small head, a long body) into our kittens' (a head half again as big, a shorter body). Two fixes clean up the detector:
- `hold()` keeps a point the detector misses for a frame or two;
- a bone read longer than 1.5 times its usual length in the clip is cut back.

The trend's cover is the source's opening, mirrored and half a second in. So the source was mirrored and started there, and shot 1's two skeletons were scaled and moved to the cover's kittens (eyes and nose on theirs). The cover is shot 1's first frame, and the preview starts on it. The other five first frames were drawn from the cover: its kitchen, light and kittens, at each source frame's camera and placing.

Six dev takes, one per real shot (the longest 185 frames, 7.7 s), cost 287 credits. Only the first two shots are sung; the frozen vocals keep the mouths still in the instrumental rest.

### 6.8 Engineering issues found on the way

- **Cut detection.** ffmpeg's scene score for real cuts on a plain backdrop was about 0.2, so a fixed 0.3 threshold found none. The threshold now adapts: six times the clip's 90th-percentile score, clamped to 0.1–0.3.
- **Off-by-one clips.** Shot clips started a frame late and ended a frame into the next shot (millisecond-rounded seeks). Fixed by seeking half a frame early and trimming by frame count.
- **`8n + 1` rounding** cut up to 0.3 s off every take. Fixed by holding each clip's last frame for eight more.
- **No sound in VS Code.** Its media player has no AAC decoder, so review copies use Opus.
- **Black takes that "succeeded".** One shot's prompt gave all-black frames every time, with two seeds, another shot's first frame or another shot's pose; the same prompt with one word less came out right, and a longer prompt worked too (prompts are padded to 1024 tokens), so it is that wording, not its length. It cost two full takes and 83 credits of 17-frame tests to find. Every take is checked for black frames before the cut.

## 7. Discussion

**Proportions.** A human skeleton drives where limbs and heads go. Upright kittens whose heads are a third of their height cannot follow it without stretching. Lowering the control strength trades fidelity for shape. Retargeting the skeleton is the principled fix.

**Identity.** One pinned frame holds a character for a few seconds at best. Ingredients, or a LoRA trained on our characters, would hold it longer; neither is wired yet.

**Lip sync.** Freezing the vocals is necessary but not sufficient. The audio-to-video guidance term needs dev and real CFG. Two characters on one voice need the prompt to say who sings.

**Resolution.** Detail lives in stage 2. The official graph refines without its guide, so stage 2 invents hands and mouths. Re-applying the guide at full size is what lets the source's fine motion through.

## 8. Recommended recipe and future work

The recipe is v4, laid out for the frame's shape as in v5:

- `workflows/shot-swap-dev.json`, built by `buildSwap()`, fed the skeleton rebuilt by `server/pose.ts` for the characters' build and laid out for the frame.
- First frames drawn to that skeleton.
- The inputs and steps are in [VIDEO-TO-VIDEO.md](VIDEO-TO-VIDEO.md).

Future work:

1. Builds for other characters (dogs, children, tall creatures) beside the kitten's.
2. Test Ingredients beside union control for identity.
3. Train a LoRA on Praline and Sesame on the dev model.
4. Adopt Lightricks' Motion Transfer IC-LoRA when it is released.
5. Try a Refine-Details pass toward 4K.

## References

- [A1] LTX-2 technical report. https://arxiv.org/html/2601.03233v1
- [A2] LTX-2 code: transformer, attention. https://github.com/Lightricks/LTX-2/tree/main/packages/ltx-core
- [A3] LTX-2 and LTX-2.3 checkpoint headers. https://huggingface.co/Lightricks/LTX-2.3 ; https://github.com/Lightricks/LTX-2/blob/main/README.md
- [A4] LTX-2.5 model card. https://huggingface.co/Lightricks/LTX-2.5
- [A5] Lightricks' LTX-2.5 ComfyUI example workflows and README. https://github.com/Lightricks/ComfyUI-LTXVideo/tree/master/example_workflows/2.5
- [A6] LTX-2 pipelines documentation (resolutions, tiling). https://github.com/Lightricks/LTX-2/blob/main/packages/ltx-pipelines/docs/pipelines.md
- [A7] LTX-2.3 overview. https://ltx.io/model/ltx-2-3
- [A8] LTX-2.5 overview. https://ltx.io/model/ltx-2-5
- [A9] "What is model distillation". https://ltx.io/blog/what-is-model-distillation
- [A10] LTX-2 changelog (DFR). https://github.com/Lightricks/LTX-2/blob/main/CHANGELOG.md
- [A11] LTX-2.5 discussion #35. https://huggingface.co/Lightricks/LTX-2.5/discussions/35
- [A12] Comfy-Org workflow templates. https://github.com/Comfy-Org/workflow_templates/tree/main/templates
- [A13] `constants.py`. https://github.com/Lightricks/LTX-2/blob/main/packages/ltx-pipelines/src/ltx_pipelines/utils/constants.py
- [A14] `guiders.py`, `denoisers.py`. https://github.com/Lightricks/LTX-2/blob/main/packages/ltx-core/src/ltx_core/components/guiders.py
- [A15] `a2vid_two_stage.py`. https://github.com/Lightricks/LTX-2/blob/main/packages/ltx-pipelines/src/ltx_pipelines/a2vid_two_stage.py
- [A16] LTX-2.5 discussion #44 (audio to video). https://huggingface.co/Lightricks/LTX-2.5/discussions/44
- [A17] LTX-2 issue #255 (first frame is not an identity encoder). https://github.com/Lightricks/LTX-2/issues/255
- [A18] Union Control card. https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-Union-Control
- [A19] `iclora.py`, `iclora_utils.py`. https://github.com/Lightricks/ComfyUI-LTXVideo/blob/master/iclora.py
- [A20] LTX-2 issue #243 (train on dev, apply on either). https://github.com/Lightricks/LTX-2/issues/243
- [A21] Trainer IC-LoRA config. https://github.com/Lightricks/LTX-2/blob/main/packages/ltx-trainer/configs/v2v_ic_lora.yaml
- [A22] `ic_lora.py`. https://github.com/Lightricks/LTX-2/blob/main/packages/ltx-pipelines/src/ltx_pipelines/ic_lora.py
- [A23] AVControl. https://arxiv.org/html/2603.24793v1
- [A24] Audio-to-video guide. https://docs.ltx.io/open-source-model/usage-guides/audio-to-video
- [A25] ComfyUI `nodes_lt.py` (audio masks). https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_extras/nodes_lt.py
- [A26] "How to generate video from audio in LTX". https://ltx.io/blog/how-to-generate-video-from-audio-in-ltx
- [A27] LTX-2 issue #320 (several mouths, one line). https://github.com/Lightricks/LTX-2/issues/320
- [A28] Dub-It. https://docs.ltx.io/open-source-model/feature-guides/audio/dub-it-beta
- [A29] Community: motion IC-LoRA with input audio. https://huggingface.co/RuneXX/LTX-2.3-Workflows/discussions/66
- [A30] Ingredients 2.5 card. https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Ingredients
- [A31] Edit Anything. https://huggingface.co/Alissonerdx/EditAnything
- [A32] Layout-to-Render. https://docs.ltx.io/open-source-model/vfx-post-production/layout-to-render
- [A33] Workflow and asset compatibility. https://docs.ltx.io/open-source-model/reference/workflow-asset-compatibility
- [A34] Wan-Animate (pose retargeting). https://arxiv.org/html/2509.14055v1
