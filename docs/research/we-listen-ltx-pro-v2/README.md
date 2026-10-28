# We Listen — LTX-2.5 Pro remake

Two 10-second native-audio takes, 1080 × 1920, 24 fps. Existing first-frame artwork retained; new cover extracted from the rendered video. Published in Mixer under the existing We Listen preset.

## Script and performance

Together: “We listen and we don't judge.”

Earl: “I polish my boots with your face cream.” Josie freezes, side-eyes him, then forces a smile: “No judgment.”

Josie: “I sold your real hat. That one's from a costume shop.” Earl touches his hat, looks wounded and judgmental, then forces out: “No judgment.”

Their expressions betray them; neither admits judging. The output includes a close-up of Josie's reaction despite the requested stable two-shot. The second take preserves the two-shot. This is an original scene, not a source-video recreation.

## Voices and pipeline

`web/js/mixer-voices.js` defines authored voice direction for all ten Mixer crew members and adds the selected cast's direction to generation prompts. Earl has a weathered baritone and restrained Texas drawl; Josie has warm, quick, mischievous delivery. Uploaded photos do not automatically inherit the original character's voice. These are text-directed native generated voices, not voice clones or a post-production voice-conversion pass. Cross-take vocal identity is therefore not guaranteed.

The official template is titled Pro but defaults to Fast. The request explicitly overrides node 5 to `LTX-2.5 (Pro)`, ten seconds, portrait 1080p, 24 fps and audio enabled. The executed provider graph was checked, not just the requested settings. Future user recasts use the same request builder. Shared first-frame recasts are reused across both takes; new recipe revisions cannot resume unfinished older recipes.

## Validation and metadata

- Reviewed ten sampled frames from each take for identity and facial reactions.
- Local Whisper transcription recovered every scripted line in both takes.
- ffprobe confirmed video and audio; the packaged cut is 20 seconds.
- Thirteen relevant tests passed, including explicit Pro settings, selected-cast voice direction, photo recasting, sound retention and retry protection.
- Aggregate provider execution: 161.5 seconds. End-to-end production: 194.8 seconds. This is partner execution time, not a measured GPU allocation.
- Actual per-job credit charges were not reported. Costs remain null; no new first-frame image was generated.

Full prompts, seeds, job IDs, voice directions and timing metadata are in the published recipe. Original take receipts and review artifacts are kept in `output/we-listen-ltx-pro-v2/` (local only). `mixer-scripted-preview.ts` resumes recorded jobs; `publish-scripted-mixer.mjs` packages reviewed takes without spending credits.
