# Tell Me Without Telling Me — Ivy’s plant reveal

Replaces the weak “My Reaction” preview (stable catalogue ID `my-reaction`, revision 2).

## Production

- Original 10-second script: “I might have a small plant problem.” Camera reveals a living room crowded with plants. Ivy squeezes through, protecting her tiny pot: “There’s still room.”
- New built-in Codex imagegen reference, preserving `web/brand/mixer/crew/ivy.png`. Project asset: `web/brand/mixer/trends/my-reaction/look-v2.webp`.
- FastH3 at 768 × 1344, one 10-second take, seed 281026104. Video GPU execution 108.163 seconds; submitted-to-complete 120.686 seconds. No paid retries.
- Original fictional Ivy voice reference: Seed Audio 1.0, 10.104 seconds. Soft adult middle register, slightly airy, gentle British conversational delivery, dry plant-shop wit. Saved as `web/brand/mixer/voices/ivy-v1.mp3`. No real person’s voice was cloned.
- MelBandRoFormer splits the native speech from room ambience. Chatterbox VC converts the speech into Ivy’s reusable synthetic voice. Original ambience is mixed back in; native speech is muted. No replacement music.
- Native and converted speech transcribed with faster-whisper base.en; both lines retained, maximum observed word-boundary shift 0.08 seconds. Final audio trimmed to the 10-second video. The final homophone was transcribed as “They’re”; the intended line is “There’s still room.” Automatic transcription is not a subjective voice-quality evaluation.
- Reveal cover extracted from the actual finished video at 8.3 seconds.

## Cost and timing

See `post-production.json` for stage receipts and `web/brand/mixer/trends/my-reaction/recipe.json` for public generation metadata. Four cloud jobs; total production interval 272 seconds (includes orchestration gaps). Actual per-job credit billing was not returned.

Estimated video/audio production: **38.07–44.50 credits** (~$0.18–$0.21), including the reusable voice setup. Recurring video + stem split + voice conversion estimate: **30.50 credits**, before any new image redraw. These are estimates from workflow execution seconds, not invoices or guaranteed future prices.

GPU estimate: 0.266 credits/second, $1 = 211 credits ([Comfy credit documentation](https://support.comfy.org/articles/5846341390-how-credits-work-in-comfy), checked 28 October 2026). Seed Audio tool estimate: 45 credits/minute, about 7.58 credits for this sample. The upper estimate additionally counts all voice-design execution seconds at the GPU rate conservatively; provider waiting may not be billable GPU time. Built-in imagegen billing is unavailable and excluded from Comfy credit totals.

## App behavior

Ivy uses her saved voice. Photo replacements use this disclosed fictional role voice; a photo never clones the photographed person’s voice. Other crew retain their own text-directed native voices until authored recordings are available. Only one speaking role is handled by this recipe’s conversion pass.

Each paid stage persists its job before polling. Completed video and stems are reused after downstream failures. Ambiguous submissions stop without duplicate charges. Re-hosted audio retains output-node IDs so speech and ambience are mapped correctly even when provider filenames are hashes. The final cut includes separate voice and ambience tracks.

## Reference image prompt

Built-in imagegen, with Ivy’s existing portrait as identity reference: vertical 9:16 tactile 3D animation first frame; Ivy with the same bob, round glasses, green cardigan and brown corduroy trousers, holding one tiny terracotta plant in an apartment doorway. Innocent guilty smile; waist-up framing; doorway obscures most of the room with only a few leafy hints. Natural restrained daylight and color. Stable identity, clear hands and plant, no text or extra people. Full video script and voice-design prompt are in `recipe.json` and `voice-design.json`.

## Validation

45 tests passed across template execution/output metadata, Mixer flow, voice conversion retry safety, and published assets. Browser checked the updated card, cover, ten-second playback and voice method. Production render/contact sheet/transcripts and screenshot are kept under `output/ivy-plant-reveal/` (local QA artifacts).
