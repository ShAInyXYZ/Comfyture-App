# Comfyture at #OpenSourceHiggsfield: the plan

*For Mounir first: what to decide and what to do before the deadline. Then for anyone helping with the submission.*

**Deadline: Friday 30 October 2026, 9:00 PT = 16:00 UTC = 17:00 in Paris.**
Europe left summer time on 25 October and the US leaves it on 1 November, so this week Paris is 8 hours ahead of California, not 9.
Submit on Thursday evening, Friday noon at the latest. Winners are announced on Friday 6 November.

The other pages of this folder:

- [JUDGES.md](JUDGES.md): the one page a judge reads first.
- [HOSTING.md](HOSTING.md): how judges will try it (a live link, a static demo, their own machine), with costs.
- [VIDEO.md](VIDEO.md) and [storyboard.html](storyboard.html): the 2-minute video as 13 beats with keyframes. Open the storyboard in a browser.

## In one minute

- **Enter**: Best Overall (every entry is in it), **Most Innovative** and the **VFX Built with LTX** bonus.
  Add **Open Weights Only** with the judge server run in open-weights mode (D4: the switch now blocks the partner templates too). Most Viral is optional.
- **Blocks us today**: the repo is private, and there is no live link and no video yet. The Mixer trends' original recordings
  are out of the tree (done 25 October, D1) but still in older commits until the history is rewritten (see the blocker below).
- **Ready** (25 October): the code, the MIT licence, the run-locally steps, the workflow files, examples in every product
  (Kitchen's film *The Great Jam Chase* and its stages, Toaster's three sets, Spice's six shots through every department, Jam's
  three videos on our own songs, Macaron's brands) plus Mixer's trend shelf, a guided tour per product (eight, each pet on its
  example), the Local/Cloud switch, judge mode for a hosted copy, the rebuilt website, and the storyboard with its keyframes.

## ⛔ The blocker: the trends' original recordings (out of the tree on 25 October; the history is left)

The rules say: *"All submissions must be lawful, SFW, and must not contain unlicensed IP or likenesses."*
The repo broke that, in files that were tracked and pushed (the repo is private, so nothing was ever public).

**Done on 25 October (D1, the owner's call: remove the recordings now).** The first three rows below are out of the tree: the eleven
recordings are deleted, the eight previews play silent (their audio track is cut, the picture is the same bytes), the recipes name no
sound, and Jam's Toc Toc and Hotel Lobby showcases are retired. Mixer and Jam work without them: a trend's preview plays silent;
Make it makes a track in the trend's feel with ACE-Step, as it already did for the trends without a recipe (a few credits more, in
its estimate, and the first thing it does, so a track that fails costs nothing else); Jam starts a dance trend with our version of the
dance and waits for a track, with Make a track ready in the trend's feel. **Not done: the history.** Every file is still in older
commits, so the repo cannot be made public yet (the paths a rewrite must cover are below).

| What | Where | Why it was a problem | Now |
|---|---|---|---|
| 11 original recordings: `sound.m4a` and `vocals.m4a` | `web/brand/mixer/trends/*/` (Toc Toc, Hotel Lobby, Smalltown Boy, State Property, Ramalama, Documentary, Face Dance, Black Cat Clapping) | Commercial songs and, for State Property, a private person's voice. Each trend's own `recipe.json` said: *"it is replaced or removed before the repository is published."* | ✅ deleted 25 Oct |
| 8 trend previews with that audio | `web/brand/mixer/trends/*/preview.mp4` | Our crew's version, but the original song played under it. | ✅ audio cut 25 Oct (`-an -c:v copy`) |
| Jam's Toc Toc and Hotel Lobby showcases | `examples/jam/jam-toc-toc/`, `examples/jam/jam-hotel-lobby/` | They copied the two recordings and previews above into every new install. | ✅ retired 25 Oct |
| First frames edited from the originals' frames, pose videos and keypoints | `web/brand/mixer/trends/*/look.webp`, `look-a.webp`, `look-b.webp`, `shot-*.look.webp`, `shot-2b.end.webp`, `*.pose.mp4`, `*.depth.mp4`, `*.kps.json` | Derived from other creators' videos (their frame, their motion). Lower risk than the songs, still theirs. The recipes need the pose and depth videos to make a version, and Jam's dance panel shows a pose over the dance. | ⛔ still in the tree, for you to decide |
| Source screenshots and edits made from them | `docs/brand/mixer-crew/reference-match-v2/` (its README: *"actual screenshots decoded from retrieved source-post videos"*) | Other creators' frames, in the docs. | ⛔ |
| A `ref-` collage | `docs/brand/products/macaron-v4/scenes/ref-mockups-collage.png` | Tracked although `ref-*` files are meant to stay out. | ⛔ |
| Trend names that are song titles | Smalltown Boy, Toc Toc, Ramalama, Alors on danse, La Calabaza, Closer, Sway… (`web/js/mixer-trends.js`) | A song's name on a shelf invites the question; descriptive names avoid it. | ⛔ |

**What is left to do.** Two choices, not exclusive:

1. **Remove or rename** what is still in the tree: the trends we do not need for the submission, the reference-match folder, the
   collage, the song-titled names, and (your call) the look frames, pose videos and keypoints of the trends we keep.
2. **Rewrite the history** so none of it is in any commit, then make the repo public. A new commit that deletes the files is not enough:
   a public repo serves every old commit. The rewrite (`git filter-repo --invert-paths --path …`) changes every commit id
   and needs a force-push to `origin` and `nas`, with no other session running, after a backup bundle of today's history
   (copy, check, then rewrite). **This is your call.** The alternative is a fresh public repo with one squashed commit,
   which loses the dated history that shows the work was done during the challenge.

   For the recordings, the rewrite must cover these paths (the `.m4a` files are the only audio files ever committed for a trend; the
   older versions of the previews carry the song under the picture, so they go too, and today's silent ones go back on top of the
   rewritten history in one commit):

   ```
   web/brand/mixer/trends/*/sound.m4a                         8 files
   web/brand/mixer/trends/*/vocals.m4a                        3 files (hotel-lobby, smalltown-boy, state-property)
   web/brand/mixer/trends/*/preview.mp4                       8 files, all their versions
   web/brand/mixer/trends/hotel-lobby/preview-portrait.mp4    an older cut of the Hotel Lobby preview, with the song
   ```

   Optional, tidiness only (they hold no recording, they just name them): `examples/jam/jam-toc-toc`, `examples/jam/jam-hotel-lobby`, and
   the older homes of the same showcases, `web/brand/jam/projects/jam-toc-toc`, `jam-hotel-lobby` and `jam-ramalama`.

My recommendation: do one history rewrite on Tuesday before going public, covering the paths above and, with your yes, the rest of the
table (the reference material, the derived frames and motion of the trends you do not keep, the song-titled names).
While at it, the rewrite can also drop `docs/brand/` (492 MB of design mockups the app never loads): the clone goes from about
0.7 GB to about 0.2 GB, which matters for a judge's first five minutes (D7).

## Decisions for you

**Your review, 25 October.** The tours, the website, the storyboard and these pages are approved overall ("looks nice overall"). The Spice section's videos and pictures are being redone: their effects looked pasted on. Toaster's 3D part is on hold until you say what is wrong with it (D8). The field-edge contrast change was tried and taken back at your word; the layout faults a laptop screen shows come first ([AUDIT.md](../AUDIT.md)).

| # | Decision | Recommendation |
|---|---|---|
| D1 | The recordings and derived media above | ✅ **The recordings are removed (25 Oct), as you decided.** Still yours: the derived media and the reference material (the table's last four rows), then **one history rewrite before going public** |
| D2 | Categories to tick on the Typeform | **Most Innovative + VFX Built with LTX Bonus**, plus Open Weights Only (D4 is done in the code; it needs the judge server run with the switch on) |
| D3 | The live link | **A small VPS running the app in judge mode with a Comfy Cloud key, spending capped**; the static demo as fallback ([HOSTING.md](HOSTING.md)) |
| D4 | Open weights for the judges | **Run the judge server with `COMFYTURE_OPEN_WEIGHTS=1`**, now that the switch also refuses partner templates (Bria, Beeble, Nano Banana, ElevenLabs…) on the server (done 25 Oct, commit f95e278) |
| D5 | The video | **Approve the 13 beats** in [VIDEO.md](VIDEO.md), then record on Wednesday 28 |
| D6 | Kitchen's example | ✅ **Shipped 25 Oct** (examples/kitchen/great-jam-chase): the story, three LTX-2.5 takes and the edit; Kitchen's home features it on a first visit, and *Render the film* makes the film for free |
| D7 | Repo weight | Optional: **drop `docs/brand/` from the public history** during the D1 rewrite (keep it on the NAS) |
| D8 | Toaster in the video | **The 3D part is reworked (26 Oct): objects are made real one at a time, each from its own four-view sheet, by your Trellis2 workflows (`workflows/3d/`), into a new scene.** The example ships its fourteen sheets (drawn with GPT Image, free); its models are made on the GPU (no credit) and are shipped as they finish. **For the open-weights category, re-toast the three stills with Qwen Image 2.1** (a few credits, your yes), or keep beat 4's labels out of frame ([VIDEO.md](VIDEO.md)) |
| D9 | Meringue's two takes | Our kitten, our pixels, shown muted, but made in Mixer from the Face Dance trend, so her moves follow another creator's dance. Used on the website, in the storyboard (beat 7) and in Jam's *Three Kittens*. **Keep them muted, or swap them for takes on our own moves** |
| D10 | Spice's AI edit bay | **Keep classic Spice as `#/spice`** for the submission (the website, the storyboard, the video and the Most Innovative case show it); the bay is a second door at `#/spice?bay` with its own example (*The yard at dusk*) and tour. None of its paid stages has run for real: **one run per stage on a 4-second clip, about 70 credits, all open models** (Obscura Remova for Clean, Bernini-R for Direct, FastH3 OmniRef or LTX IC-LoRA union for Control, LTX 2.5 first and last frame for Extend), your yes, before JUDGES.md sends a judge there |
| D11 | Shot's presets and samples | The 28 preset previews in Kitchen's Shot room were rolled from eight stock-looking sample photos, two of them the raincoat woman and the rooftop man you turned down for Spice. **Redraw the eight samples with our cast (Codex GPT Image, free) and roll the 28 previews again (about 670 credits, your yes)**, or leave them |

**The night of 25 to 26 October** (a supervisor session judged the app from a fresh `--depth 1` clone, no key, an empty data folder, at
1280 x 720 and 1366 x 768, and fixed what a judge would hit; each fix is its own commit):

- A first visit with no key answered every pet and *Imagine* with "fetch failed": it now says what to do, the header says *Your ComfyUI ·
  not running* in red instead of a green lamp, and a key pasted in the account window sends the renders to Comfy Cloud by itself (before,
  JUDGES.md's own instruction left a judge on an address where nothing ran).
- Laptop screens: Cut's chat bar is a row under the timeline instead of over it (the main video track is in view at 1280 x 720), Stage's 3D
  view is a quarter taller and its hint on one line, Shot's preview keys no longer sit on each other at 1366, and the header keeps every
  product's name down to 1171 px wide. *Imagine* on Kitchen's empty box takes the example idea instead of doing nothing.
- Open weights (the judges' copy): classic Spice no longer offers Beeble and Bria; their keys say why.
- All eight tours play to the end at 1280 x 720 with no page error and nothing spent, with and without judge mode and open weights.
- `deploy/judge/` holds what the live link needs (env file, systemd unit, Caddyfile, health check to your phone, daily snapshot);
  HOSTING.md's env block named three variables the server does not read.
- Jam ships eleven new songs of our own on its shelf (ACE-Step XL, 52.8 cents on Comfy Cloud, covers from GPT Image).
- Still the biggest risk for the rules: **Mixer's shelf** (D1's last rows): trend names that are song titles, and covers redrawn over
  other creators' opening frames with their motion.
- A cheap win for D7 without a rewrite: a judge's `git clone --depth 1` takes only today's files, 814 MB, and 520 MB of them are
  `docs/brand/` (mockups the app never loads); taking that folder out of the tree (kept on the NAS and in the history) makes it about 0.3 GB.

## The submission checklist

What the rules ask, checked against the repo on 25 October. The submission form is
[form.typeform.com/to/V1dSQrkS](https://form.typeform.com/to/V1dSQrkS).

| # | Item | The rule | Status | What is missing |
|---|---|---|---|---|
| 1 | No unlicensed IP or likenesses | *"lawful, SFW, and must not contain unlicensed IP or likenesses"* | ⛔ | The recordings are out of the tree (25 Oct, D1) but still in older commits: the history rewrite is what is left, with the rest of the blocker's table. Also: the judge server and the static site must never be built from your own `data/` folder (it holds the Giorno Toaster project and trend runs, and the copies of the retired showcases' recordings an older install made). |
| 2 | Public GitHub repo | *"must be public with an open-source license and setup instructions"* | ❌ private | After D1. Run a secret scanner first (a quick scan of the history for key patterns found none; `.env` was never committed). |
| 3 | Open-source licence | *"an open-source license"* | ✅ | MIT in `LICENSE` and `package.json`. |
| 4 | Setup someone else can follow | *"enough setup detail that someone else can run it on their own machine"* | ✅ | README's Quick start now says Node 22.18+ and ffmpeg up front, the clone, `npm start`, the free no-key path (every product on its examples, the tours) and links [JUDGES.md](JUDGES.md); `.env.example` is refreshed; [docs/guides/LOCAL-COMFYUI.md](../guides/LOCAL-COMFYUI.md) is the own-GPU guide (all 25 Oct). Nice to have: a short `workflows/README.md` mapping each file to the feature that runs it. |
| 5 | Workflow files | *"Your app code, workflow files…"* | ✅ | `workflows/`: the LTX-2.5 shot graphs, `image/` (the Oven's official templates), `audio/` (ACE-Step songs, music, effects), `parts/`. Nice to have: a short `workflows/README.md` mapping each file to the feature that runs it. |
| 6 | Built with ComfyUI | *"Run it however you like: entirely local, Comfy Cloud, the Developer Platform, Comfy Router, the Comfy SDK, or any mix"* | ✅ | Comfy SDK (`@comfyorg/sdk`), Comfy Cloud, Comfy Router, Comfy Cloud's MCP (the template runner), comfy-api-proxy for a local ComfyUI. |
| 7 | Demo video, 2 minutes max | *"Two minutes max, in case we can't get it running ourselves"*; Typeform: *"show us your build in action and how you built it"* | ❌ | Storyboard ready (1:55). Record after your go: the video is the last step, as you asked. |
| 8 | Other tools explained in the video | *"Any other tools, models, or techniques … must be explained in your demo video"* | 🟡 | Beat 11 names them: three.js, ffmpeg, the Blender MCP round trip, our MCP server, and that the cast art was drawn with GPT Image at development time. |
| 9 | Most Innovative | *"Demo video must explain why the submission is innovative"* | 🟡 | Beat 10 does it in 14 seconds. |
| 10 | A link to try it | *"Optional, but strongly encouraged"*; Typeform: *"Will NOT be shared publicly. Expect 5-10 runs … Feel free to rate-limit or cap spending."* | 🟡 | Judge mode is built (no key or address changes, no deletes, a pace per visitor, renders and answers capped per visitor and per day; 25 Oct). It needs a host (D3, [HOSTING.md](HOSTING.md)). |
| 11 | Social post | *"Link to your demo video on Reddit, X, IG, LI, YT, or TikTok tagging #OpenSourceHiggsfield"* | ❌ | After the video. Draft below. |
| 12 | The Typeform | name, Comfy account email, country, project name, one line (≤ 100 characters), links, parts of ComfyUI used, models, other tools, categories, "Is your stack fully open?", agreements | ❌ | Drafts below. |
| 13 | Signup | *"The first 200 signups get free credits"* ([form.typeform.com/to/Ayn9Cwfj](https://form.typeform.com/to/Ayn9Cwfj)) | ❓ | Check that you signed up. |
| 14 | One submission per person | *"One submission per person"* | ✅ | |

Done on 25 October, not required but felt by judges: Toaster's three examples, a tour for every product, Kitchen's example film
(D6), Jam's three videos on our own songs, Spice's examples through every department, and the rebuilt website.

## The categories, and the case for each

Every entry is in Best Overall. *"Each entry is eligible for both a main category and a model-provider bonus category"*,
so at most one main prize and one bonus. The Typeform lets us tick several.

| Category | The rule | Fit | Our case | Tick? |
|---|---|---|---|---|
| Best Overall ($10,000) | *"Best overall build. Every entry is automatically considered."* | Strong | The challenge asks to *"rebuild their most popular apps and more"*. Comfyture rebuilds the platform, not one app: Cinema Studio (Kitchen), the trend apps (Mixer), Marketing Studio (Macaron), music videos (Jam), and three studios of our own (Spice, Toaster, Utensils), on one engine. | Automatic |
| **Most Innovative** (RTX 5090) | *"An app that's never been done, novel custom node packs or uses of ComfyUI. Demo video must explain why…"* | Strong | 1. **Pets that act, checked**: each product's pet answers through a tool call (forced on Claude, strict JSON on the others, Gemma 4 included); every action is checked against what the page holds before anything moves, a build is one Undo, and whatever costs credits waits under the answer with its price for one yes. 2. **Toaster**: a set blocked in 3D clay becomes a picture through an image edit that keeps the clay as the layout (colour ID and depth maps, a sheet per part), then a four-view turnaround laid out for Pixal3D's multi-view template, then a GLB that goes back on the Stage as a prop. 3. **Spice**: a six-department VFX house in the browser; its FX compositor's live view is exactly what the free bake renders at full size. 4. **The Stage** makes control references: mannequins and 372 clay pieces rendered as colour ID, depth, normal, OpenPose, lines and mask passes for LTX-2.5's IC-LoRAs, open to any agent through an MCP server, with a round trip to Blender. 5. **Last frame first**: Qwen Image 2.1 paints where a shot must land, LTX-2.5 animates to it. 6. **Tours** that play a paid step for free with the example's own result. | **Yes** |
| Most Viral (RTX 5090) | *"Delightful to use and made to be shared."* | Medium | The pets and the cast are the delight; Mixer makes trend formats with your cast; Kitchen cuts a 9:16 clip to post. Mixer is also where the IP blocker sits, and judging "viral" may lean on the social post's reach. | Optional |
| Open Weights Only (RTX 5090) | *"No partner nodes or closed-source APIs, open-weights models only."* | Good | Every picture, video and sound model is open weights by default: LTX-2.5, Qwen Image 2.1, ACE-Step 1.5, Stable Audio 3 small, SAM3, Depth Anything 3, VOID, FILM, Demucs, Whisper, BiRefNet, SeedVR2, Pixal3D. Gemma 4 writes and answers when picked. `COMFYTURE_OPEN_WEIGHTS=1` keeps the partner writers, artists and video models out. With the switch on, the partner templates are refused on the server (fixed 25 Oct) and the writers and pets are Gemma 4 only (llm.ts offers no Router model then). With the switch on, the Typeform's *"Is your stack fully open?"* can honestly be Yes. | **Yes, after D4** |
| **VFX Built with LTX** ($2,000) | *"LTX must be the core video model in the workflow to qualify."* | Strong | LTX-2.5 is the video model in every product: Kitchen's shots, VFX presets (Set on Fire, Portal, Disintegrate, Thunder God…) and transforms, picture and sound in one pass; Spice's AI layers on a clip and its clean-ups (LTX-2.3 LoRA templates for object, logo and subtitle removal); Jam's lip-synced performances; Mixer's swaps; Utensils' add-a-sound and extend. Partner video models are opt-in and off in open-weights mode. | **Yes** |
| Built with FLUX ($1,000 / $500 / $250) | *"FLUX 3 must be the core model in the workflow to qualify."* | Weak | FLUX 3 Klein is one artist among five; Qwen Image 2.1 is the default. | No |
| Built with MiniMax H3 ($1,000) | *"MiniMax H3 must be the core model in the workflow to qualify."* | Weak | MiniMax H3 is one opt-in choice on the Video picker. | No |

## Timeline, 25 → 30 October

| Day | What gets done | Who |
|---|---|---|
| **Sun 25** (today) | Read these pages and decide D1 to D7. Tonight's work lands: examples, tours, pets' chips, Local/Cloud switch, website. ~~Start the IP sweep: replace or remove the trend media (D1), and fix Jam's two showcases~~ (the recordings, the previews' sound and Jam's two showcases done 25 Oct; the rest of the sweep and the history rewrite stay). Ship Kitchen's example film (D6). | You decide, agents do |
| **Mon 26** | ~~The open-weights switch also blocks partner templates.~~ (done 25 Oct) Judge mode in the server: ~~no key changes, no deletes, rate limits, with tests~~ (done 25 Oct, server/judge.ts); the spend cap still to do. ~~README: prerequisites, the free path, a link to JUDGES.md~~ (done 25 Oct); `.env.example` refreshed. If entering Open Weights Only: try each pet on Gemma 4 a few times (GPU time only, ask first). | Agents |
| **Tue 27** | Backup bundle, history rewrite, force-push, **make the repo public**. Static demo on GitHub Pages. Judge server up (VPS, HTTPS, password, capped key). The 5-minute path tried on a clean machine with no key. Re-capture the keyframes marked RE-CAPTURE. | You (rewrite, keys, money), agents |
| **Wed 28** | **Record the video** after your go: screen captures of each beat, your voice, an ACE-Step music bed, captions, 1:55. (The SF Build Night is that evening: optional, not needed.) | You + agents |
| **Thu 29** | Publish the video and the social post (#OpenSourceHiggsfield). Freeze `main`, tag the submission, pin the judge server to the tag, top up its budget. **Fill and send the Typeform in the evening.** | You |
| **Fri 30** | Buffer until noon Paris. Hard deadline 17:00 Paris. Then keep the judge server up and watched until the winners on 6 November. | You |

## Risks, and how we cover them

| Risk | Cover |
|---|---|
| Other creators' media in the public history | D1 before going public; one rewrite; a sweep of every tracked media file we did not make. |
| A key or token in the history | Secret scan before going public; the judge key lives only in the server's env file, never in the page or the static site. |
| Judges spend more than planned | Judge mode caps runs per visitor and per day and stops at a total; a separate key with only a small balance on it; open weights only (no partner prices); alerts to your phone through ntfy. |
| The live link is down when a judge clicks | The static demo is always up, JUDGES.md has the 5-minute local path, and the video covers the rest. A health check pings you. |
| Pets answer badly on Gemma 4 | The tours need no model. Test before ticking Open Weights Only; if weak, keep GPT-6 Luna for the pets and do not tick it. |
| The video runs over 2:00 or says too much | 1:55 storyboard with word budgets; cut Utensils and Macaron first if a take runs long. |
| Many sessions committing until the last minute | Freeze `main` on Thursday; the judge server and the Typeform point at a tag. |
| A slow first clone (0.7 GB) | `git clone --depth 1` in JUDGES.md; D7 trims it further. |
| Old Node on a judge's machine | Node 22.18+ is required (the server runs TypeScript directly): said first in JUDGES.md. |
| Time zones | 17:00 Paris on Friday; submit Thursday evening. |

## Drafts for the Typeform

- **Project name**: Comfyture
- **One line** (96 characters): *An open-source Higgsfield: seven AI studios with pet helpers, open weights, LTX-2.5 at the core.*
- **Links**: the repo (public), the video, the live link (its password goes in the last field), the social post.
- **Parts of ComfyUI used**: Comfy API, Comfy Router, Comfy SDK, Comfy MCP (Comfy Cloud's MCP runs the official templates).
- **Generative models**: LTX-2.5 (with the Ingredients, union-control and pixel-upscaler IC-LoRAs, its spatial and temporal upscalers), LTX-2.3 clean-up LoRAs, Qwen Image 2.1 and Turbo, Qwen Image Edit, FLUX 3 Klein, Krea 2 Turbo, Z-Image Turbo, ACE-Step 1.5, Stable Audio 3 small, Gemma 4, SAM3, Depth Anything 3, VOID, FILM, Demucs, Whisper, BiRefNet, 4x-UltraSharp, SeedVR2, Pixal3D. Opt-in partners, off in open-weights mode: Claude, GPT-6 and Gemini as writers; GPT Image, Nano Banana, FLUX.2/FLUX 3, Seedream, Qwen Image 3.0, Kling, Luma and Runway as artists; Veo 3.1, Kling 3, Seedance 2.5, MiniMax H3, Wan 3.0 and Runway for video.
- **Other tools or techniques** (it feeds Most Innovative): a Node server with no framework and a plain-JS interface with no build step; three.js for the Stage and Toaster; ffmpeg for Cut's renders, Spice's bakes and the free effects; the beat read in the browser; the pets' checked tool calls; an MCP server that lets any agent block a scene (`scripts/control-mcp.ts`) and a round trip to Blender through the official Blender MCP; examples and tours; built with Claude Code and Codex; the cast drawn with GPT Image at development time.
- **Categories**: Most Innovative, VFX Built with LTX Bonus, and Open Weights Only (the judge server in open-weights mode).
- **Is your stack fully open?** Yes, if the judge server runs with `COMFYTURE_OPEN_WEIGHTS=1` and the template gate has landed. Otherwise No.
- **Anything else**: the live link's user and password; that partner models are opt-in and off on the live link; where to start (JUDGES.md).

## Draft social post

> Comfyture: an open-source Higgsfield, built on ComfyUI. Seven studios (a film kitchen, trends, music videos, brand content,
> a VFX house, clay-to-3D, one-job tools), each with a pet that does the work and asks before it spends.
> Open weights by default, LTX-2.5 makes picture and sound in one pass. MIT. Video ↓ · repo: github.com/ShAInyXYZ/Comfyture
> #OpenSourceHiggsfield @ComfyUI

Post it on X with the video, and on r/comfyui and LinkedIn with the YouTube link.

## Sources

- Rules, prizes and timeline: [comfy.org/open-source-higgsfield](https://comfy.org/open-source-higgsfield) (its "App requirements" and "Prepare your submission" texts are quoted above as the page ships them).
- Announcement: [blog.comfy.org/p/higgsfield-promised-to-open-source](https://blog.comfy.org/p/higgsfield-promised-to-open-source).
- The submission form's questions: [form.typeform.com/to/V1dSQrkS](https://form.typeform.com/to/V1dSQrkS), read on 25 October.
