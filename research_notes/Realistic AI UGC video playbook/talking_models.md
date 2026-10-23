# Talking-creator ("talking A-roll") models for realistic AI UGC ads, 2026

Research date: 23 Oct 2026. Scope: 9:16 phone-look talking creator, 5–30 s.

**Source-quality warning that applies to everything below.** I found **no independent, controlled blind test built for talking heads**. The only true blind-vote data is Artificial Analysis's Video Arena, which scores overall video quality with audio, not lip sync. Almost every hands-on comparison is published by a vendor or reseller that sells the models it ranks (Maxfusion, UGC Vids, invideo, Atlas Cloud, treg, Oakgen, HeyGen, Lumigen, Versely, Morphic) or is sponsored (Blue Lightning, for Artlist). Each finding is tagged with its source; affiliations are noted. Reddit and X could not be reached: WebSearch returned no Reddit threads even with `site:reddit.com`, old.reddit.com refused the fetch, and the one X article found (Min Choi on Seedance 2.5) returned HTTP 402. So "creator consensus" here comes from practitioner write-ups, not community threads.

---

## 1. How do the candidate models compare for a creator talking to camera?

### Takeaway
The models split into three families. **(a) Native-audio video models** (Seedance 2.0/2.5, Veo 3.1, Gemini Omni Flash, Kling 3.0 Omni, Grok Imagine 1.5, HappyHorse) generate face, body, scene and voice in one pass, but cap clips at 8–15 s (Seedance 2.5 claims 30 s) and can change or garble words. **(b) Audio-driven portrait models** (OmniHuman 1.5, VEED Fabric 1.0, HeyGen Avatar IV/V, Hedra Character-3, Kling Avatar v2, Pruna Avatar, RIZZ, and Arcads, which builds on OmniHuman 1.5 and its own models) say exactly the supplied script, but give little control over the scene. **(c) Lip-sync "fixers"** (Sync 3 / lipsync-2-pro / lipsync-2, VEED Lipsync, Kling Lipsync, react-1; open: LatentSync 1.6) re-time the mouth on existing footage. In 2026 the evidence most often points to: **Seedance 2.5** (or 2.0) for the most lifelike UGC footage, **Arcads** as the ready-made realism leader, **VEED Fabric 1.0** for the most accurate lips on a static head (720p cap), and **Sync 3** as the best repair layer. Veo 3.1 is contested: one test rates it best for dialogue, another says its mouths fail. Sora 2 Pro had the strongest lip sync but its API ended 24 Sep 2026.

### Cited Findings

**Blind-vote leaderboard (overall quality, not lip sync).** Artificial Analysis, Image-to-Video **with audio** (AA-Video-I2V v1.1), read 23 Oct 2026:
- MiniMax H3 (768p) 1140 · FLUX 3 Max (720p) 1138 · **Dreamina Seedance 2.5 1138** (Jul 2026) · **Gemini Omni Flash 1.1 1132** (Aug 2026) · Wan 3.0 1127 · MiniMax H3 Max 1125 · **Seedance 2.0 1121** (Mar 2026) · FLUX 3 1086 · **Grok Imagine Video 1.5 1067** · HappyHorse-1.1 1061 · HappyHorse-1.0 1042 · Wan 2.7 1034 · **Veo 3.1 1028** · PixVerse V6 1024 · Veo 3.1 Fast 1017 · Vidu Q3 Pro 1016 · **Kling 3.0 Omni 1080p (Pro) 1004** · Kling 3.0 1080p (Pro) 1000 (reference point) · **LTX-2.5 Fast 984** · LTX-2.5 Pro 958 · LTX-2.3 Pro 903 · LTX-2.3 Fast 888. The top 7 are statistically tied (rank ranges overlap). The page names MiniMax H3 the open-weights leader. — [Artificial Analysis I2V leaderboard](https://artificialanalysis.ai/video/leaderboard/image-to-video)
- Method: blind pairwise votes on clips from the same prompt, Elo ratings, no lab-submitted scores. — [WaveSpeed on HappyHorse / AA arena](https://wavespeed.ai/blog/de/posts/why-happyhorse-top-ai-video-leaderboard-2026/)
- A reseller says Grok Imagine 1.5 entered the AA I2V board at #1 with Elo 1404 ±6 at launch. That figure is from an earlier board or scale; it now sits at 1067 (#9–10) on v1.1. — [CometAPI](https://www.cometapi.com/grok-imagine-video1-5/); [AA leaderboard](https://artificialanalysis.ai/video/leaderboard/image-to-video)

**Practitioner ranking for AI UGC ad lip sync** (Maxfusion; written by a co-founder; Maxfusion hosts every model reviewed and its own RIZZ ranks #1 among audio-driven models; based on what the author saw in customer ad accounts, not a controlled test; dated July 2026, metadata Oct 2026). Judged on sync accuracy, drift over duration, mouth realism and cost. — [Maxfusion](https://maxfusion.ai/blog/ai-video-models-lip-sync-2026)
- Seedance 2.0: 4–15 s, up to 1080p, expensive; failure is **word corruption** (lips match the wrong sounds).
- Kling 3.0 Pro: 3–15 s, mid-price; **sync drift after second 8**.
- Gemini Omni Flash: 10 s, 720p, mid-price; **stutters in ~15% of takes**, and the lips follow the broken audio.
- Kling 2.6: 5 or 10 s; individual words miss their mouth shapes, but no drift.
- Sora 2 Pro: 4–20 s, 1080p; **strongest lip sync**, but its API shuts down 24 Sep 2026.
- Veo 3.1: 4–8 s, 1080p, expensive; timing is acceptable but **mouth realism fails**. Recommended for non-talking B-roll only.
- Grok Imagine: 15 s, 480p/720p; lip sync weak. Use as silent footage with a fixer driving the mouth.
- Seedance 1.5: 4–12 s; native sync "unusable".
- FLUX 3 (video): 20 s, launched 23 Jul 2026, no production data yet.
- RIZZ (audio-driven): ~60 s standard, ~5 min long-form; vowel-dependent slips.
- OmniHuman 1.5 (audio-driven): ~30 s; **frame and lip quality degrade by seconds 10–11**.
- Fixers: Sync 3 (120 s input, up to 4K) is "the best fixer available", with no significant weakness besides price. Sync 2 Pro struggles with still frames, fast scene changes and extreme profiles. VEED Lipsync API is less reliable on complex angles and occlusions. React-1 has a hard 15 s cap.
- HeyGen, Synthesia and Hedra were excluded as a different product category.

**Second practitioner ranking** (UGC Vids AI, 9 Aug 2026; sells these models in its app; ranked by architecture fit and its own price list, no tests): 1 OmniHuman 1.5 (audio-driven, 30 s) · 2 VEED Fabric 1.0 (audio-driven, as long as the voice track) · 3 Pruna Avatar (audio-driven, built-in TTS, ~60 s) · 4 HappyHorse 1.1 (joint audio/video, 15 s) · 5 Veo 3.1 (8 s) · 6 Kling 3.0 (15 s) · 7 Seedance 2.0 / 1.5 Pro (15 s / 12 s) · 8 Grok Video (720p max, 10 s) · 9 Sora 2 (12 s) · 10 Kling 2.6 ("motion model, not speech"). Kling 3.0, Seedance and Grok are rated "not reliable for scripted dialogue". — [UGC Vids](https://ugcvids.ai/blog/best-ai-video-model-for-lip-sync)

**Hands-on, same inputs** (Blue Lightning, 27 May 2026, **sponsored by Artlist**; same images and audio through HeyGen Avatar 4, OmniHuman 1.5, Fabric 1.0 and Aurora; qualitative): Fabric 1.0 stands out for lip-sync accuracy and is called "likely the best all-around pick". HeyGen Avatar 4 is more expressive; best for product demos. OmniHuman 1.5 is strongest for gesture-aware full-body motion ("dynamic social clips") but has hand and background problems and is inconsistent on hard shots. Aurora suits stylized work. The testing tips warn of "weird teeth" and drifting identity across shots. — [Blue Lightning](https://bluelightningtv.com/2026/05/27/best-ai-avatar-generator-in-artlist-heygen-avatar-4-vs-omnihuman-1-5-vs-fabric-1-0-vs-aurora/)

**Model-by-model facts**
- **Seedance 2.5** (ByteDance): up to 30 s single shot; native 1080p (720p at launch); native audio. An audio-only reference (voice, music or SFX; up to 10 audio inputs) can drive pacing and lip sync; 10+ languages; edit and extend. Claims "believable micro-expressions" and "reduced uncanny-valley effect in skin texture and hair". These are ByteDance launch claims with independent benchmarks pending. The page suggests sending fast or action-heavy shots to other models. — [Morphic](https://morphic.com/resources/models/seedance-2-5)
- A separate "Seedance 2.5 Talking Avatar" (portrait + audio) listing exists; how it relates to core 2.5 is unclear. — [MindStudio listing](https://www.mindstudio.ai/models/seedance-2-5-talking-avatar)
- **Seedance "Real Human" mode:** I found no source naming such a mode. Evolink says real-face support is not a separate model or mode: you choose the image-to-video or reference-to-video route. — [Evolink](https://evolink.ai/blog/seedance-2-0-real-human-video-api-guide). ModelArk requires its supported portrait-asset routes, and an ordinary upload with a real human face may be rejected. — [Magic Hour](https://magichour.ai/blog/seedance-20-reference-guide). treg says Seedance "refuses hyper-realistic reference images"; aggregators sell a bypass at a markup, and treg's endpoint registers the image as a "character asset" at BytePlus's price. — [treg](https://treg.to/ugc)
- **Seedance 2.0 paper** (authors' own evaluation): lip synchronization and action-audio alignment are strong, with few delay or misalignment cases. — [arXiv 2604.14148](https://arxiv.org/pdf/2604.14148)
- **Gemini Omni Flash** (Google; v1.1 Aug 2026): clips of 4/6/8/10 s; native 720p in 9:16 or 16:9, free 1080p upscale, native 4K costs about one more generation. Single-speaker sync holds ~6–7 s, then drifts. Motion "wobble" drops to 8–12 fps. Voice cloning from a short recording is called "incredible". Visually it inherits Veo 3.1 textures. — [invideo review, 4 Jun 2026](https://invideo.io/blog/gemini-omni-flash-review/). It will not take a still photo of a person plus an audio clip and lip-sync them (an anti-deepfake limit). — [VentureBeat](https://venturebeat.com/technology/googles-gemini-omni-flash-hits-the-api-turning-enterprise-video-production-into-a-conversation)
- **Veo 3.1:** no newer Veo appears on the AA board as of Oct 2026. Gemini Omni Flash appears to be Google's successor line (inference from the AA list and invideo). Oakgen's 20-prompt test (vendor-affiliated, two blind reviewers, best of 3): **Veo won all 4 dialogue prompts**, scoring 8.0–9.5 against Kling's 4.5–5.5; lip sync ~9/10 vs ~6/10; Kling's anchor mouth "looked like humming". — [Oakgen](https://oakgen.ai/blog/kling-3-vs-veo-3-1-tested). This **contradicts** Maxfusion's verdict that Veo's mouth realism fails ([Maxfusion](https://maxfusion.ai/blog/ai-video-models-lip-sync-2026)). Oakgen also says Kling has "no native dialogue", which is wrong for Kling 3.0 Omni (below), so Oakgen may have tested the non-Omni path.
- **Kling 3.0 / 3.0 Omni** (the user's "O3" is probably this): video and audio come out of one pass; 3–15 s; multilingual lip sync in 5 languages. — [Kling blog](https://kling.ai/blog/kling-video-3-omni-multi-shot-native-audio-guide); [Similar Labs review](https://similarlabs.com/blog/kling-3-omni-review). The reviewer's advice: clean references, visible faces, clear speaker labels and simple lines matter more than clever prompts. — [Similar Labs](https://similarlabs.com/blog/kling-3-omni-review)
- **Kling Avatar v2:** up to 1080p at 48 fps; named for mascots and stylized characters rather than UGC creators. — [invideo lipsync roster](https://invideo.io/blog/ai-lipsync-models/). Kling Lipsync takes 2–10 s source video and 2–60 s audio. — [invideo](https://invideo.io/blog/ai-lipsync-models/)
- **OmniHuman 1.5** (ByteDance): portrait + audio, optional prompt. The 30 s audio cap is listed at fal for $0.14/s. — [fal.ai](https://fal.ai/models/fal-ai/bytedance/omnihuman). Atlas documents a 60 s audio cap, 720p/1080p, from $0.12/s. — [Atlas Cloud](https://www.atlascloud.ai/blog/tips/omnihuman-2.0-full-body-gesture-generation). **OmniHuman 2.0** appears in BytePlus savings-plan docs, but no public endpoint, limits or price were confirmed as of 20 Oct 2026. — [Atlas Cloud](https://www.atlascloud.ai/blog/tips/omnihuman-2.0-full-body-gesture-generation)
- **VEED Fabric 1.0:** image + voice → talking video, up to 60 s, 480p or 720p; "tuned for influencer-style talking heads; audio emotion carries into the face". The roster's purpose-built UGC pick. — [invideo](https://invideo.io/blog/ai-lipsync-models/)
- **HeyGen:** Avatar IV turns one portrait into a presenter; Avatar V is marketed as its most realistic. HeyGen's own UGC ranking scores Arcads higher on UGC realism (9.2 vs 9.0) and concedes HeyGen "trails Arcads on UGC realism". HeyGen rendered no test ads for that ranking. — [HeyGen blog, 20 Oct 2026](https://www.heygen.com/blog/best-ai-avatar-tools-ugc-ads). **HeyGen Video 1.0** is a general text/image-to-video clip model with synced audio in one pass, not an avatar or talking-head product. HeyGen publishes unexplained internal percentages ("True to image" 65%, "Natural motion" 63%, "Consistency" 43%). — [HeyGen developer catalog](https://developers.heygen.com/heygen-video-1.0-catalog); [Runware](https://runware.ai/models/heygen-video-1-0). A 30 Sep 2026 launch date appears in listings but I could not verify it.
- **Arcads:** built on "Arcads 1.0, audio-driven actors, and OmniHuman 1.5 actors"; testimonial-style delivery; supports two-actor scenes. — [HeyGen blog](https://www.heygen.com/blog/best-ai-avatar-tools-ugc-ads). A competitor's own blog calls it the tool with the "most authentic talking-head output", citing "natural micro-expressions and casual delivery". — [Lumigen](https://lumigen.app/blog/ai-avatar-ugc-ads-2026/). Its output is usually a strong raw asset, not always a finished ad. — [diyai.io review](https://diyai.io/ai-tools/video-generation/reviews/arcads-review/)
- **Captions / Mirage:** pitched by Captions as the "world's first foundation model for UGC video" (vendor claim). I found no independent 2026 realism test. — [Captions blog](https://captions.ai/blog/mirage-worlds-first-foundation-model-for-ugc-video)
- **RIZZ** (Maxfusion): described as an "audio-guided video model for UGC" whose actors can cry, laugh or celebrate while keeping lip sync from one image. Self-description only. — [moge.ai listing](https://moge.ai/zh/product/maxfusion-ai); [Maxfusion](https://maxfusion.ai/blog/ai-video-models-lip-sync-2026)
- **Hedra Character-3:** Magic Hour lists a 720p ceiling, while Hedra's model page lists 540p/720p/1080p (conflict). — [Magic Hour guide](https://magichour.ai/blog/guide-to-hedra-ai); [Hedra](https://www.hedra.com/models/video/hedra/character-3). NeuronFeed says it falls short of Tavus on close-ups and that subtle expressions are less convincing; full-body motion is less stable and the background usually static. — [NeuronFeed](https://neuronfeed.com/reviews/hedra-review). Hedra positions it as a lightweight option for shorter clips. — [Hedra](https://www.hedra.com/models/video/hedra/character-3)
- **Grok Imagine 1.5:** joint audio/video in one pass; xAI claims better sync than 1.0; keep lines short and the mouth in frame. No independent test found. — [Morphic guide](https://morphic.com/resources/how-to/grok-imagine-video-1-5-guide); [CometAPI](https://www.cometapi.com/grok-imagine-video1-5/)
- **HappyHorse 1.1:** 15 s joint audio/video; **paraphrases long or awkward lines**. — [UGC Vids](https://ugcvids.ai/blog/best-ai-video-model-for-lip-sync)
- **Sync (fixers):** sync-3 has native 4K, built-in obstruction detection (hands, mics, scarves), handles profiles and over-the-shoulder shots, and processes the whole shot at once. Weakness: silent lips it opens look generic. lipsync-2-pro adds diffusion super-resolution for teeth, beards and wrinkles. lipsync-2 is the 512×512 default. **lipsync-2 and 2-pro cannot sync still segments.** All models lose quality on multi-person shots and small or profile faces. — [sync.so docs](https://sync.so/docs/models)
- **Open models:** LatentSync 1.6 is the "current preferred baseline" for replacing mouths in existing video; KeySync is the closest challenger (identity drift, artificial teeth); MuseTalk is speed-only (jitter, blurry or black mouth). InfiniteTalk is heavier: it degrades the source outside the face, is slow, and hits memory pressure at 720p. LTX LipDub (built on LTX-2.3 22B) has teeth-sharpness and clip-length limits. — [Instavar, 22 May 2026](https://instavar.com/research/ai-video/open-source-lip-sync-models). InfiniteTalk I2V holds up to ~1 min before color drift shows; V2V mode, driven by a camera-motion reference, allows unlimited length. — [The Menon Lab](https://themenonlab.blog/blog/infinitetalk-unlimited-talking-video-generation). LTX-2.3 lip sync is "good enough for casual creator content but not brand spokesperson work"; it is less phoneme-precise than HeyGen or Synthesia and weak on noisy audio, clips over 20 s and occluded portraits (single, possibly promotional source). — [NeMo Video](https://www.nemovideo.com/pt-BR/blog/ltx-2-3-audio-to-video-talking-portrait). LTX-2.3 is open-weight: 22B dev model, distilled 8-step version, LoRAs, upscalers. — [LTX docs](https://docs.ltx.video/open-source-model)

### Inferences
- **Working ranking for a 9:16 UGC talking creator (synthesis of the conflicting vendor evidence above, not a measured result):**
  1. **Seedance 2.5** (native audio plus voice reference): tops the blind-vote board among the talking-capable models practitioners use; best skin and phone-camera behaviour per Atlas and treg; risks are word corruption and face refusals. Seedance 2.0 is close, and its cheap tiers held identity and lip sync in Atlas's test.
  2. **Arcads** (closed product; OmniHuman 1.5 plus its own actors): the most-cited ready-made "least AI" option, at a high price.
  3. **VEED Fabric 1.0**: most accurate lips for a static selfie head, exact script, up to 60 s; 720p softness.
  4. **Gemini Omni Flash 1.1**: excellent voice and texture, but keep lines ≤6–7 s; ~15% of takes stutter.
  5. **OmniHuman 1.5**: best gestures among audio-driven models; keep segments ≤10 s.
  6. **Kling 3.0 Omni**: best motion per dollar; dialogue weaker; keep talking ≤8 s.
  7. **Veo 3.1**: contested; strong in Oakgen's dialogue test, "mouth realism fails" for Maxfusion's ad accounts; 8 s cap; expensive.
  8. **HeyGen Avatar IV/V**: polished "spokesperson" look rather than UGC.
  9. **Hedra Character-3, Grok Imagine 1.5, HappyHorse, LTX-2.x, InfiniteTalk/Wan S2V**: usable for drafts or silent bases; not the realism leaders.
- **Sync 3** is the most-recommended last step for any of them.
- MiniMax H3, FLUX 3 Max and Wan 3.0 score at the top of the blind-vote board but have no talking-specific evidence. They are worth a test, not a recommendation.

### Gaps
- No independent, controlled lip-sync or talking-head blind test (with LSE-D/SyncNet scores or human preference) covering 2026 commercial models was found. The AA arena does not isolate speech.
- No Reddit or X community threads could be retrieved (search returned none; reddit.com blocked; the X article was paywalled with HTTP 402).
- No independent tests found for Captions Mirage, RIZZ, HeyGen Avatar V, HeyGen Video 1.0, Seedance 2.5 Talking Avatar, MiniMax H3, FLUX 3 or Wan 3.0 on talking humans.
- A search summary mentioned a hands-on Wan 2.2 S2V vs InfiniteTalk test (InfiniteTalk steadier with natural background and hands; S2V more expressive, and better identity with periodic reference refresh), but I could not pin its URL, so it is not cited as a finding.

---

## 2. What do blind tests and side-by-side creator tests conclude? Which looks least "AI"?

### Takeaway
No neutral blind test of talking UGC creators exists in the sources found. The closest evidence is the AA blind arena (general quality: Seedance 2.5 and Gemini Omni Flash 1.1 lead the talking-capable models; Veo 3.1 and Kling 3.0 trail) and a handful of vendor side-by-sides. Their recurring verdicts: **Arcads** is the "least AI" turnkey actor; **Seedance 2.x** has closed the skin-texture gap; **Fabric** has the best lips among audio-driven models; **Veo 3.1** wins scripted dialogue in one test but loses on mouth realism in another. Several sources stress that framing, script, voice and variety matter more for "looking real" than the choice of model.

### Cited Findings
- Blind arena ranking (overall I2V with audio): Seedance 2.5 1138 and Gemini Omni Flash 1.1 1132 lead the talking-capable models; Seedance 2.0 1121; Grok Imagine 1.5 1067; Veo 3.1 1028; Kling 3.0 Omni 1004; LTX-2.5 984/958. — [Artificial Analysis](https://artificialanalysis.ai/video/leaderboard/image-to-video)
- In April 2026, HappyHorse-1.0 was nearly tied with Seedance 2.0 on the with-audio tracks (T2V 1236 vs 1224; I2V 1163 vs 1165), on an older snapshot and scale. — [WaveSpeed](https://wavespeed.ai/blog/de/posts/why-happyhorse-top-ai-video-leaderboard-2026/)
- Oakgen blind test (2 reviewers, 20 prompts, best-of-3, vendor-affiliated): Veo 3.1 swept dialogue 4–0; Kling won 6 of 8 motion prompts; "There is no overall winner"; route each shot to the model suited to it. Kling broke or froze in ~6% of generations, Veo in ~4%. The article's intro and scorecard disagree on who won 11 prompts (the scorecard says Veo). — [Oakgen](https://oakgen.ai/blog/kling-3-vs-veo-3-1-tested)
- Atlas Cloud ran the same UGC script and reference frame through Seedance 2.0 Mini, 2.0, Fast and 2.5: identity and lip sync held in all four; the only visible difference was camera behaviour (2.5 made bigger moves, such as raising the phone to film a mirror and cutting to a close-up). Seedance 2.5 "closed that gap" on AI skin texture. Vendor sells Seedance; workflow credited to @beechinour. — [Atlas Cloud, 12 Aug 2026](https://www.atlascloud.ai/blog/tips/how-to-make-ai-ugc-ads)
- treg picked Seedance 2.5 for "lip sync, blinks and gestures from one image". It judged Gemini 3 Pro Image the most realistic first frame; GPT Image 2.5 kept a "doll pattern in the eyes". Judged by eye; the vendor sells these tools. — [treg](https://treg.to/ugc)
- Blue Lightning (Artlist-sponsored, same inputs): Fabric is best for lip sync and the "best all-around pick"; HeyGen Avatar 4 more expressive; OmniHuman and Aurora "can look excellent" but are inconsistent on hard angles. — [Blue Lightning](https://bluelightningtv.com/2026/05/27/best-ai-avatar-generator-in-artlist-heygen-avatar-4-vs-omnihuman-1-5-vs-fabric-1-0-vs-aurora/)
- PiAPI comparison (vendor-adjacent): both OmniHuman 1.5 and Kling AI Avatar gave stable faces and accurate lip sync. Kling Avatar's hand gestures were better coordinated with the audio; OmniHuman's head moves were occasionally less natural. — [PiAPI](https://piapi.ai/en/blogs/omnihuman-1-5-vs-kling-ai-avatar)
- Versely (vendor; no methodology published) found "no scenario where OmniHuman 1.5 is the correct pick at current pricing". — [Versely](https://www.versely.studio/blog/omnihuman-1-5-review-2026)
- HeyGen's own UGC ranking: Arcads realism 9.2, HeyGen 9.0, Argil 8.2, Creatify 8.0, Magic Hour 7.0. Scores come from documented features, not rendered tests. — [HeyGen](https://www.heygen.com/blog/best-ai-avatar-tools-ugc-ads)
- Lumigen (vendor, ranks itself first): Arcads gives the "most authentic talking-head output". The tells viewers notice in ~1.5 s are glassy skin, dead eyes, stiff delivery, robotic TTS and a voice landing "a half-beat off". In its own 20-variant test, framing, script, voice and cutaways drove the difference, not the model. Optimized AI UGC reportedly converts 5–10% lower than human UGC (cites Videotok). — [Lumigen, 19 Jun 2026](https://lumigen.app/blog/ai-avatar-ugc-ads-2026/)
- Atlas Cloud: repetition across a batch (same person, room and light) is "the number one tell". Also flags the "beauty-filter look". — [Atlas Cloud](https://www.atlascloud.ai/blog/tips/how-to-make-ai-ugc-ads)

### Inferences
- "Least AI" today comes from a **native-audio model with real skin texture and handheld camera behaviour (Seedance 2.x)**, or a **curated actor product (Arcads)**, followed by a lip re-sync when the words have to be exact. The audio-driven portrait models look more "avatar-like" because the scene stays static, even when their lips are more accurate.
- The vendor evidence agrees that once a model clears a basic realism bar, the script, voice, phone framing, and variety across a batch decide whether the ad reads as human.

### Gaps
- No neutral human-preference study that isolates face, mouth, teeth and eye realism for talking clips.
- No AA arena split for "talking person" prompts.
- No retrievable creator-community polls.

---

## 3. Audio-driven (portrait + voice → video) vs native-audio generation: which is more natural, and why?

### Takeaway
Native-audio models give the more natural *performance*: body, camera, room tone and voice are generated together and fit one another. But they are capped at 8–15 s, can paraphrase or garble words (Seedance word corruption, HappyHorse paraphrasing, Gemini stutters), and drift after 6–8 s. Audio-driven models guarantee the exact script and a custom or cloned voice, but control only the face and upper body, so the scene stays static. They also decay with length (OmniHuman by 10–11 s). The 2026 practitioner pattern is a **hybrid**: generate natural footage natively (optionally steered by a voice or rhythm reference, which Seedance 2.5 accepts), then **re-sync the mouth to the clean, correct audio** with Sync 3 or lipsync-2-pro.

### Cited Findings
- Audio-driven: the supplied voice drives the mouth, so wording and length are exact and cloned voices work, but there is no control over the scene. Native: speech and video are generated together, so sync is built in, but wording can change, clips are capped, and custom voices cannot be inserted. — [UGC Vids](https://ugcvids.ai/blog/best-ai-video-model-for-lip-sync)
- Native failures: Seedance 2.0 word corruption; Gemini Omni Flash stutters in ~15% of takes, with lips following the broken audio; Kling 3.0 Pro drifts after 8 s. Recommended fix: keep the footage, generate clean audio of the correct script, and re-sync the lips (Seedance 2.0 + Sync 3 or Sync 2 Pro). — [Maxfusion](https://maxfusion.ai/blog/ai-video-models-lip-sync-2026)
- HappyHorse 1.1 paraphrases long or awkward lines, so exact wording is unreliable. — [UGC Vids](https://ugcvids.ai/blog/best-ai-video-model-for-lip-sync)
- Creative Claw advises transcribing every generated clip to confirm each word, because the model "can occasionally repeat or change a word". — [Creative Claw](https://creativeclaw.co/chatgpt/ugc-video-ads/)
- The counter-view: Oakgen says Kling's separate TTS + lip-sync pass "introduces potential sync drift", while Veo's native dialogue scored ~9/10. — [Oakgen](https://oakgen.ai/blog/kling-3-vs-veo-3-1-tested)
- General audio-conditioned generation (LTX-2.3) is "visibly less precise" at phoneme level than avatar tools that map phonemes to visemes, though its movement often looks less robotic than cheap avatar tools. — [NeMo Video](https://www.nemovideo.com/pt-BR/blog/ltx-2-3-audio-to-video-talking-portrait)
- Native voice quality can be a strength: Gemini Omni Flash's cloned voice reproduces pauses, intonation and syllables, and was called "incredible". — [invideo](https://invideo.io/blog/gemini-omni-flash-review/)
- Audio-driven emotion transfer: Fabric is tuned so "audio emotion carries into the face". — [invideo](https://invideo.io/blog/ai-lipsync-models/)
- Hybrid input: Seedance 2.5 accepts audio-only references (up to 10) to drive pacing, beat-matching and lip sync. — [Morphic](https://morphic.com/resources/models/seedance-2-5). treg passes a short clip of trending audio as a rhythm reference because the default voice is "off in rhythm". — [treg](https://treg.to/ugc)
- Platform limits on audio-driven use with real faces: Gemini Omni Flash refuses still photo + audio lip sync. — [VentureBeat](https://venturebeat.com/technology/googles-gemini-omni-flash-hits-the-api-turning-enterprise-video-production-into-a-conversation). Seedance rejects hyper-realistic reference faces unless they go through approved asset routes. — [treg](https://treg.to/ugc); [Magic Hour](https://magichour.ai/blog/seedance-20-reference-guide)
- Hedra and other audio-driven tools depend heavily on input audio quality: noisy or accented audio syncs worse, so Hedra recommends clean speech with no reverb. — [NeuronFeed](https://neuronfeed.com/reviews/hedra-review); [Hedra](https://www.hedra.com/models/video/hedra/character-3)
- Native-audio realism tip: prompt for phone-mic audio with room tone and one ambient sound, no music, and match prompt timecodes to clip length so voice and picture stay in sync. — [Atlas Cloud](https://www.atlascloud.ai/blog/tips/how-to-make-ai-ugc-ads)

### Inferences
- For **exact-script ads** (claims, prices, compliance lines), go audio-driven or native-then-re-sync. Pure native output needs a transcript check on every take.
- For a **hook or vibe line** where small wording changes are acceptable, pure native (Seedance 2.5, Gemini Omni Flash, Veo 3.1) usually reads most human.
- A re-sync fixer cannot repair body language that does not match the new audio's emotion. Write the native prompt with the same energy as the final voice track.

### Gaps
- No controlled study measured perceived naturalness of audio-driven vs native output on matched scripts.
- I found no word-error-rate data for native-audio models.

---

## 4. Known failure modes per model, and the workarounds

### Takeaway
Each model has a typical breakage point. Seedance: wrong words, and refuses realistic faces. Kling 3.0: drift after ~8 s. Gemini Omni Flash: drift after 6–7 s, ~15% stutters, fps wobble, multi-person mix-ups. Veo 3.1: 8 s cap, mouth realism disputed. OmniHuman 1.5: decay by 10–11 s, hands and background. Fabric: 720p softness. HeyGen: spokesperson stiffness. Hedra: static backgrounds, weaker close-ups. Open models: blur, teeth, identity drift. The universal workarounds are **short segments (≤8 s for native, ≤10 s for OmniHuman), regenerating rather than repairing stutters, re-syncing to clean audio, checking transcripts, and prompting for imperfect skin and phone framing**.

### Cited Findings
| Model | Failure modes | Workaround | Source |
|---|---|---|---|
| Seedance 2.0 | Word corruption (lips match the wrong sounds) | Keep footage, re-sync to correct audio with Sync 3 / Sync 2 Pro | [Maxfusion](https://maxfusion.ai/blog/ai-video-models-lip-sync-2026) |
| Seedance 2.x | Refuses hyper-realistic reference faces; default voice off-rhythm; doll-like or over-sharpened faces from defaults | Register the face as a character asset or approved portrait route; pass an audio rhythm reference; JSON prompt pinning pores, flyaways, a mole, camera and light; expect several takes ("Take 6") | [treg](https://treg.to/ugc); [Magic Hour](https://magichour.ai/blog/seedance-20-reference-guide) |
| Seedance (all) | Beauty-filter look; batch sameness; voice/picture drift | "keep the skin texture" and no beauty-filter words; vary person, room, light and behaviour beats; match timecodes to clip length | [Atlas Cloud](https://www.atlascloud.ai/blog/tips/how-to-make-ai-ugc-ads) |
| Seedance 1.5 | Native sync unusable; weak in some languages | Cheap base + mandatory fixer | [Maxfusion](https://maxfusion.ai/blog/ai-video-models-lip-sync-2026) |
| Kling 3.0 Pro | Sync drift after second 8; ~6% broken or frozen clips; "humming" mouth in Oakgen's test | Talking segments <8 s, or regenerate and repair | [Maxfusion](https://maxfusion.ai/blog/ai-video-models-lip-sync-2026); [Oakgen](https://oakgen.ai/blog/kling-3-vs-veo-3-1-tested) |
| Kling 2.6 | Individual words miss mouth shapes | Fixer layer | [Maxfusion](https://maxfusion.ai/blog/ai-video-models-lip-sync-2026) |
| Gemini Omni Flash | Drift after 6–7 s; ~15% stutters; motion drops to 8–12 fps; mixes up speakers in two-person scenes; quoting dialogue in the prompt burns subtitles in | Regenerate stuttered takes; keep lines short; prompt "speaker action: line" (colon, not quotes) | [invideo](https://invideo.io/blog/gemini-omni-flash-review/); [Maxfusion](https://maxfusion.ai/blog/ai-video-models-lip-sync-2026); [PromptsLove](https://promptslove.com/blog/gemini-omni-1-1-flash-review/) |
| Veo 3.1 | 8 s cap (~15–20 spoken words); mouth realism "fails" (Maxfusion) vs ~9/10 lip sync (Oakgen); ~4% broken clips; hand artifacts | Use for B-roll, or keep lines ≤8 s | [UGC Vids](https://ugcvids.ai/blog/best-ai-video-model-for-lip-sync); [Maxfusion](https://maxfusion.ai/blog/ai-video-models-lip-sync-2026); [Oakgen](https://oakgen.ai/blog/kling-3-vs-veo-3-1-tested) |
| Grok Imagine | Weak lip sync; 480/720p | Generate silent, drive the mouth with a fixer | [Maxfusion](https://maxfusion.ai/blog/ai-video-models-lip-sync-2026) |
| HappyHorse 1.1 | Paraphrases long lines | Short, simple lines; transcript check | [UGC Vids](https://ugcvids.ai/blog/best-ai-video-model-for-lip-sync) |
| Sora 2 / 2 Pro | API retired 24 Sep 2026 | Not for production | [Maxfusion](https://maxfusion.ai/blog/ai-video-models-lip-sync-2026); [UGC Vids](https://ugcvids.ai/blog/best-ai-video-model-for-lip-sync) |
| OmniHuman 1.5 | Frame and lip quality degrade by 10–11 s; hand and background problems; inconsistent on hard angles; controls only face and body, not camera or scene | Keep clips short, before the decay | [Maxfusion](https://maxfusion.ai/blog/ai-video-models-lip-sync-2026); [Blue Lightning](https://bluelightningtv.com/2026/05/27/best-ai-avatar-generator-in-artlist-heygen-avatar-4-vs-omnihuman-1-5-vs-fabric-1-0-vs-aurora/); [UGC Vids](https://ugcvids.ai/blog/best-ai-video-model-for-lip-sync) |
| OmniHuman (full body) | Fused fingers, bent joints, shifting sleeves and proportions; hands clipped at frame edge; calm voice + energetic prompt = awkward performance | Give the model a visible body in the source; one action per prompt; match the prompt to the voice's energy | [Atlas Cloud](https://www.atlascloud.ai/blog/tips/omnihuman-2.0-full-body-gesture-generation) |
| VEED Fabric 1.0 | 720p max, so softness in hero placements; weak at body performance | Use for heads, not action shots | [UGC Vids](https://ugcvids.ai/blog/best-ai-video-model-for-lip-sync); [Blue Lightning](https://bluelightningtv.com/2026/05/27/best-ai-avatar-generator-in-artlist-heygen-avatar-4-vs-omnihuman-1-5-vs-fabric-1-0-vs-aurora/) |
| Pruna Avatar | Preset voices only; no duration control; speech truncates ~60 s | Testing only | [UGC Vids](https://ugcvids.ai/blog/best-ai-video-model-for-lip-sync) |
| RIZZ | Vowel-dependent slips | Fixer against known-good audio | [Maxfusion](https://maxfusion.ai/blog/ai-video-models-lip-sync-2026) |
| HeyGen Avatar IV | Skews "spokesperson" rather than UGC creator; HeyGen's own table says long-form consistency degrades (Avatar V claimed stable) | Short UGC cuts; selfie framing | [Lumigen](https://lumigen.app/blog/ai-avatar-ugc-ads-2026/); [HeyGen blog](https://www.heygen.com/blog/best-talking-avatars-video-maker) |
| Hedra Character-3 | Weaker on close-ups; subtle expressions less convincing; static background; needs clean audio | Clean voice track; shorter clips | [NeuronFeed](https://neuronfeed.com/reviews/hedra-review) |
| Sync lipsync-2 / 2-pro | Cannot sync still segments; profiles, small faces, multi-person; Sync 2 Pro also struggles with rapid scene changes | Use sync-3 for angles and occlusions | [sync.so](https://sync.so/docs/models); [Maxfusion](https://maxfusion.ai/blog/ai-video-models-lip-sync-2026) |
| sync-3 | Silent lips it opens look generic; very long videos with many cuts are hard; priciest | Feed it footage where the mouth already moves | [sync.so](https://sync.so/docs/models) |
| VEED Lipsync | Less reliable on complex angles and occlusions | Front-facing footage only | [Maxfusion](https://maxfusion.ai/blog/ai-video-models-lip-sync-2026) |
| React-1 | 15 s hard cap | Short clips | [Maxfusion](https://maxfusion.ai/blog/ai-video-models-lip-sync-2026) |
| LatentSync 1.6 | Output blur | Baseline for mouth replacement | [Instavar](https://instavar.com/research/ai-video/open-source-lip-sync-models) |
| KeySync | Identity drift, artificial teeth, colour shifts, FPS/sample-rate sync errors | A/B against LatentSync | [Instavar](https://instavar.com/research/ai-video/open-source-lip-sync-models) |
| MuseTalk | Out of sync, mouth jitter, blurry or black mouth | Previews only | [Instavar](https://instavar.com/research/ai-video/open-source-lip-sync-models) |
| InfiniteTalk | Degradation outside the face, slow, 720p memory pressure; colour drift after ~1 min | V2V mode with a motion reference; sparse reference frames | [Instavar](https://instavar.com/research/ai-video/open-source-lip-sync-models); [Menon Lab](https://themenonlab.blog/blog/infinitetalk-unlimited-talking-video-generation) |
| LTX-2.3 / LipDub | Not phoneme-precise; weak with noise, >20 s, occlusion; teeth sharpness; clip-length limits | Vocal separation before generating (community workflow) | [NeMo Video](https://www.nemovideo.com/pt-BR/blog/ltx-2-3-audio-to-video-talking-portrait); [Instavar](https://instavar.com/research/ai-video/open-source-lip-sync-models) |
| All tools (viewer tells) | Glassy skin, dead eyes, stiff delivery, robotic TTS, voice a half-beat off; 2 of 20 renders drifted | Selfie tilt, off-centre framing; conversational script; premium voice; product cutaways over the talking head; check the mouth on the first frame; re-roll; make ~10 variants | [Lumigen](https://lumigen.app/blog/ai-avatar-ugc-ads-2026/) |

### Inferences
- The time limits converge on one rule: **cut talking A-roll into ≤8 s segments** (≤6–7 s for Gemini Omni Flash, ≤10 s for OmniHuman) and hide joins with B-roll or product cutaways. That also matches the UGC hook-body-CTA structure.
- Teeth problems show up mainly in open models (KeySync, LTX LipDub) and as a general "weird teeth" warning; lipsync-2-pro and sync-3 are the fixers positioned for teeth detail.

### Gaps
- No source quantified frozen-eye or blink-rate problems per model; "dead eyes" is reported only as a general tell.
- No per-model data on over-smooth skin beyond Seedance 2.5's "closed the gap" claim and GPT Image's "doll eyes" (image stage).

---

## 5. Which models handle a creator doing something while talking (walking, cooking, applying makeup) vs a static talking head?

### Takeaway
Static selfie heads: audio-driven models (Fabric, OmniHuman 1.5, HeyGen Avatar IV/V, Hedra, Arcads) are the safest and give exact scripts. Activity while talking: native video models (Seedance 2.5, which makes handheld phone moves and cuts on its own; Kling 3.0, the motion winner; Veo/Gemini Omni for short lines), then a fixer. Sync 3 handles hands and objects crossing the mouth (makeup brush, food, mic) and profile angles, which earlier fixers did not. The evidence here is thin and mostly vendor-made.

### Cited Findings
- Seedance 2.5 used bigger camera moves unprompted (raising the phone to film a mirror, cutting to a close-up), while Mini and Fast stayed in a steadier mid shot. Identity and lip sync held in all of them. — [Atlas Cloud](https://www.atlascloud.ai/blog/tips/how-to-make-ai-ugc-ads)
- Morphic suggests routing fast or action-heavy shots to other models when a take needs only a few seconds; Seedance 2.5 claims steadier long takes. — [Morphic](https://morphic.com/resources/models/seedance-2-5)
- Kling 3.0 won 6 of 8 motion prompts (camera movement, character action) vs Veo 3.1. Veo won speech and the hard handshake prompt. — [Oakgen](https://oakgen.ai/blog/kling-3-vs-veo-3-1-tested)
- OmniHuman 1.5 is strongest for gesture-aware full-body motion; Fabric is less suited to body performance. — [Blue Lightning](https://bluelightningtv.com/2026/05/27/best-ai-avatar-generator-in-artlist-heygen-avatar-4-vs-omnihuman-1-5-vs-fabric-1-0-vs-aurora/)
- Kling AI Avatar's gestures were better coordinated with speech than OmniHuman 1.5's. — [PiAPI](https://piapi.ai/en/blogs/omnihuman-1-5-vs-kling-ai-avatar)
- Full-body audio-driven failure modes: hands clipped at the frame edge, fused fingers, shifting sleeves; stacking several actions in one prompt hurts clarity; gesture timing from text cues is not frame-accurate. — [Atlas Cloud](https://www.atlascloud.ai/blog/tips/omnihuman-2.0-full-body-gesture-generation)
- Hedra Character-3: full-body movement less stable than the face; background typically static. — [NeuronFeed](https://neuronfeed.com/reviews/hedra-review)
- sync-3 has built-in obstruction detection (hands, microphones, scarves) and handles extreme angles (profiles, over-the-shoulder). lipsync-2/2-pro have only optional, slower obstruction detection and do worse on profiles. — [sync.so](https://sync.so/docs/models). Sync 3 is recommended for angles, occlusions and close-ups; VEED Lipsync is less reliable with occlusions. — [Maxfusion](https://maxfusion.ai/blog/ai-video-models-lip-sync-2026)
- InfiniteTalk's V2V mode follows a camera-motion reference video (unlimited length). This is an open-source route to re-voicing walking or handheld footage. — [Menon Lab](https://themenonlab.blog/blog/infinitetalk-unlimited-talking-video-generation)
- Vendor features (unverified quality): Claid turns an on-model photo into a walk, turn or fit check with a short spoken line — [Claid](https://claid.ai/blog/article/ai-video-upgrade); UGCVideo.ai offers POV cooking and makeup-tutorial ads — [UGCVideo.ai](https://www.ugcvideo.ai/); MakeUGC has "Product in Hand" — [MakeUGC](https://makeugc.ai/).
- Realism tip for activity shots: handheld chest-up framing with natural micro-shakes, plus behaviour beats (glances away, filler words, micro-pauses). — [Atlas Cloud](https://www.atlascloud.ai/blog/tips/how-to-make-ai-ugc-ads)

### Inferences
- Talking while cooking or doing makeup: generate the action natively (Seedance 2.5 or Kling 3.0), keep lines short, then fix the mouth with **sync-3**, which tolerates a hand or brush crossing the mouth. Audio-driven portrait models tend to clip hands and invent objects.
- Walking selfie: native models handle the handheld camera; audio-driven models mostly leave the background static, which itself reads as AI.

### Gaps
- No direct test of walking, cooking or makeup-while-talking across models was found.
- No data on how well fixers preserve hand-object interaction over the mouth beyond Sync's own docs.

---

## 6. Costs and pricing (as reported, Oct 2026)

### Takeaway
Per second of finished talking footage: open or budget audio-driven models cost roughly $0.01–0.05; Kling 3.0 ~$0.05; Seedance 2.0 cheap tiers $0.04–0.07 (2.5 ~$0.27 at 720p via one reseller); OmniHuman 1.5 $0.045–0.25 depending on reseller; Veo 3.1 ~$0.25. Fixers add $0.04–0.13/s for Sync. Turnkey products bill by subscription or minute: HeyGen from $29/mo; Arcads ~$11 per video, and a 15 s clip bills as a full minute.

### Cited Findings
- **Veo 3.1** ~$0.25/s and **Kling 3.0** ~$0.05/s at 1080p (Veo ~5× pricier). — [Oakgen](https://oakgen.ai/blog/kling-3-vs-veo-3-1-tested)
- **Seedance 2.5** $0.27/s at 720p; an 8 s clip is $2.13 on treg vs $2.55 on Higgsfield credits. The page also headlines "~$0.67 per clip", which does not match its own per-second rate (unexplained). — [treg](https://treg.to/ugc)
- **Seedance 2.0 Mini** ~$0.039/s (8 s ≈ $0.31) and **2.0 Fast** ~$0.072/s (8 s ≈ $0.58) with a promo discount through early Sep 2026; "industry rate" for an 8 s 720p clip $2.50–6. — [Atlas Cloud](https://www.atlascloud.ai/blog/tips/how-to-make-ai-ugc-ads)
- **OmniHuman 1.5:** $0.14/s on fal — [fal.ai](https://fal.ai/models/fal-ai/bytedance/omnihuman); from $0.12/s on Atlas — [Atlas Cloud](https://www.atlascloud.ai/blog/tips/omnihuman-2.0-full-body-gesture-generation); $0.177/s on Evolink, $0.168/s on ApiPass (which cites a ByteDance reference of $0.25/s), $0.045 (720p) and $0.06 (1080p) on MuAPI — [Evolink](https://evolink.ai/de/omnihuman-1-5); [ApiPass](https://apipass.dev/model/omni-human-1-5/bytedance_omni-human-1-5); [MuAPI](https://muapi.ai/ko/playground/omnihuman-1-5); $0.14/s with up to 35 s audio on ModelsLab — [ModelsLab](https://modelslab.com/heygen-api-alternative).
- **UGC Vids credits** (on a $49 / 5,000-credit plan) for a 30 s read: Pruna ~$5.41, Fabric ~$9.02, OmniHuman ~$9.60 (18.4 / ~30.7 / ~32.7 credits per spoken second). — [UGC Vids](https://ugcvids.ai/blog/best-ai-video-model-for-lip-sync)
- **Lip-sync / avatar API tiers:** premium ~$0.05–0.07/s output (draft modes ~half); volume tier (P-Video Avatar, Rapid Lipsync) sub-cent per second. — [invideo](https://invideo.io/blog/ai-lipsync-models/)
- **Sync:** sync-3 $0.107–0.133/s; lipsync-2-pro $0.067–0.083/s; lipsync-2 $0.04–0.05/s; react-1 $0.133–0.167/s; legacy 1.9 $0.02–0.025/s; max input 1–30 min depending on plan. — [sync.so docs](https://sync.so/docs/models). A reseller lists sync-3 at $0.20/s. — [Atlas Cloud](https://www.atlascloud.ai/hi/models/sync/lipsync-v3)
- **Hedra Character-3:** 6 credits per second. — [Versely](https://www.versely.studio/blog/omnihuman-1-5-review-2026)
- **HeyGen:** $29/mo ($24 annual); Avatar IV Video Look 31 credits/min, Avatar V 48 credits/min; ~$0.60 per 15 s variant on Creator. **Arcads:** ~$11 per video (reported June 2026); 800 credits per minute per actor, so a 15 s clip bills as a full minute; no public pricing page. **Creatify** $39/mo; **Argil** $39/mo; **Magic Hour** $10/mo annual. — [HeyGen blog](https://www.heygen.com/blog/best-ai-avatar-tools-ugc-ads)
- Arcads entry price is reported as $110/mo by treg ([treg](https://treg.to/ugc)) and as "from about $99/mo" by Lumigen ([Lumigen](https://lumigen.app/blog/ai-avatar-ugc-ads-2026/)); Higgsfield $49/mo, Creatify $39/mo ([treg](https://treg.to/ugc)).
- Benchmarks: AI UGC under $20 per asset vs $150–500 for human creators (Lumigen citing inBeat) — [Lumigen](https://lumigen.app/blog/ai-avatar-ugc-ads-2026/); human creator $20–50 per video (treg) — [treg](https://treg.to/ugc).

### Inferences
- A 20 s ad built natively in Seedance 2.0 Fast (3 × ~7 s takes, assuming ~3 tries each) plus a sync-3 pass on 20 s costs roughly $5–7. Arcads is ~$11 per video but bills short clips as full minutes. Veo is the most expensive per usable second because of the 8 s cap and $0.25/s. These are rough estimates from the figures above, not reported totals.

### Gaps
- No first-party price found for Seedance 2.5 (only a reseller's), Gemini Omni Flash, Grok Imagine 1.5, Captions Mirage, RIZZ, HeyGen Video 1.0, or VEED Fabric per second.
- Reseller prices vary by up to 5× for the same model (OmniHuman 1.5).

---

## 7. Which model combinations do top creators use?

### Takeaway
The recurring 2026 stacks are: **(1)** realistic first frame (Gemini 3 Pro Image / GPT Image 2–2.5 / Seedream) → **Seedance 2.x/2.5** native talking take with a voice or rhythm reference → transcript check → **Sync 3 / lipsync-2-pro** re-sync to clean ElevenLabs or cloned audio when words must be exact → CapCut edit with captions and B-roll. **(2)** Turnkey **Arcads** (or HeyGen for presenter style) for hook batches. **(3)** Audio-driven **Fabric / OmniHuman** from a portrait + ElevenLabs voice for static heads, in ≤10 s segments. **Veo 3.1 / Kling** are kept for B-roll and motion shots.

### Cited Findings
- Seedance 2.0 + Sync 3 or Sync 2 Pro (re-sync to clean audio of the correct script); Kling 3.0 Pro with talking segments <8 s; Gemini Omni Flash, regenerating stuttered takes; Seedance 1.5 + fixer as a cheap base; RIZZ + fixer; OmniHuman kept short. Fixer choice: Sync 2 Pro or VEED for front-facing footage, Sync 3 for angles, occlusions and close-ups, React-1 for performance direction under 15 s. Veo 3.1 for non-talking B-roll; Grok as silent footage + fixer. — [Maxfusion](https://maxfusion.ai/blog/ai-video-models-lip-sync-2026)
- GPT Image 2 first frame → Seedance (draft on 2.0 Mini or Fast, upgrade only the winning take to 2.5); a video-reading model breaks down a reference ad second by second; scripts pass a "judge panel" first; finish by trimming dead air, captions and a sound bed. Credited to @beechinour. — [Atlas Cloud](https://www.atlascloud.ai/blog/tips/how-to-make-ai-ugc-ads)
- Gemini 3 Pro Image character (beat GPT Image 2.5 and Seedream) → Seedance 2.5 with a character image, script and trending-audio rhythm reference → Fish Audio voice clone for narration → real phone footage for the product demo. — [treg](https://treg.to/ugc)
- Image generation → motion model → ElevenLabs voice → CapCut, ~30 min per creative. — [AdLibrary guide](https://adlibrary.com/guides/how-to-create-ai-ugc-ads-that-convert)
- Generate short shots independently so a weak hook can be swapped without rebuilding the ad. — [Seeddance.io guide](https://www.seeddance.io/blog/ai-ugc-video-ads-seedance-2-5)
- Arcads offers batch mode for hook and CTA variations and two-actor scenes; refunds technically failed generations. — [HeyGen blog](https://www.heygen.com/blog/best-ai-avatar-tools-ugc-ads)
- Premium voice (ElevenLabs) is recommended over stock TTS to avoid the robotic-voice tell; make ~10 variants and let ad spend pick. — [Lumigen](https://lumigen.app/blog/ai-avatar-ugc-ads-2026/)
- Route each shot to the model that handles its content best (Veo for speech, Kling for motion). — [Oakgen](https://oakgen.ai/blog/kling-3-vs-veo-3-1-tested)
- Compliance: the FTC's fake-testimonial rule bars presenting an AI actor as a real customer. — [HeyGen blog](https://www.heygen.com/blog/best-ai-avatar-tools-ugc-ads)

### Inferences
- For an app pipeline, the robust default is: **Seedance 2.x native take (≤8–15 s, voice reference) → automatic transcript check against the script → re-sync with lipsync-2-pro (front-facing) or sync-3 (angles, hands, makeup) only when words differ**. Fabric or OmniHuman is the fallback for exact long reads (≤30–60 s) on a static head.

### Gaps
- No X-thread or Reddit evidence on what high-spend media buyers actually run; the stacks above come from vendor-published workflows, one of them credited to a named creator (@beechinour).
- No conversion data comparing stacks.
