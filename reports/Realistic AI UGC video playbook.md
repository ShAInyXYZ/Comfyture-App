# Borrow reality, stop upscaling, ship phone footage

The creators and agencies whose AI UGC passes for real in late 2026 don't rely on one magic model. They work image-first and borrow from reality at every stage: a real creator's framing and light for the still, a real clip's motion, a real human read for the voice's timing. They generate at native resolution on the models that top blind tests, re-roll and curate, then cut short shots and add **texture rather than resolution**. Comfyture's six Emma tests already reproduce the blind-arena order (LTX-2.3 below LTX-2.5 below HeyGen), so the talking model is no longer what holds the best take back. The likelier culprits are four. The GPT Image still reads as evenly lit and doll-eyed. The **SeedVR2 diffusion upscale invents exactly the fine detail the user calls bad**. A static face-to-camera testimonial is the "avatar" look. And the take was a single one, not a curated pick. The highest-impact build, in order:

1. A Nano Banana Pro still from a phone-snap recipe, with an anchor set that includes profile views.
2. No generative upscaling of faces: native tiers, Lanczos to 1080×1920, temporal grain, 8–12 Mbps.
3. A locked persona voice applied by speech-to-speech.
4. Three takes per beat with a transcript gate, keeping HeyGen Video 1.0 reference-to-video as the cheap default.
5. A "perform it" mode that drives motion from the user's own phone clip.
6. Seedance 2.5 and MiniMax H3 as challengers for the hook beat.
7. An assembly stage, which none of Comfy's 709 templates provides.

On the default path a five-beat ad costs about **1,000 credits (~$5)**, and about 2,000 (~$10) with a Seedance hook. Nearly all the evidence comes from vendors, and no neutral blind test of talking heads exists, so each change below should be confirmed by a small A/B judged on a phone at feed size. Disclosure is mandatory on TikTok, and in the EU since 2 Aug 2026. Emma's first-person "I knit baby blankets" line is the fictional-testimonial pattern the FTC rule targets.

## Comfyture's own Emma tests already follow the blind-vote ranking

Artificial Analysis runs the only true blind-vote arena for this category: pairwise votes on clips made from the same prompt, rated by Elo, on image-to-video **with audio** ([Artificial Analysis](https://artificialanalysis.ai/video/leaderboard/image-to-video), [method](https://wavespeed.ai/blog/de/posts/why-happyhorse-top-ai-video-leaderboard-2026/)). Its 23 Oct 2026 board puts the models Comfyture tried exactly where the user's eye put them. The board scores overall clip quality, not lip-sync specifically, and its top seven are statistically tied.

| Model | Blind Elo, I2V with audio | Comfy Cloud | In Comfyture's Emma tests |
|---|---|---|---|
| MiniMax H3 (768p) | **1140** (open-weights leader) | open template on GPU time; API 27.16 cr/s at 768p, 39.22 at 2K | not tested |
| Seedance 2.5 | **1138** | i2v / r2v / Draft | not tested |
| Gemini Omni Flash 1.1 | 1132 | r2v, 30.57 cr/s at 720p | not tested |
| Seedance 2.0 | 1121 | yes | not tested |
| Kling 3.0 Omni 1080p | 1004 | yes | not tested |
| LTX-2.5 Fast / Pro | 984 / 958 | open, GPU time | test 1, and the base of test 3 |
| LTX-2.3 Pro / Fast | 903 / 888 | open, GPU time | test 2 (Comfy's ID-LoRA template), judged worst |
| HeyGen Video 1.0 | not on the board | i2v 4.53, r2v with references 9.05 cr/s at 768p | tests 4–6, judged best |

Prices: [Comfy partner pricing](https://docs.comfy.org/tutorials/partner-nodes/pricing).

The failures also match what the research predicts.

- **Test 1 (LTX-2.5).** The face drifted when Emma turned. Big head turns and camera moves are a named cause of identity drift, along with small faces and long clips ([Oakgen](https://oakgen.ai/blog/ai-ugc-character-consistency-workflow)). LTX-2.3's lip-sync is called "good enough for casual creator content but not brand spokesperson work" ([NeMo Video](https://www.nemovideo.com/pt-BR/blog/ltx-2-3-audio-to-video-talking-portrait)).
- **Test 2 (Comfy's template).** It stacked the lowest-ranked video model on Eleven v3. In the blind speech arena v3 sits at #21 (1183), against Eleven v4 at #2 (1329) ([Artificial Analysis TTS](https://artificialanalysis.ai/text-to-speech/leaderboard)).
- **Test 3 (Sync 3 on the LTX take).** It ran the order backwards. Maxfusion's rule is "Cheap model, regenerate. Expensive model, repair" ([Maxfusion](https://maxfusion.ai/blog/ai-video-models-lip-sync-2026)): spending ~187 credits to repair a weak base keeps the base's motion and face. A re-sync also cannot repair body language that doesn't fit the new voice.
- **Test 4 (HeyGen image-to-video).** Emma stopped her activity and just talked. HeyGen Video 1.0 is a general clip model that makes picture and dialogue in one pass, not an avatar product, and HeyGen publishes unexplained internal scores of "Natural motion" 63% and "Consistency" 43% ([HeyGen developer catalog](https://developers.heygen.com/heygen-video-1.0-catalog)).
- **Test 5 (HeyGen reference-to-video with a motion clip).** It kept the activity. That is the same lesson the Skaleit agency built its pipeline on: **motion copied from a real clip** beats motion the model invents ([Skaleit](https://skaleit.agency/blog/ai-ugc-ads-cheap-realistic-meta-ads-method/)).

Test 6, the best so far, still stacks four known tells.

- **The still.** In a 10-prompt head-to-head, GPT Image 2's UGC selfie "looked too clean and evenly lit", and Nano Banana Pro won both the selfie round and the hyperreal-portrait round ([AI Video Bootcamp](https://aivideobootcamp.com/blog/gpt-image-2-vs-nano-banana-pro-2026/)). A second tester found that GPT Image 2.5 kept a "doll pattern in the eyes" and judged Gemini 3 Pro Image the most realistic first frame ([treg](https://treg.to/ugc)). Flare is also the catalogue's fast "rapid prototyping" tier, not its high-fidelity Sunburst tier ([catalogue](/home/shiny/Documents/GitHub/ComfyMade/data/templates/index.json)).
- **The upscale.** HeyGen's template ships at 768p, and SeedVR2 is a generative, one-step diffusion upscaler. Generic upscalers "made the existing artifacts bigger", giving waxy skin and halos ([HackerNoon](https://hackernoon.com/how-to-upscale-ai-generated-video-without-making-the-artifacts-worse)). That is the most plausible source of the bad "small results". It is an inference: no source tests SeedVR2 on talking faces. One more point: 1080×1890 is a 4:7 frame, not the 1080×1920 (9:16) that TikTok and Reels expect.
- **The framing.** A static testimonial facing the camera is the "studio framing" and "robotic gestures" pattern on HighQualityUGC's list of tells ([HighQualityUGC](https://highqualityugc.com/blog/why-ai-ugc-ads-look-fake)).
- **The single take.** It was one take, not a curated pick.

That last point explains much of the gap with what people post online. In a CHI 2025 study of 749,828 judgments, **human curation significantly changed how often people spotted AI images** ([arXiv 2502.11989](https://arxiv.org/abs/2502.11989)). Practitioners re-roll as a matter of course: Lumigen re-rolled 2 of 20 renders for lip-sync ([Lumigen](https://lumigen.app/blog/ai-avatar-ugc-ads-2026/)), and treg's published winner was "Take 6" ([treg](https://treg.to/ugc)). Viewers see those clips as 2–3 s shots behind captions and B-roll, on a phone, after platform compression. Under those conditions only 17% of consumers picked out the AI ad in one challenge ([COOL Company](https://cool.co/press/the-cool-companys-ai-challenge-finds-that-83-of-consumers-fail-to-identify-ai-generated-ads-as-ai-reshapes-advertising/)). Most showcase clips are also published by vendors selling the tools.

The steelman is that they do use better models. A 5 s Seedance 2.5 shot at 1080p costs about 858 credits on Comfy, against 45 for a HeyGen reference-to-video take: **19× the price** ([Comfy partner pricing](https://docs.comfy.org/tutorials/partner-nodes/pricing)).

## A phone-snap still on Nano Banana Pro fixes the frame every model inherits

Every realism pipeline found in 2026 works **image-first**: fix the persona as a still, build one still per shot, then animate it. Text-to-video is kept for faceless B-roll ([Skaleit](https://skaleit.agency/blog/ai-ugc-ads-cheap-realistic-meta-ads-method/), [Retiplex](https://www.retiplex.com/blog/how-to-make-ai-ugc-ads), [Oakgen](https://oakgen.ai/blog/ai-ugc-character-consistency-workflow)). That makes the still the cheapest place to win or lose realism. Every video model inherits its light, skin, eyes and composition.

On the model, **Nano Banana Pro is the default for people**. Besides the AI Video Bootcamp rounds, a scored lab test with one non-blinded rater put it at 197 overall against Seedream 5.0 Pro's 179, and 68 against 59 on portraits ([AI Pro Photography](https://www.aiprophotography.com/ai-photography-lab/nano-banana-pro-vs-seedream/)). The evidence isn't unanimous. One character-art comparison prefers GPT Image 2 for natural skin and calls NBP "too perfect" ([aigf.love](https://aigf.love/blog/gpt-image-2-vs-nano-banana-ai-characters/)), and none of these tests is blind. GPT Image stays useful for frames that need legible text ([AI Video Bootcamp](https://aivideobootcamp.com/blog/gpt-image-2-vs-nano-banana-pro-2026/)). On Comfy, NBP is the `api_nano_banana_pro` template. Its practical cost is about **34 credits per image**, the price of the "Add Product to Character's Hand" app built on it ([estimator](/home/shiny/Documents/GitHub/ComfyMade/data/templates/credits.json)).

The prompt matters as much as the model. Comfyture's beat-picture builder asks for an "Authentic social-video look, soft natural light", the settings say "a cosy sunlit kitchen", Emma's look ends in "a tender happy smile", and the close-up camera adds "shallow depth of field" ([macaron-ugc-data.js](/home/shiny/Documents/GitHub/ComfyMade/web/js/macaron-ugc-data.js)). Comfy's own HeyGen templates go further, prompting "ARRI Alexa Mini LF, 50mm T2, locked off on a tripod… soft key light… shallow depth of field" ([template graph](/home/shiny/Documents/GitHub/ComfyMade/data/templates/graphs/api_heygen_video_1_r2v.json)). Those are the words of a set. Practitioners name **even, shadowless light, centred framing and empty, tidy rooms** as tells, and they advise "one flaw reads as real, five read as a filter" ([HighQualityUGC](https://highqualityugc.com/blog/why-ai-ugc-ads-look-fake)). Phones record wide-angle and in deep focus, so shallow-focus lens talk pulls toward an editorial portrait.

The winning UGC selfie prompt describes a mundane, slightly bad snap:

- front-camera aesthetic with slight fisheye distortion and mild grain;
- hard overhead kitchen LED light;
- an imperfect person and imperfect props;
- three or four named pieces of clutter;
- the line "should look like an Instagram Story snap, not a food advertisement. Intentional imperfection is the point" ([AI Video Bootcamp](https://aivideobootcamp.com/blog/gpt-image-2-vs-nano-banana-pro-2026/)).

Applied to Emma's "show" beat, a starting prompt reads:

```
Vertical 9:16 phone video frame, filmed by her partner over her shoulder, slight wide-angle distortion,
everything in focus, mild sensor noise, the window slightly blown out. A 34-year-old woman with light
brown hair in a messy bun with flyaways, faint under-eye shadows and fine lines, no makeup, a pilled grey
cardigan with the sleeves pushed up, pours water from a kettle into a baby bottle at a cluttered counter:
a bottle steriliser, an open tin of formula, a ball of oatmeal yarn with knitting needles stuck in it,
a muslin cloth. A tablet leans against the kettle, its screen plain mid-grey. Hard daylight from the
window on her left, the right side of her face in shadow, a cool overhead LED. She glances at the camera
mid-word with a half-smile. It should look like a frame from a mum's Instagram Story, not an advert.
Natural skin with pores, no retouching, no beauty filter, no studio lighting, no text.
```

The blank tablet is deliberate. Comfyture sells software, so its product shots never need to be generated. A real screen recording can be corner-pinned onto the tablet, or cut in as its own B-roll. treg's stack likewise uses real phone footage for the product demo ([treg](https://treg.to/ugc)). Invented labels and interfaces are a tell in their own right ([HighQualityUGC](https://highqualityugc.com/blog/why-ai-ugc-ads-look-fake)). Stills should come out at exactly 9:16, or larger and then cropped, because HeyGen keeps the input image's aspect ratio ([catalogue](/home/shiny/Documents/GitHub/ComfyMade/data/templates/index.json)).

The fix for Emma's drifting face is a reference set, not a better prompt:

- **One hero still plus 3–8 approved anchors**: hero face, profile, full body, talking-head crop and product-holding shot. In Oakgen's example, 30 stills are generated and 5 approved.
- **Reject any shot whose face match scores below 4 of 5.**
- **Never change age, hair, wardrobe, setting and light in the same edit** ([Oakgen](https://oakgen.ai/blog/ai-ugc-character-consistency-workflow)).
- **Use few references.** Two people and two products give cleaner results than the maximum the model allows ([UD](https://www.ud.hk/en/blogs/insight/article/nano-banana-21-consistency-2026-10-12)).

Passing a profile anchor alongside the front still gives a reference-to-video model a reference for the turn that broke test 1. A character LoRA (Z-Image Turbo, 15–50 images) pays off only at volume. Segmind argues that reference editing now matches a LoRA for most static use ([Segmind](https://blog.segmind.com/lora-training-for-consistent-character-is-dead-2/)).

## Route talking shots by job, and borrow real motion for activity

Talking models fall into three families with opposite strengths.

- **Native-audio models** make face, body, room and voice in one pass: Seedance 2.5, Gemini Omni Flash, Kling 3.0 Omni, MiniMax H3, HeyGen Video 1.0. The performance hangs together, but clips are capped and words can change.
- **Audio-driven portrait models** say the supplied track exactly but leave the scene static: VEED Fabric, HeyGen Talking Photo, OmniHuman.
- **Lip-sync fixers** re-time the mouth on footage that already exists: Sync 3, VEED Lipsync ([UGC Vids](https://ugcvids.ai/blog/best-ai-video-model-for-lip-sync), [Maxfusion](https://maxfusion.ai/blog/ai-video-models-lip-sync-2026)).

The 2026 practitioner pattern is a **hybrid**: generate natural footage natively, check every word, and re-sync to clean audio only when the words are wrong.

| Model on Comfy | Cost per 5 s | Strength | Known failure | Role for Comfyture |
|---|---|---|---|---|
| HeyGen Video 1.0 r2v (`api_heygen_video_1_r2v`) | **45 cr** at 768p with references; 136 at 2K | up to 9 images, 3 videos and 3 audio references; user-validated | 768p in the template; no independent tests | **Default A-roll** |
| Seedance 2.5 (Draft then final) | **155** (480p draft), 349 (720p), **858** (1080p); 924+ with a video input | top talking model in blind votes; up to 30 s; "closed the gap" on skin ([Atlas Cloud](https://www.atlascloud.ai/blog/tips/how-to-make-ai-ugc-ads)) | word corruption; refuses hyper-realistic faces on some routes ([treg](https://treg.to/ugc)) | Hook-beat challenger |
| MiniMax H3 r2v | GPU time (open); API 136 at 768p, 196 at 2K | #1 blind Elo; native 2K; voice and motion references | no talking-specific evidence yet | Challenger worth testing |
| Gemini Omni 1.1 Flash | 153 at 720p, 229 at 1080p | excellent voice and texture ([invideo](https://invideo.io/blog/gemini-omni-flash-review/)) | drifts after 6–7 s; ~15% of takes stutter; refuses photo + audio lip-sync ([VentureBeat](https://venturebeat.com/technology/googles-gemini-omni-flash-hits-the-api-turning-enterprise-video-production-into-a-conversation)) | Short lines only |
| Kling 3.0 Motion Control (`api_kling_motion_control3`) | 133 (std), 177 (pro) | the character performs a reference clip's actions | Kling's talking drifts after ~8 s | "Perform it" mode |
| Higgsfield Genjutsu motion transfer | not priced before the run | keeps the source's motion, camera, timing **and audio** | 720p | "Perform it" mode |
| VEED Fabric 1.0 / HeyGen Talking Photo | price not listed / 75 | exact script; Fabric has the most accurate lips among audio-driven models ([Blue Lightning](https://bluelightningtv.com/2026/05/27/best-ai-avatar-generator-in-artlist-heygen-avatar-4-vs-omnihuman-1-5-vs-fabric-1-0-vs-aurora/)) | static scene; Fabric capped at 720p | Long exact reads |
| Sync 3 lip-sync (`api_sync_so_lip_sync_video`) | 200 | "the best fixer available"; handles hands crossing the mouth, and profiles ([sync.so](https://sync.so/docs/models)) | generic lips when it opens a silent mouth | Repair only on a transcript mismatch |
| LTX-2.3 / 2.5 | GPU time | cheap | bottom of the blind board | Drafts and faceless B-roll only |

Prices are from [Comfy partner pricing](https://docs.comfy.org/tutorials/partner-nodes/pricing), plus the catalogue and local estimator for the templates. The Seedance per-resolution costs are Comfy's own 5 s estimates.

Two rules hold across every model.

First, **cut talking segments to ≤8 s** (≤6–7 s for Gemini Omni Flash), because native sync drifts after that ([Maxfusion](https://maxfusion.ai/blog/ai-video-models-lip-sync-2026)). Comfyture's 4–6 s beats already comply. Word density needs watching too. Seedance fits about 12 words per 10 s of dialogue ([UGC Copilot](https://ugccopilot.ai/blog/seedance-2-native-audio-generation-guide/)), while Emma's 11-word line in 5 s runs at 2.2 words per second. HeyGen's own templates direct "about two words per second", so the line suits HeyGen but would need a longer beat on Seedance.

Second, **transcribe every native take** and compare it with the script, because these models "can occasionally repeat or change a word" ([Creative Claw](https://creativeclaw.co/chatgpt/ugc-video-ads/)). Comfy's ElevenLabs Scribe v2 node returns word-level timings (`words_json`) for about 1.5 credits a minute ([local graph](/home/shiny/Documents/GitHub/ComfyMade/data/templates/graphs/api_elevenLabs_speech_to_text.json)). That gives Comfyture a cheap gate: regenerate a mismatched cheap take, and send only an expensive one to Sync 3.

Activity is where reality has to be borrowed. Native models handle a creator moving while talking far better than audio-driven ones, which clip hands and leave backgrounds static ([Atlas Cloud](https://www.atlascloud.ai/blog/tips/omnihuman-2.0-full-body-gesture-generation), [NeuronFeed](https://neuronfeed.com/reviews/hedra-review)). Copying motion from a real clip is the strongest move available: Skaleit drives Kling Motion Control with a real reference video ([Skaleit](https://skaleit.agency/blog/ai-ugc-ads-cheap-realistic-meta-ads-method/)). Comfy carries all the pieces:

- Kling 3.0 Motion Control (26.59 / 35.45 cr/s) ([Comfy partner pricing](https://docs.comfy.org/tutorials/partner-nodes/pricing));
- Higgsfield Genjutsu, which "keeps its motion, camera movement, timing and audio" while recasting from 1–8 references;
- the open Wan Animate 2 ([catalogue](/home/shiny/Documents/GitHub/ComfyMade/data/templates/index.json)).

The cleanest source of motion is **the user's own phone clip**: six seconds of pouring water and saying the line. That brings real hand motion, real camera shake and real speech timing in one file, and avoids the rights problem of lifting other creators' footage. Sync 3 is the right repair here, because it is the fixer built for a bottle or a brush crossing the mouth ([sync.so](https://sync.so/docs/models)).

## Voice is the biggest tell, and speech-to-speech is the cheapest cure

Skaleit calls voice "the single biggest tell" ([Skaleit](https://skaleit.agency/blog/ai-ugc-ads-cheap-realistic-meta-ads-method/)). Riffkit says a lip-sync drift of about 50 ms "is enough to register as wrong" ([Riffkit](https://riffkit.ai/blog/why-ai-ugc-ads-look-fake)). For text-to-speech, the blind arena now puts **Eleven v4 Turbo (1335) and Eleven v4 (1329) at the top**, statistically tied. Fish Audio Drama 3 is the best open-weights model, at #9 ([Artificial Analysis TTS](https://artificialanalysis.ai/text-to-speech/leaderboard)). On Comfy, v4 costs 24.14 credits per 1K characters, half the price of v3 ([Comfy partner pricing](https://docs.comfy.org/tutorials/partner-nodes/pricing)). Emma's line is about 61 characters, so roughly 1.5 credits.

The arena scores clean narration, though, not a casual read at arm's length. The more natural route is **speech-to-speech from a human performance**. ElevenLabs' Voice Changer carries over the source's "tone, delivery, cadence and timing", including whispers, sighs and laughs. It also keeps the source accent, so the performer has to match the persona ([ElevenLabs](https://elevenlabs.io/docs/eleven-creative/playground/voice-changer)). On Comfy it costs 50.64 credits a minute, about 4 credits per beat.

The same tool enables the swap workflow that suits Comfyture's HeyGen and Seedance takes. Prompt the native model for "dialogue only, no music, no background sound". Treat its audio as a scratch track and convert it to the persona voice. Lay it back on the picture: the timing holds, so the mouth needs no resync ([Mirrorize](https://mirrorize.ai/learn/the-best-lipsync-workflow-right-now-seedance-2-0-elevenlabs)). This one change gives every beat **the same voice** without forcing a lip-sync pass. Native models hold the voice within a clip but not reliably across separate generations ([Clipdance](https://clipdance.ai/blog/seedance-2-consistent-voice)).

Comfyture should keep one **voice record per persona**:

- **A designed or library voice.** It avoids any real person's likeness.
- **Eleven v4 at Natural stability**, regenerated 2–3 times per line ([Runware](https://runware.ai/docs/models/elevenlabs-v3/guides/directing-with-audio-tags)).
- **A pronunciation entry for "Comfyture"**, rechecked after every regeneration ([Novoads](https://novoads.ai/en/blog/eleven-v4)).
- **A 10–15 s clean, dry reference clip** for models that take audio references, sent with the instruction to use it "only for speaker identity", not for "microphone distance, room echo, compression artifacts, hiss, hum" ([Genflick](https://genflick.com/blog/seedance-voice-consistency-audio-reference-2026-05-03)).

In scripts, action tags such as `[sighs]`, `[laughs]` and `[pause]`, plus CAPS for emphasis, beat feeling adjectives like `[friendly]`, which underperform ([Superscale](https://superscale.ai/learn/sound-effects-emotions/)). v3 and v4 ignore SSML breaks; ellipses and dashes do that job instead ([ElevenLabs prompting](https://elevenlabs.io/docs/best-practices/prompting)).

The audio should then sound like a small mic in a real room, not a telephone line. Start with a high-pass at about 80–100 Hz ([Music Guy Mixing](https://www.musicguymixing.com/eq-for-voice-over/)), then a slight 2–4 kHz cut, gentle compression and a room-tone bed far below the voice. One source puts the bed at −50 to −60 dB ([DEV Community](https://dev.to/ezinne_anne/why-your-ai-voiceovers-sounds-robotic-and-how-to-fix-them-4ga3)). Stop the moment the voice turns "papery, metallic, or oddly detached" ([LALAL.AI](https://www.lalal.ai/blog/echo-removal-how-to-fix-roomy-voice-recordings/)). Comfyture's take prompts already ask for "Natural room sound, a phone microphone", which is the right direction. One continuous room-tone bed under the whole ad would also hide the room changing between takes (my inference).

## Texture, not pixels: the finishing and editing chain

The practitioner consensus is blunt: **don't upscale weak footage, regenerate it natively**. Test hooks at low resolution, and re-render only the winners ([InVideo](https://invideo.io/faq/720p-vs-1080p-for-ai-video-generation-which-should-you/), [VidAU](https://www.vidau.ai/make-ai-generated-ugc-ads-look-authentic/)). "AI footage doesn't fail soft. It fails plastic, and a plastic failure gets more plastic the harder you push it" ([HackerNoon](https://hackernoon.com/how-to-upscale-ai-generated-video-without-making-the-artifacts-worse)).

For Comfyture that means **dropping SeedVR2 from talking shots**. There are three native options:

- HeyGen's 2K tier: 27.16 cr/s with references, about 136 credits per 5 s, listed on the pricing page though the template ships at 768p.
- MiniMax H3 at native 2K.
- Seedance at 1080p.

Otherwise, deliver 768p resized to 1080×1920 with a plain Lanczos resize. If an upscaler is ever needed, the guidance is to turn Sharpen down and Dehalo up, keep Recover Detail conservative, and upscale before grading ([HackerNoon](https://hackernoon.com/how-to-upscale-ai-generated-video-without-making-the-artifacts-worse)). Topaz Starlight Precise 2.5 on Comfy costs about 0.70 credits per source frame at 1080p, about 84 per 5 s at 24 fps ([Comfy partner pricing](https://docs.comfy.org/tutorials/partner-nodes/pricing)).

The texture pass runs in a fixed order:

1. **Grade first**, slightly flat, because phone footage is flatter than AI defaults.
2. **Then subtle temporal grain.** One recipe is 2–3% film grain ([InVideo](https://invideo.io/faq/does-adding-film-grain-and-blur-to-ai-generated-video/)); another is FFmpeg `noise` strength 10–25 with the per-frame flag ([RenderIO](https://renderio.dev/blogs/make-ai-video-look-natural/)). Use `c0s` to keep the grain in luma only ([FFmpeg docs](https://ffmpeg.org/ffmpeg-filters.html)).
3. **Then an optional 0.3–0.8 px soften** on generators that ship over-sharp skin.

The rule for all three: "if you can see grain consciously, it's too much" ([InVideo](https://invideo.io/faq/does-adding-film-grain-and-blur-to-ai-generated-video/)). An iPhone's default 1080p30 records about 60 MB per minute, roughly 8 Mbps ([TechRadar](https://www.techradar.com/how-to/how-to-shoot-4k-video-on-your-iphone)), which fixes the master's bitrate. A starting chain, to tune by eye on a phone at feed size:

```
ffmpeg -i take.mp4 \
  -vf "scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,\
eq=contrast=1.03:saturation=0.95,noise=c0s=10:allf=t+u,gblur=sigma=0.4" \
  -af "highpass=f=100,equalizer=f=3000:t=q:w=1.2:g=-2,lowpass=f=12000,\
acompressor=threshold=-18dB:ratio=2.5,loudnorm=I=-14:TP=-1.5" \
  -c:v libx264 -profile:v high -crf 19 -preset slow -pix_fmt yuv420p \
  -c:a aac -b:a 160k -movflags +faststart master.mp4
```

The grain, grade and soften values come from the sources above. The compressor ratio, the 12 kHz roll-off and the −14 LUFS loudness target are starting points of mine, not sourced numbers. Keep the model's native frame rate, because converting 24 to 30 fps by duplication or interpolation adds judder or warping. Prompt for handheld shake rather than adding it in post ([Higgsfield](https://higgsfield.ai/blog/3QU3e0LGo6VHDMEQGwdGv1)).

Editing turns clips into UGC, and it also limits how long a viewer can study any AI face. TikTok's own guidance:

- introduce the proposition in the first 3 s and land the hook within 6 s;
- keep a "DIY or not overly polished look";
- show on-screen text at 5–10 words per second;
- run 3–5 *very different* creatives per ad group ([TikTok Ads](https://ads.tiktok.com/resources/help/article/creative-best-practices)).

In practice that means:

- **a visual change every 2–4 s**: jump cuts, punch-ins, B-roll laid over the talking voice ([Influee](https://influee.co/blog/raw-ugc-to-ads), [Lumigen](https://lumigen.app/blog/ai-avatar-ugc-ads-2026/));
- **burned-in captions re-timed to the voice**, because captions on their own timing look machine-made ([Riffkit](https://riffkit.ai/blog/why-ai-ugc-ads-look-fake));
- **captions kept clear of the Reels UI**, roughly the top 14%, the bottom 35% and 6–10% at the sides ([House of Marketers](https://houseofmarketers.com/guide-to-safe-zones-tiktok-facebook-instagram-stories-reels/), [Adnova](https://adnova.ai/blogs/meta-ad-safe-zones-guide)).

Recommended lengths conflict across sources, from 9–15 s up to 30–60 s for Facebook Feed ([Cometly](https://www.cometly.com/post/how-long-should-a-tiktok-ad-be), [Runneth](https://runneth.com/blog/how-to-create-effective-ugc-ads)). The robust answer is to cut 15 s, 25–30 s and 45 s versions of one body and test 3–5 hooks on it ([LaunchPoint](https://www.launchpointhq.com/blog/re-cut-ugc-into-paid-ad-variants)). None of Comfy's 709 templates burns captions, sequences A-roll and B-roll, or ducks music ([catalogue](/home/shiny/Documents/GitHub/ComfyMade/data/templates/index.json)), so Comfyture has to own assembly.

## The build, ranked by impact, with per-stage settings and prices

The ranking weighs each change's effect on "looks AI" against the strength of its evidence and its cost. The model upgrade comes seventh on purpose: HeyGen already wins the user's own A/B, and the cheaper moves above it address the specific complaints (fine detail, lifeless motion, a voice that doesn't match).

| Rank | Change | Replaces in the tests | Why | Added cost per 5 s beat |
|---|---|---|---|---|
| 1 | Nano Banana Pro still from the phone-snap recipe; anchors including profile and 3/4 views; exact 9:16; 2 candidates | GPT Image 2.5 Flare testimonial still | NBP wins the UGC-selfie test; flat light and staged framing are top tells | ~34–68 cr |
| 2 | No SeedVR2 on faces; native tier, then Lanczos to 1080×1920 and the grain chain | SeedVR2 to 1080×1890 | Upscalers enlarge artifacts; 1890 isn't 9:16 | saves GPU time |
| 3 | Persona voice record; swap each take's audio by speech-to-speech; audio chain | HeyGen voice reference alone; v3 / v4 TTS | Voice is the biggest tell; the swap keeps timing | ~4 cr |
| 4 | Three takes per beat, Scribe v2 transcript gate, tell checklist | single take | Curation changes detection; re-rolls are standard | ~+90 cr |
| 5 | "Perform it" mode: own phone clip → Kling 3.0 Motion Control or Genjutsu → swapped voice → Sync 3 if needed | HeyGen motion reference (test 5) | Real motion and timing remove floaty movement | 133–377 cr when used |
| 6 | UGC edit: shots ≤6 s, real screen-recording cutaways, word captions, one room-tone bed | none | Shorter exposure to the AI face; real product footage | 0 (in-app) |
| 7 | Hook-beat challengers: Seedance 2.5 Draft → 1080p; MiniMax H3 2K | HeyGen at 768p | Top of the blind board | 155–1,323 cr |
| 8 | Disclosure on by default; testimonial lines reframed | none | Mandatory on TikTok and in the EU | 0 |

Per beat, the default chain runs nine stages.

1. **Anchor set**, once per persona. `api_nano_banana_pro` makes the hero, 3/4, profile, full-body and talking-head stills from the recipe, about 170 credits in all.
2. **Beat still.** An NBP edit with one change per edit, the tablet screen left blank, and `templates-subject_holding_product.app` whenever a physical product appears. About 34 credits each.
3. **Voice reference**, once. A 10–15 s Eleven v4 line, or the user's own phone read converted by speech-to-speech.
4. **Take.** `api_heygen_video_1_r2v` at 768p, three seeds, about 45 credits each. Pass @Image1 as the beat still, @Image2 as the profile anchor, @Video1 as an optional motion clip of the user's own, and @Audio1 as the voice reference. Phone-language action and camera words, "dialogue only, no music, phone microphone in a real room", no cinema terms.
5. **Transcript gate.** Scribe v2 against the script, about 0.1 credit.
6. **Voice lock.** ElevenLabs speech-to-speech on the take's audio, about 4 credits.
7. **Repair.** Sync 3, about 200 credits, only on a mismatch the cheaper path can't regenerate.
8. **Finishing.** The in-app FFmpeg chain above, at no credit cost.
9. **Assembly.** Cutaways, captions from `words_json`, the room-tone bed and the variant cuts.

That puts a beat at about 175–210 credits (~$0.85–1.00, at the ~211 credits per dollar implied by Comfy's GPU prices ([Comfy pricing](https://comfy.org/pricing/))). Emma's 27 s, five-beat story comes to about **1,000 credits (~$5)**. Moving the 4 s hook to Seedance 2.5 means three 480p drafts at about 124 credits each, then one 1080p final at about 686. That brings the ad to about **2,000 credits (~$10)**. I read Comfy's Draft template, a 480p preview plus a reusable draft ID, as charging the final at the 1080p rate; confirm that on the first run.

Next, in the order that answers the most for the least spend. The repo's rule requires the user's approval before any of the paid tests.

1. **Re-finish test 6** two ways: Lanczos plus grain against SeedVR2, judged on a phone at feed size. GPU time only.
2. **Same HeyGen settings, two stills**: a Nano Banana Pro still from the recipe against the GPT Image 2.5 one. About 70 + 90 credits.
3. **One Seedance 2.5 Draft** reference-to-video at 480p, about 155 credits. It also reveals whether Comfy's route accepts a photoreal AI face. Comfy separately offers a "Seedance 2.0 Real Human" route that requires verifying a real person's identity ([catalogue](/home/shiny/Documents/GitHub/ComfyMade/data/templates/index.json)).
4. **MiniMax H3** reference-to-video on its open GPU template.
5. **A self-recorded performance** through Kling 3.0 Motion Control std, about 133 credits.

## Disclosure is mandatory, and Emma's script is the legal pressure point

On the platforms:

- **TikTok** requires its AI-generated content disclaimer on ads that are completely AI-generated or significantly modified by AI, shown as a text label at the bottom of in-feed ads ([TikTok Ads Help](https://ads.tiktok.com/help/article/about-ad-disclaimers-in-tiktok-ads-manager)). Third-party guides say undisclosed ads are rejected or restricted ([Moveas](https://moveas.app/blog/tiktok-ads-ai-generated-content-label/)). TikTok Shop bans AI depictions of doctors, celebrities and public figures promoting products **even when labelled** ([TikTok Shop](https://seller-us.tiktok.com/university/essay?knowledge_id=491489038501663&lang=en)).
- **Meta** labels ads made with its own AI tools, puts the label next to "Sponsored" when they add a photorealistic human, and from 1 June 2026 "will begin automatically detecting" third-party AI through industry signals ([Meta Newsroom](https://about.fb.com/news/2025/02/gen-ai-transparency-metas-ads-products/)). Whether commercial advertisers must self-disclose on Meta is unconfirmed.

In the EU, the AI Act's Article 50 deepfake-disclosure duty for deployers has applied since **2 Aug 2026**, and the Digital Omnibus did not delay it ([Legalithm](https://www.legalithm.com/en/blog/eu-ai-act-what-applies-2-august-2026)). Penalties reach €15M or 3% of global turnover ([CSA](https://labs.cloudsecurityalliance.org/research/csa-research-note-eu-ai-act-article-50-transparency-20260729/)). Whether a wholly fictional person counts as a "deepfake" needs a legal reading, but on-ad disclosure is the safe default.

In the US, the FTC has "no blanket prohibition on the use of AI-generated avatars", but an avatar's message can be a testimonial, and actors portraying testimonialists "could be deceptive" unless it is an "obviously fictional dramatization" ([FTC Q&A](https://www.ftc.gov/business-guidance/resources/consumer-reviews-testimonials-rule-questions-answers)). In December 2025 the FTC warned ten companies, citing penalties of up to $53,088 per violation ([FTC](https://www.ftc.gov/news-events/news/press-releases/2025/12/ftc-warns-10-companies-about-possible-violations-agencys-new-consumer-review-rule)).

Emma's lines ("I knit baby blankets… No weekend lost to filming") are a first-person usage testimonial from someone who doesn't exist. Two defensible framings exist. One labels her on screen as an AI-generated character, with every claim true of real users. The other makes the reveal the hook, which suits a product that makes AI video: "Emma isn't real. I made her in Comfyture." Consumer sentiment supports disclosing either way: **74% of US consumers want AI use in ads disclosed, and 46% dislike AI-generated people in ads** ([Cint](https://www.globenewswire.com/news-release/2026/10/20/3384820/0/en/cint-report-finds-74-of-u-s-consumers-believe-brands-should-disclose-ai-use-in-advertising.html)).

On the engineering side:

- **Default the AI flag on at export.**
- **Never copy the `-map_metadata -1` step** some realism recipes include. RenderIO itself says its filters "do not fool trained AI detectors" ([RenderIO](https://renderio.dev/blogs/make-ai-video-look-natural/)), and SynthID is built to survive re-encoding ([Google DeepMind](https://deepmind.google/technologies/synthid/)).
- **Use designed voices, never clones of real creators.** Tennessee's ELVIS Act and similar state laws give causes of action against unauthorized voice replicas ([RecordingLaw](https://www.recordinglaw.com/us-laws/deepfake-laws/ai-voice-cloning-laws/)).

## Conclusion

The research changes what "realistic" means for Comfyture. It isn't a property of the model; it measures **how much real material each shot has touched**: real light conventions in the still, a real clip's motion, a real person's timing in the voice, real product footage in the cutaways. Comfyture has an advantage most AI UGC tools lack. Its product is software, so the proof shots can be real screen recordings, and its user can perform a beat on their own phone in a minute. The "perform it" mode and the real-screen B-roll are the two features most likely to close the gap with the best online work. Bigger models are not.

Two practical warnings follow. Judging takes full-screen on a desktop overweights exactly the fine detail that feed viewing hides. Comfyture's review step should preview takes at phone size after a platform-like re-encode, with the "mute the first 3 seconds: phone video or set?" test ([HighQualityUGC](https://highqualityugc.com/blog/why-ai-ugc-ads-look-fake)). And because a Seedance 1080p shot costs 19 HeyGen takes, the open question worth one paid experiment is whether three curated HeyGen takes beat one Seedance take. The evidence so far can't answer it, and the answer sets Comfyture's cost structure.
