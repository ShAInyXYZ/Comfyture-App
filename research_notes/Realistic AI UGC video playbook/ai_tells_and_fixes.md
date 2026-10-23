# AI tells in AI UGC video ads, and the 2026 fixes for each

Research date: 2026-10-23. Scope: legitimate ads for the user's own products. **Source quality warning:** nearly all of the hands-on "how to make AI UGC look real" material in 2025–2026 comes from blogs run by companies that sell AI UGC tools, FFmpeg APIs, upscalers or agency services. Treat their numbers as practitioner starting points, not tested standards. Each vendor source is marked [vendor]. Reddit threads did not come up in search (r/aivideo, r/editors and r/FacebookAds turned up nothing indexable), so the creator voices here come from X articles and forums instead.

---

## Q1. Visual tells: which ones matter, and what do viewers and reviewers notice first?

### Takeaway
In controlled tests, people barely beat chance at telling AI ads from human-made ones. What they report is "something feels off", not one specific artifact. Practitioners agree on a short list of tells that cause that feeling: robotic or looping gestures with a head that snaps back to center, a dead-eyed stare, a "robotic mouth" or lip-sync drift, plastic or over-sharp skin, flat shadowless studio light, centered "QVC" framing, sterile empty rooms, faces or products that drift between shots, and invented or warped labels. Anatomical errors (fingers, teeth, eyes) remain the classic academic categories.

### Cited Findings
**What viewers actually detect (measured):**
- COOL Company's AI Challenge: only 17% of consumers correctly picked out the AI-generated ad, so 83% got it wrong. 50% started the test sure they could spot AI creative, and that confidence "fell considerably" once they tried. — [COOL Company press release](https://cool.co/press/the-cool-companys-ai-challenge-finds-that-83-of-consumers-fail-to-identify-ai-generated-ads-as-ai-reshapes-advertising/)
- A Canva/Harris Poll survey of 3,547 consumers reportedly found 70% say they can usually spot an AI ad because "something feels off". This figure comes from a secondary write-up and I could not verify it in Canva's own material. Canva's coverage does say 68% don't mind AI in ads when it makes them more helpful or relevant. — [MarketingTech News on Canva report](https://www.marketingtechnews.net/news/consumers-useful-ai-ads-canva-report/)
- Cint (Oct 2026 release, survey of about 1,000 US consumers): 74% think brands and creators should disclose AI use in advertising, and **46% dislike seeing AI-generated people in ads**. Seen via the search snippet only; the page returned 403 when fetched. — [Cint via GlobeNewswire](https://www.globenewswire.com/news-release/2026/10/20/3384820/0/en/cint-report-finds-74-of-u-s-consumers-believe-brands-should-disclose-ai-use-in-advertising.html)
- IAB survey: 82% of ad executives think Gen Z and millennials feel positive about AI-generated ads, but only 45% of those consumers say they do. — [Moonex Studio summary of IAB](https://moonexstudio.com/blog/ai-ad-gap-2026/) (secondary); [MarketingProfs chart](https://www.marketingprofs.com/charts/2026/54424/ai-ads-the-perception-gap-between-marketers-and-consumers)

**Academic taxonomy of tells (Northwestern, Kamali et al.):**
- The 2024 guide "How to Distinguish AI-Generated Images from Authentic Photographs" sorts artifacts into five groups: **anatomical, stylistic, functional, violations of physics, and sociocultural**. It also notes that human-visible artifacts "are not always present". — [arXiv 2406.08651](https://arxiv.org/abs/2406.08651v1)
- In news coverage of the guide, "anatomical" means fingers, eyes and bodies that look off, limbs bending wrong, and "too many teeth". "Stylistic" means images that look plastic, glossy, shiny or cartoonish. — [WMAR2 News / Scripps disinformation desk](https://www.wmar2news.com/politics/disinformation-desk/real-vs-fake-can-you-spot-ai-generated-images)
- Follow-up CHI 2025 study: 450 AI images and 149 real ones, 749,828 judgments from 50,444 participants. Scene complexity, artifact type, display time and **human curation** all significantly changed detection accuracy. In other words, picking the best generations is itself a realism lever. — [arXiv 2502.11989](https://arxiv.org/abs/2502.11989)

**Practitioner tell lists (2026):**
- HighQualityUGC [vendor, Jul 2026] lists six tells:
  1. **Robotic gestures**: arms loop, head resets to center.
  2. **Overperfect lighting**: even, shadowless, nothing blown out.
  3. **Flat voice**: no emphasis or breath.
  4. **Studio framing**: centered, QVC-style.
  5. **Empty environment**: blank wall, nothing lived-in.
  6. **Drifting face**: jawline, hairline or skin tone shifts between clips.

  It adds invented labels, typefaces or logos on products, over-saturated color, and perfect symmetry. Its quick test: **mute the first 3 seconds and ask "phone video or set?"** It cites "67% naming robotic gestures" without a source. — [HighQualityUGC](https://highqualityugc.com/blog/why-ai-ugc-ads-look-fake)
- Stijn Feijen (@spwfeijen) on X, May 13 2026, 265K views. He promotes MakeUGC. His "don't" list: face drift between shots, static or perfectly centered framing, **plastic skin shine**, uncanny perfect symmetry, flat studio light, **dead-eye stare**, and a **"robotic mouth"**, which he calls "a dead giveaway". — [YouMind copy of X article](https://youmind.com/landing/x-viral-articles/ai-ugc-video-workflow-guide)
- Riffkit [vendor, Jun 2026]: a lip-sync drift of **about 50 ms** "is enough to register as wrong". Captions that flicker, drift or garble words "scream 'machine made this'". — [Riffkit](https://riffkit.ai/blog/why-ai-ugc-ads-look-fake)
- InVideo [vendor, Jul 2026]: "Seedance 2.0 output in particular ships with an ultra-sharp, plasticky skin quality that color grading alone won't kill." Warped hands and unnatural motion can't be fixed with texture tricks and need a regenerated shot. — [InVideo FAQ](https://invideo.io/faq/does-adding-film-grain-and-blur-to-ai-generated-video/)
- Lumigen [vendor, Jun 2026]: check the mouth on the first frame before shipping. The author re-rolled 2 of 20 generations for lip-sync. — [Lumigen](https://lumigen.app/blog/ai-avatar-ugc-ads-2026/)
- Repetition is a tell at the feed level: "Viewers will see the same face across their feed and attribute it to spam." — [Nova Pixel](https://novapixeldev.com/blog/how-to-make-ai-ugc-ads-that-convert-2026-authenticity-playbook) [vendor/agency, Jul 2026]
- Product drift and warped labels break believability. The suggested fix is to anchor the product to approved reference images. — [Seedance2Video blog](https://seedance2video.io/blog/ai-ugc-ads-that-dont-look-fake) [vendor] (from the search snippet; page not fetched)
- Upscaling makes the plastic look worse. A generic upscaler "made the existing artifacts bigger", giving waxy skin and halos. — [HackerNoon, Frank Houbre, Aug 2026](https://hackernoon.com/how-to-upscale-ai-generated-video-without-making-the-artifacts-worse)

### Inferences
- **Order to check a render in** (pulled from the sources above; there is no measured ranking): (1) mouth and lip-sync, plus voice, in the first 1–3 s; (2) eyes: blinking, eye contact, micro-expressions; (3) skin texture and sheen; (4) gesture loops and the head snapping back to center; (5) light and framing: a "set" look; (6) the product label: legible and the same every frame; (7) hands and fingers whenever they touch the product; (8) the face staying the same across cuts.
- Detection rates are near chance and the complaint is "feels off", so viewers are reacting to a pile of small cues, not one artifact. The fix has to be a pipeline (prompt, curate, edit, texture, audio), not a single filter.
- The CHI 2025 finding on curation supports generating several takes and picking the most natural one, rather than "fixing" a bad take in post.

### Gaps
- I found no controlled study that ranks specific tells (hands, teeth, eyes, hair edges, lighting) by how often viewers notice them in **video ads**. The rankings above are practitioner opinion.
- **Hair edges** (halo or shimmer where hair meets background) and **teeth that morph during speech** come up in practitioner talk, but I found no 2025–2026 source with specifics.
- I found nothing on what platform **ad reviewers** (Meta or TikTok human review) look for.
- An Ipsos/Syracuse University study (May 2026) reportedly found only 13% of viewers were confident an AI ad was AI, with a similar share of false positives on human-made ads. It surfaced in a search summary, but I could not find the primary page, so it is unverified.

---

## Q2. Visual fixes: production and post-production, with parameters, plus what NOT to do

### Takeaway
The consensus 2026 recipe has three stages. **(a) Prompt for a phone, not a film set:** name the camera (front iPhone camera at arm's length), use one-directional window light with slight underexposure, a lived-in messy room, an off-center subject, exactly one physical flaw, and drop "cinematic/4K/professional". **(b) Curate and edit like UGC:** short shots, B-roll cutaways over the talking head, captions re-timed to the voice, several different faces. **(c) Add texture, don't add resolution:** grade first, then subtle temporal grain, then a slight soften, delivered at 1080×1920 with phone-level bitrate. Upscaling to crisp 4K and heavy sharpening make AI footage look *more* fake. Every texture effect should sit below conscious notice.

### Cited Findings
**Prompting for imperfection (production):**
- Drop studio defaults ("professional lighting", "cinematic", "4K") and name the camera instead, e.g. *"Front camera of an iPhone, held at arm's length, slight handheld shake."* Use negative prompts for "studio lighting" and "smooth motion". Prompt for "natural pauses and uneven motion, never 'smooth' or 'professional'." — [HighQualityUGC](https://highqualityugc.com/blog/why-ai-ugc-ads-look-fake) [vendor]
- Lighting: "available indoor light from one direction with slight underexposure"; a slightly blown-out window is fine. — [HighQualityUGC](https://highqualityugc.com/blog/why-ai-ugc-ads-look-fake) [vendor]
- Setting: a messy, real room with clutter, laundry, cables or an open cupboard. Framing: handheld selfie angle, subject off-center, product coming in from below the frame; break symmetry with a partly cropped head. — [HighQualityUGC](https://highqualityugc.com/blog/why-ai-ugc-ads-look-fake) [vendor]
- **"One flaw reads as real, five read as a filter"**: add a single imperfection such as visible pores, a stray hair or a blown window. — [HighQualityUGC](https://highqualityugc.com/blog/why-ai-ugc-ads-look-fake) [vendor]
- Wording that goes in every prompt: "natural skin texture, pores, subtle imperfections, no AI artifacts". Camera: "slight handheld shake, imperfect framing, iPhone-style motion blur, subtle tilt, breathing movement". Light: soft window or daylight, shadows that move with the person, catchlights in the eyes. Aesthetic: slight grain, "iPhone footage" feel. Lock the face, skin tone, freckles, hair, clothes and jewelry with reference images. Collect 8–12 real UGC reference screenshots from your niche first. Spec he used: Seedance 2.0, 9:16, 15 s. — [@spwfeijen via YouMind](https://youmind.com/landing/x-viral-articles/ai-ugc-video-workflow-guide)
- One creator's Kling 3.0 test found that adding "handheld camera shake" and "wide angle lens" made output feel shot on an iPhone. This is a single anecdote. — [Alici.ai case study](https://alici.ai/formulas/media/shedoesai/41ff8030-54ef-5a54-8569-f0d5b4cbb52a-kling-3-ai-ugc-ai-video)
- Shake strength vocabulary for prompts: "drifts a few pixels / sways gently" (light), "bounces with each footstep" (medium), "lurches hard and rebounds" (heavy). Add a stop point ("settles still") so the shake doesn't run the whole clip. Generating shake in the clip is described as more natural than adding it afterwards. This came from a search summary of camera-shake guides on [Higgsfield](https://higgsfield.ai/blog/3QU3e0LGo6VHDMEQGwdGv1) / [Morphic](https://morphic.com/resources/vfx/camera-shake-effect); I didn't confirm which page has which line.
- Product and face consistency: one reference sheet per actor, used by every clip in the batch; real product photos from several angles including tight crops of the label, referenced in every generation. — [HighQualityUGC](https://highqualityugc.com/blog/why-ai-ugc-ads-look-fake) [vendor]
- Preview scenes as still images before rendering video, so a bad lighting choice costs less. — [HighQualityUGC](https://highqualityugc.com/blog/why-ai-ugc-ads-look-fake) [vendor] (search snippet)

**Resolution: don't upscale weak footage:**
- Upscaling a flawed 720p clip amplifies artifacts and soft edges. Regenerate at native 1080p instead. — [InVideo 720p vs 1080p FAQ](https://invideo.io/faq/720p-vs-1080p-for-ai-video-generation-which-should-you/) [vendor]. Note that other InVideo pages recommend upscaling with Topaz Astra, a vendor pitch that contradicts this.
- Test hooks at 480p, re-render only the winners at 1080p, and "Do not upscale all variants". — [VidAU](https://www.vidau.ai/make-ai-generated-ugc-ads-look-authentic/) [vendor]
- Generic upscalers treat AI edge-sharpening as real detail and reinforce it, and they "sharpen the smoothness" of skin. "AI footage doesn't fail soft. It fails *plastic*, and a plastic failure gets more plastic the harder you push it." If you must upscale: Topaz Proteus with Sharpen down, Dehalo up, Denoise low, Recover Detail conservative, or Astra "Precise" mode; upscale **before** grading. — [HackerNoon, Houbre, Aug 2026](https://hackernoon.com/how-to-upscale-ai-generated-video-without-making-the-artifacts-worse) (author has affiliate links)
- Cranking Sharpen or Recover Detail "stamps bright halos around edges and gives skin a plastic, over-defined look". — [VanceAI Topaz settings guide](https://vanceai.com/video-upscaler/topaz-video-ai-best-settings/) [competing vendor] (search snippet)

**Grain, softening, grade (post):**
- InVideo [vendor, Jul 2026]:
  - **Order:** grade first, then grain, then soften. "Lock your color before you touch texture."
  - **Grain:** film-grain filter at **2–3%** in Resolve or Premiere, or a grain overlay at 20–40% opacity. For the UGC/phone look, **30–40% opacity in Soft Light, no halation**; Overlay mode is punchier and more "cinematic".
  - **Soften:** a final **0.3–0.8 px Gaussian blur**, or light diffusion. Add motion blur only where movement looks "stutter-sharp".
  - **Warning:** "if you can see grain consciously, it's too much."

  — [InVideo FAQ](https://invideo.io/faq/does-adding-film-grain-and-blur-to-ai-generated-video/)
- RenderIO [vendor, sells an FFmpeg API, Feb 2026] FFmpeg recipe:
  - **Grain:** `noise=alls=15:allf=t` (strength 10–25, start at 10; the `t` flag changes the grain every frame).
  - **Colour:** `eq=brightness=0.02:contrast=1.05:saturation=0.95,hue=h=2`.
  - **Lens:** `lenscorrection=k1=0.02:k2=0.01` (keep k1 and k2 between 0.01 and 0.03).
  - **Motion blur:** `tblend=all_mode=average`, or `minterpolate=fps=24:mi_mode=blend`.
  - **"Compression artifacts":** encode once at `-crf 28 -preset fast`, then re-encode at `-crf 18`.
  - **Combined chain:** `noise=alls=12:allf=t, eq=brightness=0.01:contrast=1.03:saturation=0.97, hue=h=1.5, lenscorrection=k1=0.015:k2=0.005, unsharp=3:3:0.5`, then `-c:v libx264 -crf 20 -preset medium -c:a aac -b:a 128k`.
  - **Per-platform grain:** TikTok 18 (sat 0.93, contrast 1.06, hue 3, unsharp 0.6); Reels 12 (sat 0.96, no lens); Shorts 9; LinkedIn 6.
  - **Warnings:** "Too much grain on an already-smooth AI video looks like you ran it through a filter"; "If you can see the effect on a casual scroll, it's too strong"; grain makes files 15–25% bigger; platform re-encoding softens your work, so go "slightly stronger than you think".
  - **Detectors:** it states plainly that these filters target human viewers and do **not** fool trained AI detectors.

  — [RenderIO](https://renderio.dev/blogs/make-ai-video-look-natural/)
- In FFmpeg, `alls` puts colour into the noise. For luma-only, film-like grain, use `c0s` (noise on the luma plane only). Combining the `t` and `u` flags is recommended. — [zayne.io FFmpeg vintage filters](https://zayne.io/articles/vintage-camera-filters-with-ffmpeg); syntax confirmed in [FFmpeg filter docs](https://ffmpeg.org/ffmpeg-filters.html) (`noise=alls=20:allf=t+u` example)
- Nova Pixel [agency, Jul 2026] one-liner: `ffmpeg -i input.mp4 -vf "noise=alls=10:allf=t+u, setpts=1.02*PTS" -af "atempo=0.98" output.mp4`. It is described as "10% noise" plus a 2% slow-down "to create a subtle frame drop feel", with audio slowed to match. Also: "If it looks like a bad effect it will feel fake… Test on colleagues first." — [Nova Pixel](https://novapixeldev.com/blog/how-to-make-ai-ugc-ads-that-convert-2026-authenticity-playbook)
- Colour direction: phone footage is flatter than AI defaults, so mute saturation. — [HighQualityUGC](https://highqualityugc.com/blog/why-ai-ugc-ads-look-fake). This **conflicts** with @spwfeijen's "warm iPhone-style colour grade" — [YouMind](https://youmind.com/landing/x-viral-articles/ai-ugc-video-workflow-guide).
- CapCut/Filmora polish, about 2 minutes: "extra subtle camera shake and film grain", a warm grade, text overlays, trending sound. No amounts given. — [@spwfeijen via YouMind](https://youmind.com/landing/x-viral-articles/ai-ugc-video-workflow-guide)

**Phone-like delivery specs:**
- iPhone default video setting: "1080p HD at 30fps (default resolution): 60MB per minute". — [TechRadar](https://www.techradar.com/how-to/how-to-shoot-4k-video-on-your-iphone); similar about 60 MB/min in [iCulture](https://www.iculture.nl/tips/framerate-iphone-videos/). A CLRN page gives about 130 MB/min, probably the "Most Compatible" H.264 setting, but it is unreliable.
- TikTok ads: 9:16, 1080×1920 recommended (720×1280 floor in one guide, 540×960 in another); bitrate floor about 516 kbps; one guide recommends **6–8 Mbps at 1080p, H.264 + AAC**; 500 MB cap. Meta Reels: 1080×1920, MP4/MOV, AAC stereo ≥128 kbps, "minimum 30 fps" per one guide. All third-party, the sources conflict, and the official specs should be checked. — [JoinBrands](https://joinbrands.com/blog/tiktok-ad-specifications/), [Wyzowl](https://wyzowl.com/social-media-video-specs/), [SaveMyLeads Meta Reels](https://savemyleads.com/blog/other/meta-reels-ads-specs) (search snippets)
- Generator frame rates: Veo 3.1 outputs **24 fps** (two third-party sources). Sora 2 outputs 24 fps (one source says it can be refined to 30). Kling 3.0 lists 30/60 fps. — [Atlas Cloud comparison](https://www.atlascloud.ai/blog/guides/seedance-vs-kling-vs-sora-vs-veo), [Pasquale Pillitteri Kling 3.0 guide](https://pasqualepillitteri.it/tr/news/2358/kling-ai-3-0-tam-rehber-kuaishou-video-uretici) (secondary)

**Editing structure:**
- Lay B-roll of the product in use over the talking head, which hides glitches and adds proof. Script and voice "move conversion more than pixels do." — [Lumigen](https://lumigen.app/blog/ai-avatar-ugc-ads-2026/) [vendor]
- Split the ad into separate jobs (hook, proof shots, CTA) rather than one long talking-head clip. — [Seedance2Video](https://seedance2video.io/blog/ai-ugc-ads-that-dont-look-fake) [vendor] (search snippet)
- Treat AI output as raw footage that still needs editing and caption work. — [Sellable](https://sellable.pro/blog/mistakes-that-make-ai-ugc-ads-look-fake) [vendor] (search snippet)
- Re-time captions to the spoken audio and burn them in. Captions that track the voiceover look deliberate; captions on their own timing look auto-generated. — [Riffkit](https://riffkit.ai/blog/why-ai-ugc-ads-look-fake) [vendor]
- Rotate **3 to 5 different avatars and voice clones** so the same face doesn't repeat in a feed. — [Nova Pixel](https://novapixeldev.com/blog/how-to-make-ai-ugc-ads-that-convert-2026-authenticity-playbook)
- @spwfeijen mentions natural jump cuts for pacing, without numbers. — [YouMind](https://youmind.com/landing/x-viral-articles/ai-ugc-video-workflow-guide)

**What NOT to do (sourced):**
- Don't upscale weak generations or all variants; regenerate natively instead — [InVideo](https://invideo.io/faq/720p-vs-1080p-for-ai-video-generation-which-should-you/), [VidAU](https://www.vidau.ai/make-ai-generated-ugc-ads-look-authentic/).
- Don't push Sharpen or Recover Detail, which produce halos and plastic skin — [HackerNoon](https://hackernoon.com/how-to-upscale-ai-generated-video-without-making-the-artifacts-worse).
- Don't prompt "cinematic", "4K", "professional lighting" or "smooth" — [HighQualityUGC](https://highqualityugc.com/blog/why-ai-ugc-ads-look-fake).
- Don't stack flaws (five reads as a filter) — [HighQualityUGC](https://highqualityugc.com/blog/why-ai-ugc-ads-look-fake).
- Don't use grain you can consciously see, or grain on footage that is already grainy — [InVideo](https://invideo.io/faq/does-adding-film-grain-and-blur-to-ai-generated-video/), [RenderIO](https://renderio.dev/blogs/make-ai-video-look-natural/).
- Don't expect grain or blur to fix hands or motion; regenerate those shots — [InVideo](https://invideo.io/faq/does-adding-film-grain-and-blur-to-ai-generated-video/).
- Don't reuse one face for every variation — [Nova Pixel](https://novapixeldev.com/blog/how-to-make-ai-ugc-ads-that-convert-2026-authenticity-playbook).

### Inferences
- **Phone-matched bitrate (my calculation):** 60 MB/min ≈ 8 Mbps, which is about what an iPhone's default 1080p30 HEVC recording carries. TikTok's re-encode will compress further anyway. A sensible master is therefore **1080×1920, H.264 (High), about 8–12 Mbps or CRF 18–20, AAC 128–192 kbps**. Simulated "phone compression" should be mild: RenderIO's one-generation CRF 28 → CRF 18 pass is the strongest any source suggests. Over-compressing on purpose and then letting the platform compress again risks blocky macroblocks that read as "bad upload", not "phone".
- **Starting chain for the app** (merges the sources; to be tuned by eye on a phone screen at feed size). The steps run in this order:
  1. Generate at native 1080p, or 720p if you must, and **downscale** to 1080×1920, never upscale.
  2. Grade: saturation 0.93–0.97, contrast 1.02–1.06, small warm or cool hue shift.
  3. Light lens distortion: k1 0.01–0.02, optional.
  4. Temporal luma grain: FFmpeg `noise=c0s=8..15:allf=t` or `alls` 10–18, or 2–3% film grain in an NLE.
  5. Optional 0.3–0.5 px soften instead of RenderIO's `unsharp`.
  6. Encode: libx264 CRF 18–20, AAC 128k+.
- **Sharpen vs soften conflict:** RenderIO ends with `unsharp=3:3:0.3–0.6`, while InVideo ends with a 0.3–0.8 px blur. For generators that already ship over-sharp (InVideo names Seedance 2.0), the soften step fits the plastic-skin complaint better. For soft generations, a light unsharp may be justified. Decide per model and per shot.
- **Frame rate conflict:** phones default to 30 fps and one Meta Reels guide asks for at least 30 fps, but Veo 3.1 and Sora 2 output 24 fps, and RenderIO even suggests resampling *to* 24. Converting 24 → 30 by duplicating frames adds judder, and motion interpolation can add warping. Generating at 30 fps where the model allows (Kling 3.0 lists 30/60) avoids the question. Otherwise leaving 24 fps alone is probably safer than a bad conversion. This is my reasoning, not a sourced test.
- **Shake:** prompt-generated shake ("slight handheld shake… settles") is preferred over shake added in post. A shake added afterwards is a 2D transform, so foreground and background move together, which is less physically right. If added in post, keep it small and low-frequency, and scale in slightly (about 3–5%) so the frame edges stay hidden. These numbers are my estimate, not sourced.
- Short shots plus B-roll cutaways do double duty: they add UGC rhythm, and they cap how long a viewer can study any one AI face. That limits gesture loops, lip-sync drift and face drift.

### Gaps
- I found no source with a tested **vignette** amount, **auto white-balance drift** recipe, or **HDR/phone tone-mapping** look for AI UGC.
- I found no exact After Effects `wiggle()` or CapCut "shake" values shared by creators for UGC (searched; none found).
- There is no controlled test that 24 vs 30 fps changes how real AI UGC looks to viewers.
- RenderIO's per-platform grain numbers, InVideo's 2–3% grain and Nova Pixel's "10% noise" are each one vendor's suggestion. No independent comparison was found.
- Reddit (r/aivideo, r/editors, r/VideoEditing, r/FacebookAds) threads did not surface in search, so community-shared settings from there are missing.

---

## Q3. Audio tells and their fixes

### Takeaway
The audio tells are flat, evenly paced, breathless TTS that sounds "studio clean". Add scripts with perfect grammar and no fillers, music masking the voice, and lip-sync drift (about 50 ms is noticeable). The fixes:
- **Voice:** anchor it to a **real human recording** (voice reference, speech-to-speech, or upload your own read).
- **Script:** write conversationally, with contractions, fragments and fillers.
- **Breaths:** add them with audio tags or short breath samples.
- **Mix:** duck the music under the voice.
- **Phone processing:** high-pass around 80–150 Hz, tame the 2–4 kHz harshness, roll off the extreme highs, and lay a very quiet room-tone bed under the voice.
- **Restraint:** over-processing makes voices sound "papery" or metallic.

### Cited Findings
- Robotic voice = flat delivery, even pacing, no breath, music mixed over the voice. Fix: natural rhythm and emphasis, and "duck the music under the voice". Scripts: "Real people don't talk in flawless, grammatically complete sentences". Use contractions, fragments and occasional fillers. — [Riffkit](https://riffkit.ai/blog/why-ai-ugc-ads-look-fake) [vendor]
- Lip-sync: drift of about **50 ms** "is enough to register as wrong". Keep mouth, beat changes and captions on one timeline. — [Riffkit](https://riffkit.ai/blog/why-ai-ugc-ads-look-fake). Related advice: fix the audio first, then match mouth motion to a clean track — [Creatide](https://creatide.ai/blog/why-ai-ugc-ads-look-fake-and-how-to-fix-them) [vendor] (search snippet).
- "Use a real voice reference so pacing and emphasis carry across every clip". Anchor the voice to a real sample rather than a fresh synthetic read per clip. Write short beats with natural pauses. — [HighQualityUGC](https://highqualityugc.com/blog/why-ai-ugc-ads-look-fake) [vendor]
- Speech-to-speech: speak the script into a mic, and the AI "mimics your speech pattern using a selected professional voice", keeping your tone and pacing. — [Icon/AdGPT help: Speech to Speech](https://help.icon.com/articles/4136243376-speech-to-speech) [vendor]. Avatar tools also let you switch from a typed script to "Upload audio" with your own recording. HeyGen claims a voice clone from 15 s of audio; Fish Audio claims 10 s. — [HeyGen](https://www.heygen.com/tool/ai-talking-avatar), [Fish Audio](https://fish.audio/ai-avatar-generator/) [vendor claims]
- Breaths and reactions in TTS: ElevenLabs Eleven v3 supports audio tags such as **[sighs]**, **[exhales]** and [clears throat] for breathing and reactions. — [ElevenLabs help](https://elevenlabs.io/docs/help-center/product/core-capabilities/text-to-speech/can-you-make-voices-produce-the-sound-of-breathing), [Eleven v3 blog](https://elevenlabs.io/blog/eleven-v3). v3 "requires more prompt engineering" than earlier models — [ElevenLabs blog](https://elevenlabs.io/blog/eleven-v3). A tag only bends delivery as far as the voice's range allows; lower stability if tags are ignored; five tags in one bracket confuse the output. — [Runware v3 audio-tag guide](https://runware.ai/docs/models/elevenlabs-v3/guides/directing-with-audio-tags). (Runware says v3 is deprecated as of 18 Jun 2026; check the current ElevenLabs model list.)
- Narration tuning: ElevenLabs stability "55-65% for natural narration". Add "very short, quiet breath samples before long sentences". SSML pauses `<break time="500ms"/>` between topics and `<break time="1s"/>` before a new section. Cut the "piercing mid-high frequencies (2kHz–4kHz)" slightly. Soft-knee compression. Process in 100–150-word chunks. — [DEV Community, "Why your AI voiceovers sound robotic"](https://dev.to/ezinne_anne/why-your-ai-voiceovers-sounds-robotic-and-how-to-fix-them-4ga3)
- **Room tone:** "Layer a very subtle white noise or office ambience track at **-50db to -60db** under your voiceover." — [DEV Community](https://dev.to/ezinne_anne/why-your-ai-voiceovers-sounds-robotic-and-how-to-fix-them-4ga3). This conflicts with a UGC forum post suggesting about **-35 dB** of faint AC hum or ceiling-fan noise — [BlackHatWorld "AI - voices" thread](https://www.blackhatworld.com/seo/ai-voices.1841480/) (gray-hat marketing forum; seen via search snippet only, the fetch was blocked). Neither source says whether these are dBFS or dB relative to the voice.
- **Phone-mic EQ:**
  - **High-pass:** start at **80 Hz with a 24 dB/oct slope**, about **100 Hz** for female voices. — [Music Guy Mixing](https://www.musicguymixing.com/eq-for-voice-over/)
  - **UGC forum version:** cut "everything below **150hz**" and roll off highs "above **7khz or 8khz** to kill that crisp studio condenser mic sound". — [BlackHatWorld thread](https://www.blackhatworld.com/seo/ai-voices.1841480/) (search snippet; low-quality source)
  - **Telephone effect (too strong for a selfie video):** the full effect band-limits to **350 Hz – 3.4 kHz**, the old phone-line range. — [SpeechGen telephone effect](https://speechgen.io/en/effect/telephone/)
- Re-amping: play the audio through a speaker and **re-record it on a real phone mic** to get authentic room acoustics. It works but scales poorly. — [BlackHatWorld thread](https://www.blackhatworld.com/seo/ai-voices.1841480/) (search snippet)
- Over-processing warning: if the voice "starts sounding papery, metallic, or oddly detached from the space, the processing has gone too far." — [LALAL.AI echo-removal blog](https://www.lalal.ai/blog/echo-removal-how-to-fix-roomy-voice-recordings/) [vendor] (search snippet)
- Native-audio generators: @spwfeijen says MakeUGC's native audio (Seedance 2.0) handles lip-sync, pauses, breathing, fillers ("um", "like") and occasional laughs, then adds a trending sound in CapCut. — [YouMind](https://youmind.com/landing/x-viral-articles/ai-ugc-video-workflow-guide)

### Inferences
- **Starting audio chain** (merges the sources; tune by ear on a phone speaker). The steps run in this order:
  1. Voice from a real human read: your own recording, speech-to-speech, or a clone referenced to a real read.
  2. Script with contractions, fragments, 1–2 fillers per 15 s, and breaths via [exhales]/[sighs] or breath samples.
  3. High-pass at 80–120 Hz (up to 150 Hz for a thin phone-mic feel).
  4. Gentle 2–4 kHz cut of 1–3 dB if harsh.
  5. Low-pass or shelf above about 8–12 kHz.
  6. Soft-knee compression around 2:1–3:1 (ratio not sourced).
  7. A room-tone or ambience bed just audible on headphones, around -50 to -40 dB below the voice peak.
  8. Music ducked under the speech.
  9. Leave a few tens of milliseconds of natural pause variance. Don't time-quantize.
- The full 350 Hz–3.4 kHz telephone band suits a "phone call" gag, not a selfie video: a phone's camera mic records full-band audio. The UGC look is "small mic in a real room" (lo-fi, roomy, slightly boxy), not "telephone line". This is my reasoning from the sources' context.
- Lip-sync below about 50 ms of offset only holds if the audio is final **before** the mouth is generated or re-synced. Editing audio after lip-sync (cutting fillers, changing pace) reintroduces drift.

### Gaps
- I found no source with tested compression ratios, LUFS targets for UGC ads, or de-essing values.
- I found no comparison of speech-to-speech services on how human the result sounds.
- There is no controlled evidence on whether filler words or breaths measurably improve ad performance; everything is practitioner opinion.
- Small timing offsets as a humanizing trick (beyond natural pauses) had no specific source.

---

## Q4. Platform side: do Meta and TikTok detect or label AI content, and how should disclosure be handled?

### Takeaway
**Meta** puts an "AI info" label on ads made with its own gen-AI tools; when those tools add a **photorealistic human**, the label sits next to "Sponsored". From 1 June 2026 Meta also says it auto-detects third-party AI through "industry-standard signals" and moves labels into an "About this ad" panel. Mandatory self-disclosure in Meta's own pages is confirmed only for political and social-issue ads. **TikTok** makes an AI-generated content disclaimer **mandatory** for ads that are fully AI-generated or significantly AI-modified (a text label at the bottom of in-feed ads), rejects or restricts undisclosed ones, and bans AI depictions of celebrities, doctors and public figures promoting products in TikTok Shop even when labelled.

**Outside the platforms:**
- The FTC allows AI avatars but forbids fake or false testimonials.
- EU AI Act Art. 50 deployer deepfake disclosure has applied since 2 Aug 2026.

C2PA metadata usually doesn't survive re-encoding, but Google's SynthID watermark is designed to. In practice: disclose with the platform toggle, and never rely on, or try to engineer, non-detection.

### Cited Findings
**Meta:**
- Feb 2025: ads "created or significantly edited with our generative AI creative features" get an AI info label in the three-dot menu or next to "Sponsored". "When these tools result in the inclusion of an AI-generated photorealistic human, the label will appear next to the Sponsored label (not behind the three-dot menu)." No label if the in-house tools didn't significantly edit and added no photorealistic human. — [Meta Newsroom, Feb 2025 (updated Jun 2026)](https://about.fb.com/news/2025/02/gen-ai-transparency-metas-ads-products/)
- Update dated 1 June 2026: AI info labels move into a new "About this ad" panel in every ad's three-dot menu, and Meta "will begin automatically detecting ads created or edited using third-party AI tools through industry-standard signals". It doesn't name C2PA or IPTC. "This experience may vary in certain regions due to legal requirements." — [Meta Newsroom](https://about.fb.com/news/2025/02/gen-ai-transparency-metas-ads-products/)
- Minor changes such as resizing or colour correction typically don't trigger a label. — [Meta Help Center: AI-generated images in ads](https://www.meta.com/help/artificial-intelligence/355108217670024/) (search snippet)
- Self-disclosure of AI is required for **social issue, election and political** ads. — [Meta SIEP ad policy](https://transparency.meta.com/policies/ad-standards/SIEP-advertising/SIEP)
- Third-party sources **conflict** on whether commercial advertisers must self-disclose photorealistic AI video on Meta. One says manual disclosure is required for AI video and audio, including virtual influencers; another says it's compulsory only for political ads. — summarized in [Cinerads](https://www.cinerads.com/blog/ai-ad-disclosure-requirements), [ClipSpeed](https://www.clipspeed.ai/blog/ai-generated-video-disclosure-rules.html). Nova Pixel claims Meta offers a "created with AI" toggle and that "Meta ad policy has exemptions for AI generated content as long as you label it". — [Nova Pixel](https://novapixeldev.com/blog/how-to-make-ai-ugc-ads-that-convert-2026-authenticity-playbook). Meta's own newsroom page makes no statement about advertiser self-disclosure for commercial ads.

**TikTok:**
- Ads Manager "Mandatory disclaimers" cover "AI-generated, synthetic, or manipulated media": "images, video, or audio that are completely AI-generated" or real material "significantly modified by AI". The disclaimer "adds a textual disclosure label indicating that the ad includes AI-generated content" at the bottom of in-feed ads (page last updated Sept 2025). — [TikTok Ads Help: About ad disclaimers](https://ads.tiktok.com/help/article/about-ad-disclaimers-in-tiktok-ads-manager)
- Per search snippets of TikTok and third-party pages:
  - The toggle reads "This ad contains AI-generated content".
  - It is locked after submission unless the media changes, and duplicated campaigns reset it.
  - Undisclosed AI content is rejected or restricted.
  - Insignificant edits (lighting or colour adjustments, background changes, noise reduction) are exempt.
  - Spark Ads follow the organic Community Guidelines AIGC rules instead.
  - Symphony Creative Studio output is labelled automatically.

  — [TikTok Ads Help](https://ads.tiktok.com/help/article/add-disclaimers-to-ads), [Moveas](https://moveas.app/blog/tiktok-ads-ai-generated-content-label/), [Pixo](https://pixo.video/blog/tiktok-ai-label-compliance-guide)
- TikTok's organic policy: TikTok "may automatically apply the 'AI-generated' label to content we identify as completely generated or significantly edited with AI… when a creator… uploads AI-generated content that has Content Credentials attached." — quoted in [ClipSpeed](https://www.clipspeed.ai/blog/ai-generated-video-disclosure-rules.html); TikTok page: [AI-generated content](https://www.tiktok.com/tns-inapp/pages/ai-generated-content)
- TikTok Shop: content portraying a **celebrity, medical professional, political or public figure** to promote a product is prohibited **even if properly labelled as AIGC**. — [TikTok Shop Seller University: AI-Generated Content Restrictions](https://seller-us.tiktok.com/university/essay?knowledge_id=491489038501663&lang=en) (search snippet)
- Disclosure and enforcement are separate systems; harmful AI content stays restricted even when labelled. — [TikTok Ads blog: Creative integrity in the age of gen AI](https://ads.tiktok.com/business/en-US/blog/creative-integrity-generative-ai) / [AI Safety Essentials PDF](https://ads.tiktok.com/business/library/AI_Safety_Essentials_for_Advertisers_on_TikTok.pdf) (search snippet)

**Provenance and watermarks:**
- SynthID embeds an imperceptible watermark in each frame of AI video (Veo) and is designed to stay detectable after cropping, filters, colour changes, **frame-rate changes** and lossy compression. — [Google DeepMind SynthID](https://deepmind.google/technologies/synthid/)
- C2PA manifests are usually lost on re-encoding, because most transcoders strip container metadata. — [C2PA Viewer article](https://c2paviewer.com/articles/verify-ai-generated-image-c2pa-synthid) (search snippet)
- RenderIO's own recipe includes `-map_metadata -1` (strip metadata), and its article says the realism filters do **not** fool trained AI detectors. — [RenderIO](https://renderio.dev/blogs/make-ai-video-look-natural/)

**FTC (US):**
- Consumer Reviews and Testimonials Rule (16 CFR 465):
  - "The rule has no blanket prohibition on the use of AI-generated avatars in marketing."
  - AI "stock avatars" are not giving "consumer reviews", but an avatar's message "might be considered a 'testimonial'", which is prohibited "only if the underlying testimonials were fake or false."
  - "The use of avatars could also be deceptive in violation of the FTC Act."
  - A celebrity avatar without permission violates the rule.
  - Actors portraying testimonialists "could be deceptive", unless it's an "obviously fictional dramatization".

  — [FTC Q&A](https://www.ftc.gov/business-guidance/resources/consumer-reviews-testimonials-rule-questions-answers)
- The rule covers reviews that misrepresent that the author exists or used the product (final rule, Aug 2024). — [FTC press release](https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials). In Dec 2025 the FTC sent warning letters to 10 companies, citing penalties of up to $53,088 per violation. — [FTC press release Dec 2025](https://www.ftc.gov/news-events/news/press-releases/2025/12/ftc-warns-10-companies-about-possible-violations-agencys-new-consumer-review-rule)

**EU AI Act:**
- Art. 50 transparency duties apply from **2 Aug 2026**. The Digital Omnibus (Reg. (EU) 2026/1744, in force 27 Jul 2026) delayed high-risk deadlines but **not** the deployer deepfake-disclosure duty (Art. 50(4)). The only grace period covers providers' machine-readable marking (Art. 50(2)), until 2 Dec 2026 for systems already on the market. A marketing team publishing an AI-generated video of a person is a "deployer" that must disclose. Commission Art. 50 guidelines came out on 20 Jul 2026; the code of practice on AI-content transparency was finalised on 10 Jun 2026. — [Legalithm](https://www.legalithm.com/en/blog/eu-ai-act-what-applies-2-august-2026), [ActuIA](https://www.actuia.com/en/news/ai-act-obligations-in-force-and-delays-under-omnibus-2026-1744/), [Technology.org](https://www.technology.org/2026/10/13/eu-ai-act-deadlines-after-the-digital-omnibus-what-applies-from-december-2026-to-august-2028/) (compliance blogs, not the Official Journal)

**Agency practice:**
- Agency and vendor guides tell advertisers to always use the built-in labelling tool, and warn that "Meta and TikTok can restrict accounts that do not label AI content." — [Nova Pixel](https://novapixeldev.com/blog/how-to-make-ai-ugc-ads-that-convert-2026-authenticity-playbook). Platform disclosure rules were still described as "evolving" in mid-2026. — [Oakgen](https://oakgen.ai/blog/realistic-ai-ugc-ads-checklist) (search snippet)
- 74% of US consumers think brands should disclose AI use in ads. — [Cint](https://www.globenewswire.com/news-release/2026/10/20/3384820/0/en/cint-report-finds-74-of-u-s-consumers-believe-brands-should-disclose-ai-use-in-advertising.html)

### Inferences
- The realism pipeline (re-encode, grade, grain) will very likely drop C2PA as a side effect. On TikTok, that **moves the duty onto the advertiser**: the mandatory toggle must be set by hand, because auto-labelling can no longer be relied on. SynthID-marked footage (Veo) can still be detected after processing, so "it was re-encoded" won't explain away a missing disclosure. The app should **turn on the AI disclosure by default** when exporting for TikTok, and should *not* include a metadata-stripping step aimed at avoiding labels.
- "Realistic-looking" and "disclosed" are compatible goals. The point of removing tells is that the ad doesn't feel cheap or spammy; it isn't hiding the AI. Cint's 46% who dislike AI people in ads suggests a disclosed ad with good craft is the defensible position.
- **Testimonial framing is the legal risk point.** An AI person saying "I've used this for three months and my skin cleared up" is a testimonial that no real customer gave. Under the FTC rule and Act that is risky, and it's prohibited if the claim isn't true of real users. Safer patterns: the AI presenter **demonstrates** or **explains** the product, or voices claims that are substantiated and attributed to real customers. Never imitate a real person or an expert (doctor) without permission; TikTok Shop forbids AI doctors and celebrities outright.
- For EU audiences, a photorealistic AI person in an ad plausibly falls within Art. 50(4)'s "deepfake" scope, so on-ad disclosure is the safe default. This needs legal confirmation; see the gap below.

### Gaps
- I couldn't confirm from a Meta primary source whether **commercial** (non-political) advertisers must self-disclose photorealistic third-party AI video, or whether a self-disclosure toggle for commercial ads exists in Ads Manager. Third-party sources conflict.
- Meta hasn't publicly named which "industry-standard signals" it reads (C2PA, IPTC, invisible watermarks such as SynthID) for its June 2026 third-party detection, or how well that detection works on video.
- I didn't read the full TikTok "synthetic and manipulated media" ads policy page; parts of the toggle behaviour come from third-party guides.
- I didn't re-fetch the AI Act definition of "deepfake" (Art. 3(60): content that "resembles existing persons, objects, places… and would falsely appear… to be authentic") here. Whether an entirely fictional AI person counts needs legal reading of the Commission's 20 Jul 2026 Art. 50 guidelines.
- The FTC Rytr order was reportedly reopened and set aside after the 2025 AI Action Plan (per an FTC listing seen in search). Its current status wasn't verified, but the Consumer Reviews Rule itself stands.
- Whether Sora 2 or Kling embed C2PA or invisible watermarks in video output wasn't confirmed.
