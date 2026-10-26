# The 2-minute demo video

*For Mounir to review and approve (D5 in [the plan](README.md)), then for whoever records it. The keyframes are laid out in
[storyboard.html](storyboard.html): open it in a browser.*

**The rules.** *"Two minutes max, in case we can't get it running ourselves."* The form adds: *"show us your build in action and how
you built it"*. *"Any other tools, models, or techniques … must be explained in your demo video"*, and for Most Innovative the
*"demo video must explain why the submission is innovative"*. *"We're judging the work, not your video editing or quality."*

**The shape.** 13 beats, **1:55** (5 seconds of margin): a 5-second hook, the promise, the seven products at their best moment,
why it is new, how it is built (open weights, LTX-2.5 at the core), how to run it, the call to action. About 215 spoken words,
under 2 words a second, so it never feels rushed. Captions burned in, for judges who watch muted.

**Not yet**: nothing is recorded. You asked that the video be the last step; record after your go (Wednesday 28 in the plan).

## The beats

| # | Time | Beat | On screen | Voice-over | On-screen text | Into the next |
|---|---|---|---|---|---|---|
| 1 | 0:00–0:05 | **Hook** | Ketkout's take 1A full screen, with its own LTX-2.5 sound: the chick lifts the last jar, it slips, *"Oh no, not the last jar!"* | (from 0:02.5) *"Made in one open-source app."* | MADE IN ONE OPEN-SOURCE APP · picture and sound: LTX-2.5 | Hard cut on the jar's thump |
| 2 | 0:05–0:13 | **The promise** | Home: the banner turns through the products; the pointer runs along the seven tiles. | *"This is Comfyture, an open-source Higgsfield: seven studios on one engine, built on the Comfy Developer Platform."* | COMFYTURE · 7 studios · 1 engine · MIT | The Kitchen tile zooms in |
| 3 | 0:13–0:27 | **Kitchen** · Ketkout | Four rooms, 3.5 s each, on *The Great Jam Chase*: Story (the bible and the storyboard), Stage (*Morning kitchen*, clay, then key 2: colour ID), Shot (take 1A, its filmstrip and waveform), Cut (the edit, then the film plays). | *"Kitchen writes the story from one sentence, blocks it on a 3D stage, rolls each shot with LTX-2.5, picture and sound together, and cuts the film."* | KITCHEN · story → stage → shot → cut | The header switches to Toaster |
| 4 | 0:27–0:39 | **Toaster** · Crumpet | Crumpet's bar: *"a cosy reading corner…"*; the clay set builds itself, each action ticked; the Render page (clay frame, colour ID, depth); *Toast it*; the render; then the 3D page: one object's four-view sheet, its model turning, and the new scene where the models stand. | *"In Toaster, Crumpet builds a set in clay from one sentence. Toast it into a picture, then into a real 3D model."* | TOASTER · clay → render → 3D model | The model spins out |
| 5 | 0:39–0:51 | **Spice** · Paprika | *Truffle's Jam Heist*: in SH010, the yard, the wipe slides from the market by day to Day to night's dusk, the chain under it (Plate → Inpaint → Day to night → In-outpainting → Sound); a cut to SH040, *1958*, Colorization's wipe from grey to colour; SH020, the lookout, cut out on green by SAM3. | *"Spice is a VFX suite with AI as the engine: every tool a Comfy Cloud workflow, every pass kept with its clip."* | SPICE · plate → inpaint → day to night → outpaint → sound | The wipe carries into Jam |
| 6 | 0:51–1:01 | **Jam** · Pickle | *Moonlit Oolong Walk* (our ACE-Step song): the track plays, its sections and beat grid light up; then the otter sings it, lip-synced, with its own sound (no voice-over over her). | (0:51–0:57) *"Jam turns a song into a music video. The beat is read right in your browser."* | JAM · song → beat → lip-sync | Cut on a beat |
| 7 | 1:01–1:09 | **Mixer** · Praline | The trend shelf; a role swapped to Meringue; Meringue's take, muted under the music bed. **Depends on D1.** | *"Mixer remakes a trend with your cast: the crew, your pet, or you."* | MIXER · a trend, your cast | Vertical swipe, like a feed |
| 8 | 1:09–1:15 | **Macaron** · Brioche | The Comfyture brand kit (palette, logos, rules), then posts in 1:1, 4:5 and 9:16. | *"Macaron keeps a brand's kit and makes its posts on brand."* | MACARON · brand kit → posts | The header switches |
| 9 | 1:15–1:21 | **Utensils** · Truffle | Truffle's shelf; the Library of official workflows scrolls. | *"Utensils shelves one-job tools and all the official ComfyUI workflows."* | UTENSILS · one job each · 691 official workflows | Cut to black |
| 10 | 1:21–1:35 | **What's new, and why** | Three hard cuts: Crumpet's answer with its ticked actions and *Toast it · price · Not now*; the Stage's clay turning into colour ID, depth and pose; Spice's chain, a pass wiped against the clip it ran on. | *"What's new? Each pet acts through checked tool calls and never spends without your yes. Clay becomes control maps. And Spice keeps every pass beside the clip it ran on."* | PETS ACT THROUGH CHECKED TOOL CALLS · NOTHING PAID WITHOUT A YES / CLAY → CONTROL MAPS / EVERY TOOL A WORKFLOW · EVERY PASS KEPT WITH ITS CLIP | The diagram builds |
| 11 | 1:35–1:45 | **How it's built** | A diagram: browser → Comfyture server → Comfy SDK → Comfy Cloud, or comfy-api-proxy → your ComfyUI; Comfy Router and Comfy Cloud's MCP beside it. The model wall. The account panel: *Open weights only · On*. | *"Built on the Comfy SDK, Cloud and Router. Open weights by default, with LTX-2.5 making picture and sound in one pass."* | OPEN WEIGHTS BY DEFAULT · LTX-2.5 AT THE CORE / also: three.js · ffmpeg · Blender MCP · built with Claude Code and Codex · cast drawn with GPT Image | A terminal types |
| 12 | 1:45–1:51 | **Run it yourself** | A terminal: `git clone`, `npm install`, `npm start`; the app opens; the compass starts Crumpet's tour (*"nothing is spent"*); the account panel's **Comfy Cloud / Your ComfyUI** switch. | *"Clone it, and every example runs free. Add a key, or your own GPU."* | git clone … · npm install · npm start | The tour card slides away |
| 13 | 1:51–1:55 | **Call to action** | The end card: the wordmark, the seven pets, the repo, the hashtag. | *"Comfyture. Open source. Come cook."* | github.com/ShAInyXYZ/Comfyture · #OpenSourceHiggsfield | Fade out |

## What each beat proves (for the judges' categories)

- **Most Innovative**: beats 4, 5 and 10 (checked tool calls, clay → control maps → render → 3D, Spice's chain of
  Comfy Cloud workflows, each pass kept with its clip). Beat 10 is the *"explain why it is innovative"* the rule asks for.
- **VFX Built with LTX**: beats 1, 3, 5 and 6 say LTX-2.5 out loud and show it as the core video model; beat 11 repeats it.
- **Open Weights Only**: beat 11 shows the switch on and the model wall; nothing in the video uses a partner model.
- **"How you built it"** and **"other tools"**: beat 11 (the platform, three.js, ffmpeg, Blender MCP, Claude Code and Codex, GPT Image
  for the cast art).

## Keyframes, and what must be re-captured

The keyframes in [`keyframes/`](keyframes/) were captured on 25 October in a headless browser, on a lab server with a fresh data
folder, no key and a dead render address: no credit was spent. Frames of our cast's real outputs were grabbed with ffmpeg.

| Keyframe | Beat | Note |
|---|---|---|
| `k01-hook-ketkout` | 1 | Real output: Ketkout's take 1A (LTX-2.5), at 2.9 s. |
| `k02-home` | 2 | The home's banner and its seven tiles (cropped above the Comfy Cloud templates row). |
| `k03` to `k06` | 3 | *The Great Jam Chase*, Kitchen's shipped example (D6), on a fresh install: Story, the Stage's *Morning kitchen* in colour ID, take 1A in Shot, the edit in Cut. Re-captured 25 October. **RE-CAPTURE `k06`** (and check `k02`): since 26 October Cut's chat bar is a row under the timeline, the edit's shot 1B is its storyboard frame (its take was black for 2.4 s), and the header keeps the products' names on a laptop. |
| `k07-film-ketkout` | 3 | Real output: take 1D. |
| `k08-toaster-build` | 4 | **Staged**: Crumpet's answer was written by hand (no model called), in a new draft beside the example; the app built the scene from it as from a real answer. With no key, *Toast it* reads "GPU time". |
| `k09-toaster-render`, `k23-toaster-clay-to-render` | 4 | Toaster's shipped example *Crumpet's workbench*: its Render page, and its clay frame beside the finished still. The stills were drawn with GPT Image (free, through Codex) and the page labels them so: for the open-weights category, re-toast them with Qwen Image 2.1 (a few credits, **your yes**) or keep the labels out of frame. **No turnaround or 3D model exists yet**, and the 3D part is **on hold since 25 October**: the owner said it is wrong and will explain. Until then beat 4 ends on the render, and the voice-over drops "then into a real 3D model". |
| `k10-spice-yard`, `k11-spice-1958`, `k22-spice-cutout` | 5, 10 | Spice's shipped *Truffle's Jam Heist* on a fresh install, captured 26 October after the rebuild: SH010's Day to night wipe with its chain and the tool shelf, SH040's Colorization wipe, SH020 cut out on green by SAM3. Every pass shown is a real run. |
| `k12-jam-track`, `k13-jam-band` | 6 | *Moonlit Oolong Walk*, Jam's shipped example (our ACE-Step song, Taro the otter), on a fresh install: the track and the band. The Toc Toc and Hotel Lobby showcases, which played commercial recordings, were retired on 25 October (D1): Jam ships only our three. |
| `k14-jam-otter` | 6 | Real output: the otter singing *Moonlit Oolong Walk* (lip-sync, LTX-2.5). |
| `k15-mixer-shelf` | 7 | **Depends on D1**: the shelf shows song-titled trends. |
| `k16-mixer-meringue` | 7 | Real output: Meringue's two Face Dance takes. **Their sound is the Face Dance trend's song: always muted**; the music bed plays instead. |
| `k17-macaron` | 8 | The brand kit. Re-capture the Content workspace (posts in three formats) if there is time. |
| `k18-utensils` | 9 | Truffle's home. |
| `k19-checked-actions` | 10 | **Staged** answer, as above. |
| `k20-open-weights-local` | 11, 12 | The account panel with *Open weights only · On* and the new Comfy Cloud / Your ComfyUI switch. |
| `k21-tour` | 12 | Crumpet's tour on his example, step 11 of 13: *Toast it, for free*. Every product has its tour now; any can stand in. |

Beats 11, 12 and 13 also use cards drawn in the storyboard itself (the diagram, the terminal, the end card).

## Recording notes

- **What to record with.** An agent can film each beat headless (Playwright's `recordVideo` at 1920×1080) on a lab server, as the
  keyframes were; the 3D pages may stutter on a software GPU, so beats 3 and 4 may be better filmed by you on your machine (OBS),
  on a separate data folder.
- **No new spending.** Every result shown already exists: the takes, the film, the songs, the examples' passes, and the tour's free
  playback of *Toast it*. The one exception is beat 4's render, turnaround and 3D model, which come from Toaster's example.
- **Sound.** Your voice (or an open text-to-speech model) for the voice-over; a music bed made with ACE-Step 1.5 (our own, never a
  licensed track), ducked under the voice; the chick's and the otter's own LTX-2.5 sound where marked. Meringue's takes always muted.
- **Never on screen**: the Giorno project or anything from `data/toasts`; the Toc Toc and Hotel Lobby showcases (retired 25 October, but an older data folder may still hold them: film on a fresh one); any trend's original
  sound; real people; the account panel with a key in it or the header's balance.
- **Export**: H.264, 1080p, 1:55, captions burned in. Upload to YouTube (public or unlisted) and link it from the social post and
  the form.
