# Mixer cast batch — 28 October 2026

Eleven playable presets with original Comfyture cast performances, scripts, first frames and sound. Ten adapt researched formats; **We Listen, We Don’t Judge** is an original Earl/Josie script, with no source video. These are script-driven adaptations, not exact motion transfers or copies of source soundtracks.

| Preset | Cast | Length |
| --- | --- | --- |
| We Listen, We Don’t Judge | Earl, Josie | 20 s (LTX-2.5 Pro revision) |
| UNO Car Reveal | Dre | 8 s |
| Tiny Desk | Margot, Theo | 10 s |
| You Talking About Me? | Dre, Theo, Earl | 10 s |
| Millionaire Advice | Earl | 8 s |
| My Reaction | Ivy | 8 s |
| Getting Robbed, But First… | Josie, Dre | 10 s |
| Slow-Motion Squad | Theo, Dre, Margot | 10 s |
| Dip On Em | Dre, Ivy | 8 s |
| Pumpkin Head Reveal | Margot | 8 s |
| Ghost Photoshoot | Josie, Ivy | 10 s |

The cast already existed in Lore; no new identity was needed. First frames were generated with Codex's built-in imagegen using the existing crew portraits as identity references. Scene briefs and final video prompts are in `production.json`. The final images, cover posters, previews, reusable recipes and public render metadata live under `web/brand/mixer/trends/<id>/`.

## Making a new version

Users pick a preset, upload a photo or assign a Lore character to each role, and press Make it. Changed roles are redrawn into the scene using the selected reference-image model. The official FastVideo FastH3 image-to-video template generates ten presets; We Listen now uses two LTX-2.5 Pro takes with character voice direction. Both generate native dialogue and sound; the final cut preserves that audio. Existing LTX motion-reference recipes remain separate and continue working.

Each recipe records the exact prompt, seed, dimensions, duration, cast and source attribution. Preview metadata includes measured provider execution time and end-to-end elapsed time. Actual per-job credits and image-generation charges were not reported and remain **null**, not zero. Displayed estimates elsewhere are not invoices.

The batch runner records submissions and resumes known cloud jobs rather than silently paying for them again. The UI saves completed steps, resumes a known job, and prevents automatic resubmission after an ambiguous network failure. Cloud job handles currently remain in server memory; restarting the app server during a user render requires checking that job rather than blindly resubmitting.

## Validation

- Reviewed time-sampled frames for all eleven previews, checking cast identity, staging and action progression.
- Verified each packaged video decodes, has an audio stream, and reaches the requested duration.
- Local Whisper transcription of the original We Listen script recovered every line. Also checked the diner dialogue, millionaire joke and Tiny Desk singing; transcription is an aid, not a claim of perfect lip sync.
- Tests cover photo recasting, native sound retention, LTX regression, missing references, cut retries, and avoiding duplicate submissions after a lost response. All 36 relevant tests passed.
- A live Mixer test with an uploaded Ivy photo completed the reference-image redraw, FastH3 render and final cut, producing a playable video with sound in My mixes (`mixes-new-mix-83d8aa`).

## Original We Listen script (superseded)

The current 20-second LTX-2.5 Pro remake and production notes are in `../we-listen-ltx-pro-v2/`. The following is the first FastH3 version, preserved for provenance.

Together: “We listen and we don't judge.”

Earl: “I ate the last biscuit and blamed the cat.”

Josie: “Your houseplants are plastic. I stopped watering them months ago.”

Earl: “I was proud of those.”

They break into laughter.
