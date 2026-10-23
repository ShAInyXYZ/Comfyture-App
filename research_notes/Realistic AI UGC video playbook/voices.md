# Natural, believable creator voices for AI UGC video ads (state of late Oct 2026)

Research date: 2026-10-23. Most sources are vendor, agency or affiliate blogs. I could not reach Reddit threads directly, so I found no Reddit consensus; "creator consensus" below comes from practitioner blogs and is flagged as such. Leaderboard figures come from the live Artificial Analysis page, which changes often.

## 1. Which TTS / voice models sound most human for casual UGC?

### Takeaway
In blind listener votes, ElevenLabs' **Eleven v4** and **v4 Turbo** (launched 28 Sep 2026) now top the Artificial Analysis Speech Arena. Close behind: Alibaba Qwen-Audio-3.1-TTS-Plus, Cartesia Sonic 3.6, Google Gemini 3.8 Flash TTS and Inworld Realtime TTS-2. The best open-weights model is Fish Audio Drama 3 Preview (#9). Several models named in the brief rank far lower: Hume Octave 2, OpenAI GPT-Realtime-2, Chatterbox, VibeVoice and Qwen3-TTS. The arena scores general naturalness, not a casual phone-to-camera read, so creators still need their own A/B tests.

### Cited Findings
**Artificial Analysis TTS Arena, Provider-Voice leaderboard (live page, snapshot ~Oct 2026; Elo from blind A/B "which sounds more natural" votes, Zonos-v0.1 anchored at 1000, 95% CIs)** — [Artificial Analysis leaderboard](https://artificialanalysis.ai/text-to-speech/leaderboard):
- #1 Eleven v4 Turbo: 1335 (CI 1318–1352), $40 per 1M chars, Sep 2026
- #2 Eleven v4: 1329, $80 per 1M chars, Sep 2026. The CIs of #1 and #2 overlap, so the two are effectively tied.
- #3 Qwen-Audio-3.1-TTS-Plus (Alibaba): 1301, $19.3 per 1M
- #4 Cartesia Sonic 3.6: 1289, $49 per 1M, Aug 2026
- #5 Gemini 3.8 Flash TTS (Google): 1278, $16.5 per 1M
- #6 Inworld Realtime TTS-2: 1267, $20.8 per 1M
- #9 Fish Audio Drama 3 Preview: 1248, $15 per 1M, **open weights**, Oct 2026
- #10 Speechify Simba 3.2: 1245, $6.6 per 1M
- #12 Mistral Voxtral 3 TTS: 1218
- #15 ElevenLabs v3 Conversational: 1214
- #20 Fish Audio S2.1 Pro: 1189
- #21 Eleven v3: 1183, $100 per 1M
- #24 MiniMax Speech 2.8 HD: 1174
- #37 Fish Audio S2 Pro: 1112 (open weights)
- #39 Chatterbox HD (Resemble): 1109
- #43 ElevenLabs Multilingual v2: 1096
- #53 OpenAI GPT-Realtime-2: 1075, $191.6 per 1M
- #57 Kokoro 82M: 1065, $0.7 per 1M (open)
- #63 Hume Octave 2: 1055, $87.5 per 1M
- #78 Chatterbox (open): 1024
- #83 Microsoft VibeVoice 1.5B: 956 (open)
- #86 Qwen3 TTS Flash: 943
- #87 Qwen3 TTS: 930
- #90 XTTS v2: 916

The page lists 18 open-weights models in total.

**Other snapshots and leaderboards:**
- The #1 spot changed several times in 2026:
  - In May 2026, Gemini 3.1 Flash TTS led at Elo 1214 — [MarkTechPost, 30 May 2026](https://www.marktechpost.com/2026/05/30/best-text-to-speech-tts-models-in-2026-a-benchmark-based-comparison/).
  - A Speechify write-up dated 23 Sep 2026 (vendor blog, seen as a search snippet) had Cartesia Sonic 3.6 on top at 1,273 — [Speechify](https://speechify.ai/blog/simba-3-tops-artificial-analysis-tts-leaderboard) / [Speechify comparison](https://speechify.ai/blog/best-tts-providers-2026-comparison). That was five days before v4 launched.
- **Controlled Voice Arena**: every model is compared on the same 8 *cloned* voices, so voice choice is factored out. Cartesia Sonic 3.5 led at 1,122 Elo as of 8 Jul 2026 — [Artificial Analysis on X](https://x.com/ArtificialAnlys/status/2074886571166462405?lang=en). This board is the most relevant one for "one cloned persona voice".
- **Multilingual Arenas** (9 languages: JA, ZH, HI, ES, DE, FR, PT, VI, AR): Cartesia's Sonic family led 8 of the 9 as of 22 Sep 2026 — [Artificial Analysis on X](https://x.com/ArtificialAnlys/status/2102490340678856997).

**Eleven v4 specifics** (ElevenLabs claims, as reported by an ad-tool vendor):
- Launched 28 Sep 2026; called "our most emotive text-to-speech model yet."
- Speaker identity stays stable across regenerations.
- Professional Voice Clones work again.
- Audio tags are followed more reliably.
- 90+ languages, and the accent no longer drifts back toward the source accent mid-generation.
- Up to 10,000 characters per generation.
- On fal: v4 costs $0.08 and Turbo $0.04 per 1k characters.
- Source: [Novoads, "Eleven v4"](https://novoads.ai/en/blog/eleven-v4).

**Fish Audio Drama 3** (released 13 Oct 2026):
- 35B mixture-of-experts with ~3B parameters active, 83 languages. Delivery is directed with free-text square-bracket notes that can be scoped to a few words — [eesel review](https://www.eesel.ai/blog/fish-audio-drama-3-review).
- Self-hosting is free for commercial use below $500k annual revenue — [Superpower Daily](https://superpowerdaily.com/posts/fish-audio-releases-drama-3-with-script-directed-voices-and-downloadable-weights).
- Independent hands-on testing found longer emotional scenes inconsistent: roughly 60/40 on getting the tone of a suspense scene right, and a comedy scene fell flat — [MindStudio](https://www.mindstudio.ai/blog/fish-audio-drama-3-benchmark-review).
- Its 93.2% Pronunciation Robustness score measures word accuracy, not emotion — [Morphic](https://morphic.com/resources/models/fish-audio-drama-3).
- Sources disagree on the tag inventory. kie.ai lists 8 emotion tags plus 14 special tags — [kie.ai](https://kie.ai/blog/fish-audio-drama-3-deep-dive-35b-moe-tts); the [technical report](https://arxiv.org/html/2610.18010v2) describes emotion and style accuracy rising over revision rounds.

**Open models:**
- One blog claims Chatterbox won a blind test against ElevenLabs, 65.3% vs 24.5% — [FindSkill](https://findskill.ai/blog/best-open-source-tts-2026/). I could not verify the original test, and the AA arena ranks open Chatterbox #78, far below current ElevenLabs models. The claim probably compared against an older ElevenLabs model.
- Qwen3-TTS: 1.7B parameters, Apache-2.0, 10 languages, 3-second cloning, ~6 GB+ VRAM — [TextToLab](https://texttolab.com/blog/open-source-text-to-speech).
- A ComfyUI node pack bundles many of these open engines in one place: RVC, Qwen3-TTS, CosyVoice 3, Step Audio EditX, IndexTTS-2, Chatterbox, F5-TTS, Higgs Audio, VibeVoice — [TTS-Audio-Suite (GitHub)](https://github.com/diodiogod/TTS-Audio-Suite). This matters for a ComfyUI-based app.

### Inferences
**Ranked comparison for UGC delivery** (my synthesis of the arena ranks, controllability, cloning and cost):

| Rank | Option | Why | Watch-outs |
|---|---|---|---|
| 1 | **Speech-to-speech from a real human take** (ElevenLabs Voice Changer, or Seed-VC/RVC locally) | Timing, breaths, fillers and self-corrections are real because a person performed them. No TTS model matches that for a casual phone read. | The performer's accent carries over. It needs someone to record. See Q3. |
| 2 | **Eleven v4** (finished ads) / **v4 Turbo** (cheaper, statistically tied) | Top of the blind arena; inline tags plus plain-language direction; PVC/IVC with consent checks; 90+ languages | $40–80 per 1M chars; clones made before v4 must be retrained |
| 3 | **Cartesia Sonic 3.6** | #4 overall; Sonic led the cloned-voice board (Jul) and 8 of 9 multilingual boards (Sep) | Less documented for expressive tags (not researched in depth) |
| 4 | **Qwen-Audio-3.1-TTS-Plus / Gemini 3.8 Flash TTS** | Near the top at roughly a quarter of v4's price | Little UGC-specific evidence |
| 5 | **Fish Audio Drama 3** | Best open weights; free-text direction; free self-hosting under $500k revenue | Inconsistent on long emotional reads; a 35B MoE is heavy to host |
| 6 | Inworld TTS-2, Speechify Simba 3.2, MiniMax Speech 2.8 HD | Mid-to-high arena ranks, cheap | Generic |
| Not recommended for natural UGC | Hume Octave 2, OpenAI GPT-Realtime-2, Chatterbox, VibeVoice 1.5B, Qwen3-TTS, XTTS v2, Kokoro | Rank #53–#90 | Kokoro is fine only as a free scratch voice |

- Arena votes reward clean, natural general narration. UGC needs casual, imperfect, energetic delivery, which the arena does not specifically test. The Novoads author's advice fits: compare reads against your current winning ad audio at equal spend rather than trusting leaderboard rank ([Novoads](https://novoads.ai/en/blog/eleven-v4)).

### Gaps
- No search results covered **Sesame (CSM)**, **HeyGen Voice 1.0**, **ByteDance Seed Audio / Seed-TTS**, **Dia**, **F5-TTS** or **IndexTTS-2** in 2026. None of them appear on the AA board as captured, so I cannot rank them.
- No blind test specific to UGC or casual reads exists that I could find.
- The Reddit consensus (r/ElevenLabs, r/aivideo, r/LocalLLaMA) was not reachable through search; no Reddit threads came back.
- Hume Octave 2's acting and emotion strengths (its marketing claim) were not checked beyond its arena rank.

## 2. Settings, audio tags and script techniques for natural delivery

### Takeaway
On Eleven v3/v4, control comes mainly from (a) picking a voice whose natural range already fits the read, (b) low stability so tags take effect, (c) action tags such as `[laughs]`, `[sighs]`, `[whispers]` and `[pause]` rather than adjective tags such as `[friendly]`, and (d) punctuation (ellipses, dashes, CAPS). Expect to regenerate and fix single words rather than get it right in one take. Scripts sound spoken when they use conversational openers and fillers sparingly, short sentences, spelled-out numbers and no symbols.

### Cited Findings
**Official ElevenLabs prompting guide (applies to v4 and v3; v4 recommended)** — [ElevenLabs docs](https://elevenlabs.io/docs/best-practices/prompting):
- Tags by category:
  - Laughter: `[laughs]`, `[laughs harder]`, `[starts laughing]`, `[wheezing]`
  - Whisper and breath: `[whispers]`, `[sighs]`, `[exhales]`
  - Expressive: `[sarcastic]`, `[curious]`, `[excited]`, `[crying]`, `[snorts]`, `[mischievously]`
  - Body sounds: `[swallows]`, `[gulps]`
  - Experimental: `[strong X accent]`, `[sings]`, `[woo]`
  - Examples from the enhancement prompt: `[chuckles]`, `[clears throat]`, `[short pause]`, `[long pause]`, `[exhales sharply]`, `[inhales deeply]`, `[thoughtful]`, `[surprised]`, `[annoyed]`
- Tags can be misread as sound effects. Describing the voice quality instead ("[low, gravelly voice]", "[Low, steady voice, restrained urgency]") reduces that risk.
- Tags work best for deliveries that are already in the voice's training data. A serious voice may respond poorly to playful tags.
- v3 and v4 do **not** support SSML `<break>`; use tags, ellipses and text structure instead.
- Ellipses add pauses and weight, CAPS add emphasis.
- Multi-speaker: `Speaker 1:` / `Speaker 2:` lines, with tags such as `[overlapping]` and `[interrupting, then stopping abruptly]`.

**v4 pauses:** SSML breaks are disabled, so write `[pause]` or `[long pause]`. On fal, v4's controls are listed as stability, similarity and IPA pronunciation — [Novoads](https://novoads.ai/en/blog/eleven-v4).

**v3 stability modes:**
- Creative is the most expressive and least predictable; Natural is the recommended start; Robust is consistent but flat (for corporate or technical scripts) — [Recharm](https://www.recharm.com/blog/how-to-make-elevenlabs-sound-human-in-2026).
- If tags seem ignored, lower stability first — [Runware audio-tags guide](https://runware.ai/docs/models/elevenlabs-v3/guides/directing-with-audio-tags).
- Results vary across regenerations, so generating 2–3 takes and picking one is common advice — [Runware](https://runware.ai/docs/models/elevenlabs-v3/guides/directing-with-audio-tags), [The Rundown](https://app.therundown.ai/guides/elevenlabs-audio-tags-guide).

**Multilingual v2 settings** (still used for ads): stability 35–45%, similarity 70–85% (too high sounds stiff), style exaggeration 0–10%, Speaker Boost on. Pauses via `<break time="1.2s" />`, but not too many — [Recharm](https://www.recharm.com/blog/how-to-make-elevenlabs-sound-human-in-2026).

**A UGC tool's hands-on tag test** — [Superscale](https://superscale.ai/learn/sound-effects-emotions/):
- Most reliable: `[Whispering]` and `[Strong British accent]`.
- Usually work after small script tweaks: `[Giggles]`, `[Pause]`, `[Sighs]`, `[Laughs]`, `[Coughs]`.
- Underperform: emotion adjectives `[Engaged]`, `[Sad]`, `[Sarcastic]`, `[Empowering]`, `[Motivated]`, `[Friendly]`, `[Curious]`.
- Rules it gives:
  - Use action words, not feelings.
  - ALL CAPS "works very well" to stress a word.
  - To apply a style across a script, put the tag at the start and/or end of every sentence.
  - If a tag does nothing, change one word or one punctuation mark and regenerate.

Note the conflict: ElevenLabs lists `[sarcastic]` and `[curious]` as valid tags; Superscale found them unreliable.

**Script craft:**
- Openers and fillers such as "So," "Honestly," and "Here's the thing…".
- Ellipses for hesitation, dashes (—) for interruptions or rhythm shifts.
- Few exclamation marks; spell out numbers; remove emojis and symbols.
- Short sentences, generated in chunks.
- A temporary narrative cue ("he whispered") can steer delivery and be cut afterward.
- Source: [Recharm](https://www.recharm.com/blog/how-to-make-elevenlabs-sound-human-in-2026).

**UGC tone:** authentic and slightly informal, with fillers like "you know" and "like" — [NovaPixel, AI UGC ads 2026](https://novapixeldev.com/blog/ai-ugc-ads-that-actually-work-2026). Overuse makes the read sound scripted (search-summary consensus across these guides).

**v4 workflow advice for ads** — [Novoads](https://novoads.ai/en/blog/eleven-v4):
- Compare plain, tagged and note-directed reads of the same script.
- Put brand and product names in a pronunciation dictionary and recheck them after every regeneration.
- Listen closely to the last seconds of localized reads for accent drift.

**Native-audio video models: script length.** Seedance 2.0 dialogue fits roughly 12 words per 10 s clip and 20 words per 15 s clip — [UGC Copilot](https://ugccopilot.ai/blog/seedance-2-native-audio-generation-guide/).

### Inferences
- A practical UGC tag set for v4:
  - Starting the clip: `[inhales]` or `[clears throat]`
  - Reactions: `[chuckles]`, `[laughs]`
  - Mid-sentence beats: `[short pause]` or `…`
  - A word stressed in CAPS
  - A conspiratorial aside: `[whispers]`
  - Optionally a free-text direction at the top: "[casual, a bit excited, talking to a friend on her phone]"
- Keep stability at Natural or Creative and regenerate 2–3 times.
- Self-corrections ("it's like— okay, so basically"), contractions and run-on, uneven sentences follow from the dash, ellipsis and filler guidance above. I found no source that tested them specifically.
- Keep words per clip within what the video model can lip-sync: about 1.2–1.3 words per second (from the Seedance figures). UGC talking speed is usually higher, so cut lines short rather than speeding up the voice.

### Gaps
- One third-party snippet said v4 drops the Style and Speed sliders (keeping Stability and Similarity). I could not confirm this on an official page.
- A third-party page said v3 was deprecated and switched off on 18 Jun 2026. But ElevenLabs' docs still cover v3, and the AA board lists "v3 Conversational" (Aug 2026). The status is unclear.
- No source gave a numeric stability value for v4.
- No source tested self-corrections, breaths or contractions as isolated variables.

## 3. Speech-to-speech: recording a human performance and converting it to the creator's voice

### Takeaway
Speech-to-speech gives the most natural timing, because cadence, pauses, laughs and breaths come from a real take. **ElevenLabs Voice Changer** is the main hosted tool. It also underpins the common "let the video model perform, then swap the voice" workflow. Its key limit: the **source accent and pronunciation carry through**. Open alternatives: **Seed-VC** (zero-shot from a 1–30 s reference, real-time capable) and **RVC** (per-voice training, better similarity with good data).

### Cited Findings
**ElevenLabs Voice Changer (official)** — [ElevenLabs product guide](https://elevenlabs.io/docs/eleven-creative/playground/voice-changer):
- What carries over: the source's tone, delivery, cadence and timing, plus whispers, sighs, laughs and cries.
- Shouting, crying and laughing are reproduced accurately.
- The source **accent** is kept even when the target voice has another accent: an American source through a British voice comes out American.
- Limits: 5 min and 50 MB per input. Accepts MP3/M4A/FLAC/OGG/WAV and also MKV/WEBM/MP4/MOV video.
- Cost: 1,000 characters per minute of audio.
- The only model named is `eleven_english_sts_v2` (English only).
- Has a "Remove Background Noise" toggle.
- Advice: perform expressively; set input gain carefully (too quiet hurts recognition, too loud clips).

**Recording and conversion advice** — [Quest Studio guide](https://queststudio.io/blog/elevenlabs-voice-changer-performance-guide):
- One speaker, quiet low-echo room, consistent mic position, no music.
- Include a little room tone before and after; keep the raw take.
- Perform the emotion you want, because the conversion keeps the delivery.
- Avoid processing the same file repeatedly, which makes consonants sound watery.
- Convert whole phrases with breaths around them. Replacing a single word makes a noticeable seam.
- Before time-stretching, check whether extra silence explains a length difference.
- Record in the pronunciation you want; accent bleeds through.

**Seed-VC (open):**
- Zero-shot voice conversion, real-time conversion and singing conversion from a 1–30 s reference with no training; fine-tuning improves similarity for one speaker — [Seed-VC GitHub](https://github.com/Plachtaa/seed-vc).
- The README's TODO list still includes "Improve audio quality."
- A community ComfyUI workflow uses Seed-VC as the zero-shot first step and RVC as the next step when similarity or stability falls short — [GitHub issue (koshihikari77)](https://github.com/koshihikari77/paperspace-comfyui/issues/15).

**RVC (open, MIT, 2023):** aims to preserve the source speaker's intonation; widely used for real-time conversion — [Wikipedia](https://en.wikipedia.org/wiki/Retrieval-based_Voice_Conversion). Quality depends heavily on preparing the training data — [Resemble AI list (vendor)](https://www.resemble.ai/best-open-source-ai-voice-cloning-tools/).

**Swap workflow** (scratch performance from Seedance 2.0, then ElevenLabs Voice Changer) — [Mirrorize](https://mirrorize.ai/learn/the-best-lipsync-workflow-right-now-seedance-2-0-elevenlabs):
1. Prompt Seedance with "dialogue only, no music, no background sound" plus pacing, breath and emphasis directions. The mouth follows these cues.
2. Treat the render's audio as a scratch track.
3. Export it and convert it to the final voice.
4. Lay the converted audio back on the video. The timing holds, so no resync is needed.

Baked-in music or effects complicate the swap.

### Inferences
- For a ComfyUI-based app, **TTS-Audio-Suite** (RVC plus several TTS engines as nodes) is the local route, and Seed-VC already has a ComfyUI node ([comfy.icu SeedVCRun](https://comfy.icu/node/SeedVCRun)).
- Best-quality chain:
  1. A human (even the user) records the script casually into a phone or headset, with fillers and restarts.
  2. ElevenLabs Voice Changer converts it to the persona's voice (PVC/IVC).
  3. That converted track drives an audio-driven talking model or a lip-sync fix model.
  4. Phone-style processing goes on last.
- Because the accent carries over, the performer must match the persona's accent; pick a target voice close to the performer's pitch range. The pitch and gender-mismatch point is my inference from the accent-bleed finding; it was not tested by a source.

### Gaps
- I found no 2026 head-to-head comparing ElevenLabs Voice Changer, Seed-VC, RVC and Fish Audio voice conversion.
- Whether Fish Audio offers a 2026 speech-to-speech product was not found.
- Whether ElevenLabs has a multilingual or v4-generation speech-to-speech model: the official page names only `eleven_english_sts_v2`.

## 4. Cloning one consistent persona voice, and legal/consent considerations

### Takeaway
Keep one voice ID per creator persona (an ElevenLabs PVC/IVC or a designed library voice), stored with fixed settings and a pronunciation dictionary. Eleven v4 claims stable identity across regenerations, and clones made before v4 must be retrained. Legally, the safe line is an **original or designed voice, or a clone of someone who gave written consent**. The FTC's fake-testimonial rule and the EU AI Act's deepfake labelling (in force since 2 Aug 2026) matter more for AI *testimonial* UGC than cloning law does.

### Cited Findings
**Consistency:**
- Eleven v4 claims stable speaker identity across regenerations.
- Instant Voice Clones need 10 s of audio.
- Clones made before v4 need retraining with v4.
- Every clone requires verified consent from the voice owner.
- The 17,500+ library voices are v4-compatible.
- Source: [Novoads](https://novoads.ai/en/blog/eleven-v4).

**Cloned-voice quality comparisons:** the AA Controlled Voice Arena compares models on the same 8 cloned voices; Cartesia Sonic 3.5 led on 8 Jul 2026 — [Artificial Analysis on X](https://x.com/ArtificialAnlys/status/2074886571166462405?lang=en).

**Consistency with native-audio video models (Seedance 2.0):**
- Audio references keep speaker identity when each line is bound to a voice (@Image1/@Audio1 …).
- Use 10–15 s of clean, close, dry reference audio per character, and under about 15 s combined for two speakers.
- Mic and room character from the reference **leaks** into the output. A prompt line fixes most of it: use the audio "only for speaker identity", not "microphone distance, room echo, compression artifacts, hiss, hum, or muffled frequency response".
- Source: [Genflick test](https://genflick.com/blog/seedance-voice-consistency-audio-reference-2026-05-03). Qualitative only; no run counts given.
- Seedance holds timbre within one clip but not reliably across separate generations, and the voice drifts without an explicit accent prompt — [Clipdance](https://clipdance.ai/blog/seedance-2-consistent-voice). Practitioners repeat the same voice description in every shot prompt — [GumVue on X](https://x.com/GumVue/article/2066700181161001277).
- Kling 3.0 lists native audio "with voice IDs" (Chinese and English) — [fal](https://fal.ai/learn/tools/seedance-2-0-vs-kling-3-0). Mechanics unverified.

**Law (US):**
- **Tennessee ELVIS Act** (effective 1 Jul 2024) covers unauthorized voice replicas, and also tools whose "primary purpose" is producing them. Civil damages plus a Class A misdemeanor — [RecordingLaw](https://www.recordinglaw.com/us-laws/deepfake-laws/ai-voice-cloning-laws/).
- California AB 2602, Illinois and New York also give causes of action. Washington SSB 5886 (effective 11 Jun 2026) adds "forged digital likeness", which includes AI voice — [RecordingLaw state list](https://www.recordinglaw.com/us-laws/deepfake-laws/).
- **NO FAKES Act of 2026** (S.4591, introduced 20 May 2026): a federal right against unauthorized digital replicas of voice or likeness. It cleared Senate Judiciary by unanimous voice vote (18 Jun 2026; another source says 24 Jun) and awaits a full Senate vote — [Holland & Knight](https://www.hklaw.com/en/insights/publications/2026/06/senate-judiciary-committee-advances-legislation-to-protect-name).
- **FTC Consumer Reviews and Testimonials Rule** (16 CFR Part 465, effective 21 Oct 2024) forbids testimonials that misrepresent that the testimonialist exists, used the product, or had the described experience. Civil penalties are reported at about $53k per violation — [Fourscore Law](https://www.fourscorelaw.com/resources/ftc-bans-fake-reviews-and-testimonials).
- One blog argues an "AI-generated for illustrative purposes" label does not cure a fake testimonial. That is a blog's view, not an FTC holding — [RunSolo](https://runsolo.io/blog/ftc-fake-reviews-rule-ai-testimonials).
- Enforcement so far is warning letters and allegations; I found no AI-specific case decided — [Legal500](https://www.legal500.com/intelligence/united-states/consumer-protection/five-stars-zero-tolerance-ftc-turns-up-enforcement-under-consumer-review-rule).

**Law (EU):**
- **AI Act Article 50**: deployers must label deepfakes from 2 Aug 2026. The Digital Omnibus did not delay this.
- Only machine-readable watermarking (50(2)) gets a grace period, to 2 Dec 2026, and only for systems on the market before Aug 2026.
- Penalties up to €15M or 3% of global turnover.
- Sources: [CSA research note](https://labs.cloudsecurityalliance.org/research/csa-research-note-eu-ai-act-article-50-transparency-20260729/), [ICTRecht](https://www.ictrecht.nl/en/blog/heads-up-ai-act-transparency-obligations-now-in-effect). These are secondary sources; check the Official Journal.

### Inferences
- **Persona voice record:** voice ID, model (v4), stability mode, similarity, pronunciation dictionary, one reference line (10–15 s clean WAV) for video models that take audio references, and a fixed post-processing preset. Regenerate per line, not per whole script, so takes stay comparable.
- A designed voice (ElevenLabs Voice Design or a library voice) avoids likeness claims entirely. Cloning the user's own voice is fine with their consent. Never clone a real creator or celebrity.
- The bigger legal exposure for AI UGC is the *script*: a synthetic person saying "I've used this for 3 months" is the testimonial pattern the FTC rule targets. For EU distribution, an AI disclosure label is now mandatory.

### Gaps
- Not researched: platform rules (TikTok and Meta AI-content labels, ad-policy requirements for synthetic people).
- Not researched: the UK position.
- Whether the full Senate passed NO FAKES after June 2026.

## 5. Post-processing a TTS voice to sound like a phone recording

### Takeaway
I found no published, phone-specific UGC chain from a credible source. The sources agree only on general moves: keep or add a little real room, a light presence boost, gentle compression, a subtle short room reverb, and a continuous room-tone bed, without over-processing. Studio-clean TTS next to phone-shot video is the usual mismatch.

### Cited Findings
- **Light polish for AI voiceovers:** normalize, a subtle presence boost around 3–5 kHz, gentle compression, de-ess, and room ambience if the voice is too dry — [Music Radio Creative](https://producer.musicradiocreative.com/how-to-make-your-ai-voice-overs-sound-better-in-seconds/).
- Compression at 3:1–4:1, very light room reverb, subtle pitch variation — [Recharm](https://www.recharm.com/blog/how-to-make-elevenlabs-sound-human-in-2026).
- Reverb wet level around 20–35% for podcast-style voices; heavy reverb hurts clarity — [SoundTools](https://soundtools.io/add-reverb-to-audio/). A short room plus a slap delay suits voices that sound "in a vacuum" (search-summary paraphrase of the same results set).
- Too much around **1 kHz** gives a nasal, "phone-like" sound; cut around 100 Hz for rumble — [Boya mic EQ guide](https://www.boyamic.com/blogs/mic-custom-eq-pro-tuning).
- Over-removing room sound makes voices "papery" and detached; stop de-reverbing once speech is readable; two gentle passes beat one aggressive pass — [LALAL.AI](https://www.lalal.ai/blog/echo-removal-how-to-fix-roomy-voice-recordings/).
- AI cleanup can collapse room tone, so the space between phrases goes dead — a cleanup guide in the same search set ([CleanAudio](https://www.cleanaudio.io/blog/can-ai-fix-bad-audio)). Attribution to this exact page is uncertain.
- Mic distance changes frequency balance, so EQ presets only hold if the setup stays the same — [My Weird Prompts](https://www.myweirdprompts.com/episode/ai-vocal-eq-mastering/).
- Seedance treats microphone texture and room quality as part of the voice identity when given a reference — [Genflick](https://genflick.com/blog/seedance-voice-consistency-audio-reference-2026-05-03). Room and mic character are perceptually tied to "who" is speaking.

### Inferences
Suggested phone-to-camera chain, assembled from the cited pieces. The exact values are my starting points, not sourced numbers:
1. Generate a dry TTS or speech-to-speech take.
2. High-pass at 80–120 Hz. Phone mics give up low end, and a cut around 100 Hz is cited.
3. Gentle low-pass or shelf above about 12–14 kHz. Phone codecs and AAC soften the top; this value is a guess.
4. A small bump around 1–2 kHz for a "phone/nasal" color, plus a light 3–5 kHz presence lift. Both bands are cited, used in reverse of the corrective advice.
5. Compression at 3:1–4:1 with fast attack (cited ratio).
6. A short, small-room or bedroom reverb, low wet (start well below the 20–35% podcast figure), or convolve with a real phone-in-room impulse response.
7. A continuous room-tone or ambience bed from a real phone recording of a quiet room, running under and between words.
8. Loudness-normalize to the platform target (e.g. about −14 LUFS); this value was not sourced.

Alternatives:
- Simplest and most authentic: **play the TTS out of a speaker and re-record it on a real phone in a real room**. This is not a sourced technique, but it follows from the "room is identity" finding.
- Or do speech-to-speech on a phone recording of a human, which already carries a real phone acoustic.
- When the video comes from a native-audio model, match the swapped voice to that clip's room sound rather than to a clean studio sound.

### Gaps
- No credible source gave a measured phone-mic frequency response, codec emulation or a creator-shared UGC "iPhone chain".
- No Reddit or X threads with specific chains surfaced.
- Loudness targets for TikTok and Reels were not researched here.

## 6. Pairing voices with lip-sync / talking-video models: voice-first vs native audio vs replace-after

### Takeaway
There are three workflows:
- **(a) Native audio**: Seedance 2.0, Kling 3.0, Veo 3.1, Gemini Omni Flash. Fastest, but the voice is invented, can drift between clips, and the words can corrupt.
- **(b) Voice first, then drive the video**: audio-driven models such as RIZZ, OmniHuman 1.5 and VEED Fabric, or a lip-sync fix model such as Sync 3. Gives full control of voice and script.
- **(c) Native performance plus a speech-to-speech swap**: keeps the model's natural mouth timing and gives one consistent voice.

Practitioners favour (c) or (b) for a consistent persona. A vendor-tested heuristic: "Cheap model, regenerate. Expensive model, repair."

### Cited Findings
- **The trade-off:** native-audio models produce speech and picture in one pass, so the mouth matches what the model says, but the wording can drift from the script and clips are length-capped. OmniHuman 1.5 and VEED Fabric 1.0 accept a supplied voice track, so a cloned voice replaces the preset — [UGCvids](https://ugcvids.ai/blog/best-ai-video-model-for-lip-sync).
- **Model notes:**
  - Veo 3.1 lip-sync is reported accurate to about 120 ms — [3DAIStudio](https://www.3daistudio.com/blog/best-ai-video-generator-2026); clips of 4, 6 or 8 s — [ClipSpeed](https://www.clipspeed.ai/blog/ai-video-native-audio.html).
  - Kling 3.0 is best for single shots up to 15 s — [3DAIStudio](https://www.3daistudio.com/blog/best-ai-video-generator-2026).
  - Seedance 2.0 sync drifts late in 15 s clips — [UGC Copilot](https://ugccopilot.ai/blog/seedance-2-native-audio-generation-guide/).
- **Maxfusion's lip-sync tests for AI UGC ads** (vendor; qualitative; based on its own ad-account data; written July 2026) — [Maxfusion](https://maxfusion.ai/blog/ai-video-models-lip-sync-2026):
  - Seedance 2.0: strong, but its main failure is word corruption, where "the lips sync correctly, but to the wrong sounds." Accepts up to 3 audio clips as references.
  - Kling 3.0 Pro: strong under 8 s, drifts after.
  - Gemini Omni Flash: excellent on clean takes but stutters in about 15% of generations, and "you cannot feed it a separate audio track."
  - Sora 2 Pro: best lip-sync, but its API shut down on 24 Sep 2026.
  - Veo 3.1: timing acceptable, mouth realism fails.
  - Grok Imagine: poor for talking content.
  - **RIZZ**: "the most realistic audio-driven model on the market right now." Vowel-dependent slips; about 60 s standard, about 5 min long-form.
  - OmniHuman 1.5: frames degrade by 10–11 s.
  - Fix models: **Sync 3** is "the best lip sync model available" (expensive; 120 s input). Sync 2 Pro or the VEED Lipsync API suit front-facing footage. **React-1** re-directs expression and head motion when the delivery itself is wrong (15 s cap).
  - Rule: "Cheap model, regenerate. Expensive model, repair." Keep expensive footage, make clean audio of the correct script, and run a fix model.
- **Swap workflow:** generate the Seedance performance, export its audio as a scratch track, convert it with ElevenLabs Voice Changer, and lay it back on. The timing holds, so no resync is needed — [Mirrorize](https://mirrorize.ai/learn/the-best-lipsync-workflow-right-now-seedance-2-0-elevenlabs).
- **Native audio with voice references:** Seedance 2.0 per-speaker @Audio references plus clean-audio prompt wording — [Genflick](https://genflick.com/blog/seedance-voice-consistency-audio-reference-2026-05-03). Timbre is not locked across generations — [Clipdance](https://clipdance.ai/blog/seedance-2-consistent-voice).

### Inferences
**Ranked by naturalness and consistency for a recurring creator persona:**
1. **Human or native performance, then speech-to-speech into the persona voice.** Two variants:
   - (i) A real human take converted with Voice Changer, driving an audio-driven model (RIZZ, OmniHuman) or a fix model (Sync 3).
   - (ii) A Seedance or Kling native-audio take converted with Voice Changer and laid back on.

   Both give natural timing *and* one voice across every clip. (ii) is cheapest because the mouth already matches.
2. **Voice first (Eleven v4 with tags), then an audio-driven model or a fix model.** Full script control and a consistent voice, but the TTS cadence is only as good as the tags and script.
3. **Native audio with a voice reference and the same voice description in every prompt.** Quickest, but expect voice drift between clips and word corruption; check every take against the script.
4. **Pure native audio with no reference.** Fine for one-off clips, not for a persona.

- Keep lines short: under about 8 s for Kling 3.0 Pro and about 10 s for OmniHuman before quality drops. Cut longer scripts into shots and stitch them.
- Ask native-audio models for "dialogue only, no music, no background sound" so the swap and post-processing stay clean. Add room tone and ambience back in post (Q5).

### Gaps
- InfiniteTalk, HeyGen Avatar IV, Hedra and Kling Avatar were not covered by the results.
- No controlled study compares the perceived naturalness of native audio against supplied audio; Maxfusion's verdicts are qualitative and commercially motivated.
- How Kling 3.0 voice IDs are created and how well they hold across clips was not documented.
