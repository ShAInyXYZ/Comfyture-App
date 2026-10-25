# Audit, 25 October 2026

For the people working on Comfyture: what was measured, what changed, and what is left, ranked by value.

Measured on this machine with a headless Chromium at 1600×950, every page opened fresh: the app's home, Kitchen's five rooms
(Story, Stage, Shot, Cut, Library), Mixer, Jam, Macaron, Spice, Toaster and Utensils, on an empty data folder (what a new user gets).

## In one look

| | Before | After tonight |
|---|---|---|
| Opening any page, first visit | **~30 MB**, ~730 requests | **0.4–3.9 MB**, 89–188 requests (gzip, then 25 October afternoon: the Stage, its models and each product's code only when needed) |
| Opening it again | **~30 MB** every time (no validators, `no-cache`) | **0.3 MB** (304s, the models kept a day) |
| Page errors on the 12 pages | 0 | 0 |
| Buttons and links with no name in the browser's own tree, images with no `alt`, fields with no label | 3 / 0 / 0 | 0 / 0 / 0 |
| Texts under 4.5:1 on the 13 first views | **161** | **0** |
| Dialogs, tours and menus by keyboard (62 checks) | 43 pass | **62 pass** |
| Unit tests | 414 of 417 | **418 of 418** |
| Unlicensed IP in the code (the image guides' examples) | 10 files | 0 |

## Weight and speed

**What changed** ([server/media.ts](../server/media.ts)): every static file carries an `ETag` and `Last-Modified`, and a browser's copy that
is still the file gets a 304 with no body; the Stage's models (`/models/`) are kept a day; code, styles, data and models go gzipped,
compressed once and kept in memory (96 MB at most). Tested by [tests/send-file.test.ts](../tests/send-file.test.ts).

| Page | First visit (wire) | Again |
|---|---|---|
| Mixer | 9.0 MB | 0.3 MB |
| Toaster | 8.5 MB | 0.3 MB |
| Spice | 9.4 MB | 0.3 MB |

**25 October afternoon: the Stage and the products load when needed.** Headless Chromium at 1600×950, a fresh profile per page, the
median of three runs, no page errors; before is the commit before the change, after is it with the two steps:

| Page | Wire MB | Requests | 3D models | JS modules | Stylesheets | First draw, ms | First draw on a slow link (40 ms, 20 Mbit) |
|---|---|---|---|---|---|---|---|
| Home | 10.8 → 2.9 | 759 → 110 | 399 → 0 | 228 → 52 | 51 → 8 | 134 → 62 | 2275 → 661 |
| Kitchen | 9.6 → 1.7 | 737 → 93 | 399 → 0 | 228 → 54 | 51 → 8 | 156 → 103 | 2281 → 680 |
| Story | 9.7 → 1.8 | 735 → 90 | 399 → 0 | 228 → 53 | 51 → 8 | 130 → 60 | 2251 → 655 |
| Stage | 8.3 → 2.9 | 751 → 171 | 399 → 22 | 228 → 70 | 51 → 8 | 365 → 260 | 2627 → 1091 |
| Shot | 10.6 → 2.7 | 752 → 108 | 399 → 0 | 228 → 52 | 51 → 8 | 137 → 85 | 2286 → 661 |
| Cut | 10.3 → 1.6 | 751 → 114 | 399 → 0 | 228 → 55 | 51 → 10 | 135 → 65 | 2252 → 736 |
| Library | 11.4 → 0.4 | 727 → 89 | 399 → 0 | 228 → 52 | 51 → 8 | 144 → 66 | 2262 → 651 |
| Mixer | 8.8 → 1.0 | 744 → 105 | 399 → 0 | 228 → 59 | 51 → 9 | 147 → 82 | 2289 → 806 |
| Jam | 12.7 → 3.9 | 750 → 148 | 399 → 0 | 228 → 80 | 51 → 17 | 222 → 293 | 2354 → 1651 |
| Macaron | 9.4 → 1.8 | 754 → 172 | 399 → 0 | 228 → 104 | 51 → 18 | 120 → 135 | 2261 → 1528 |
| Spice | 10.0 → 2.2 | 738 → 141 | 399 → 0 | 228 → 82 | 51 → 20 | 119 → 131 | 2249 → 1313 |
| Toaster | 8.5 → 1.3 | 741 → 129 | 399 → 13 | 231 → 73 | 51 → 10 | 144 → 61 | 2257 → 759 |
| Utensils | 11.0 → 3.4 | 761 → 188 | 399 → 0 | 228 → 110 | 51 → 21 | 174 → 182 | 2284 → 1408 |

What is left on the wire is pictures (the home's 2.35 MB, Utensils' 2.66), Spice's footage and Jam's audio. On the machine itself Jam
draws ~70 ms later than before (a second round of modules, three.js in its deck); on a slow link every page draws 0.6–1.7 s sooner.
`tests/weight.browser.mjs` keeps it so (42 checks).

**Was heavy, in order of what it saved:**

1. ✅ **The Stage loaded every model in the background, on every page** (about 400 GLB files: 375 props, 8 bodies, 6 animals, 10 hand props;
   22 MB raw, ~6 MB gzipped). [app.js](../web/js/app.js) mounts the Stage when the browser is idle so the assistants and outside agents
   (the comfyture-control MCP) can stage a scene from anywhere, and [control/models.js](../web/js/control/models.js) `loadModels()` loads
   the whole manifest at once. Fix: load a piece's model when a scene uses it or the library draws it (the Stage already draws a built
   stand-in until a model arrives), and mount the Stage on demand, with a small listener on `api/control/events` that mounts it on an
   agent's first command. Done: a model loads when a scene or a library draws its piece, and the Stage mounts when something needs it
   (its room, a thumbnail, the Oven, Toaster's library, the Kitchen tour, an outside agent's first command, which is handed over and
   answered); a page that shows no 3D fetches 0 of the 399 models, the Stage room 22, Toaster 13.
2. ✅ **Every product's code and styles loaded on every page**: 226 ES modules (4.7 MB, 1.5 MB gzipped) and 51 stylesheets (1 MB)
   whatever the product open. Done: each product's modules and stylesheets load on its first visit (`web/js/sheets.js` lists each
   page's sheets; the shared bar takes each pet from `web/js/surfaces.js` instead of importing every product). A product that borrows
   another's classes must list that sheet in `STYLES`.
3. **Pictures**: ✅ done the same day. Comfy Cloud's template previews are animations of up to 4 MB (171 of them, 222 MB); a grid now
   shows each one's first frame, cut out of the WebP's container by the server (no decoding, 4.4 MB for all 171), and plays the
   animation when its card is pointed at or focused. The home's storefront went from 7.1 MB of pictures to 0.5 MB, Utensils' tiles
   from 2.9 MB to 0.16 MB.

## Errors

None on any of the 12 pages. One request is aborted on a first visit (`trend-toc-toc-dance.mp4`, a video preload cut short when the page
moves on): harmless. (That video belonged to Jam's Toc Toc showcase, retired later that day.)

## Accessibility

Checked on the same pages (the first view of each, 1600×950, a new data folder), plus the account window, a tour card and the Oven, with
a headless Chromium, axe-core 4.13 and real key presses. **Colour** is read off the pixels: each text's colour laid over what it really
sits on (gradients and see-through layers included), against 4.5:1, or 3:1 for large text; text over a picture is set apart as "needs a
look". **Keyboard**: Tab from the top of each page, every stop named by the browser's own accessibility tree, its ring compared focused
and not; then Enter, arrows, Tab and Esc on the account window, the tours, the Oven, a select, the windows of Spice, Macaron and Jam,
and Utensils' Library. **Reading order** is that same tree: a screen reader itself was not run.

| | Before | After |
|---|---|---|
| Texts under 4.5:1, first views of the 13 pages | **161** | **0** |
| ...in the account window / the Oven / the tours' cards | 9 / 6 / 0 | 0 / 0 / 0 |
| axe colour contrast, whole pages / keys hovered | 183 / 35 | 0 / 0 |
| Tab stops with no name in the browser's tree | 19 | 0 |
| Tab stops hidden under the assistant's bar | 19 | 0 |
| Tab stops with no ring, or a ring cut to less than half | 124 | 2 |
| Dialogs, tours and menus by keyboard | 43 of 62 | **62 of 62** |
| axe findings on structure (landmarks, roles, names, headings) | 25 | 0 |

**Colour.** Nine in ten of the failures (152 of 161) were one token: `--dim`, the labels, hints, times and placeholders, `#77767e`, 3.6 to
4.3:1 on the dark surfaces. It is `#888790` now, 4.5 to 5.4:1. That is the only change that touches the look: 0.1 to 0.6% of a page's
pixels, by at most 24 levels, and text, muted and dim stay three steps. Put the old value back in [material.css](../web/css/material.css)
to take it back (the failures come back with it). The rest were places that did not use the token: placeholders and the Library's
dates (`--faint`, 2.1 to 2.6:1), its tabs' counts (65% opacity), the Oven's empty-slot label, the picked preset tile's blurb on its
tinted face, the account key in the header when hovered or open. For a look, not counted: 23 texts over pictures (the home's banner,
film covers, clip names), the Stage's first tick under its playhead, and two Macaron captions that cross the edge of the brand's yellow
panel at this height.

**Keyboard.** Every page can be walked and none traps: 1,002 Tab stops on the 13 first views, all reached, the walk ending by leaving
the page, and each page's main key (Imagine, Roll, Render the film, Read the depth, Open Kitchen…) is one of them. What was wrong:

- The assistant's bar floats over the foot of a page, and what took focus under it stayed there (Story's insert keys, Utensils' shelf):
  the page scrolls it clear now (`scroll-padding-bottom`, the bar's height).
- Rings cut by the box they sit in (the chips above every bar lost their top and bottom, so did the rooms' links, the tabs, the preset
  and media tiles, Story's scene links), and rings that were not there: the colour pickers laid invisibly over a swatch (Macaron, Jam,
  Spice, Utensils) and Macaron's picked card, which looked the same focused or not.
- Story's blocks, scene names and shot cards, and Jam's two trim handles, could only be clicked or dragged. They are keys now (Enter or
  Space picks, the caret goes to the end) and sliders (the arrows move a handle a second, Shift five).
- The home's banner turns every 8 s and held only for the pointer: it holds for the keyboard too (and does not turn with reduced motion).

**Dialogs.** The account window opened at the end of the page, where Tab never got (the page scrolled and shut it at the 25th press): the
keyboard lands in it now, Esc shuts it and the focus goes back to its key. The tours' arrows, Enter and Esc already worked; the card now
reads its words as well as its title, and the focus goes back to the compass when it ends. The Oven let Tab walk out into the dimmed page:
what is behind a window is put away (`inert`) while it is open, and the focus goes back to what opened it, by a small helper
([web/js/modal.js](../web/js/modal.js)) that Jam's windows (the focus went nowhere) and Utensils' Library (it went in, but Tab walked out
and it did not come back) use too. Spice's and Macaron's windows had no name: they are named by their title. A select now says to a screen
reader if it is open and which row the arrows are on (it is a select-only combobox).

**Reading order and landmarks.** One `main` on every page (Jam's had a second inside the first) and an `h1` (the Stage, Shot, Cut, Macaron,
Spice and Toaster had none); the cards of Shot, Cut, Macaron and Spice are headings. The five strips of tabs held a button inside their
tablist, Cut's media tabs said `aria-pressed`, Stage's two side columns had no name, Utensils' sliders had no value or held buttons: fixed.
And a name was lost: [tooltip.js](../web/js/tooltip.js) removes every `title` to make its tip, which took the only name from controls with
no text (Kitchen's Library link, Mixer's two faces); the count of 25 October had counted titles. A title with nothing else is kept as the
name now, and the lamps (saved, linked) read their tip.

**Left, most valuable first.**

1. Fields' edges are 1.0 to 1.4:1 against what is around them (the instrument panel's look); 1.4.11 asks 3:1 where the edge is what says
   "a field". They carry placeholders, and a 4.7:1 edge when focused, so it is a judgement. Proposal: a 1px edge `#6d6c74` (3.4:1 on the
   cards) on `.field`, the prompt, the search and the bar. It changes every field's look, so it is not applied.
2. ✅ Applied that evening: the lime ring over a bright picture fell to 1.2 to 2.9:1 on the keys that sit over pictures (Kitchen's
   delete ×, Try it, the Library's pick, Watch our crew's version, the takes' keys); they wear a dark halo under it when focused.
3. ✅ Applied that evening: a skip key, the first Tab stop of every page, comes into view and takes the focus to the page open (a button,
   not a link, so the router's hash is untouched); the next Tab is the page's own first key instead of 11 to 16 stops later.
4. Mouse-only work: Cut's timeline (clips, ruler, beat lane; the inspector's Start and Length cover moves), the 3D viewports of Stage and
   Toaster (their lists and keys cover most), Jam's waveform seek, the × that closes a tab, the Story bible's pictures. Esc inside a Story
   block leaves the focus on the page, not on the block.
5. The tour's lit element is not in the card's Tab order, and the tips cannot be hovered (1.4.13).

Not checked: a screen reader speaking, zoom to 200% and reflow, forced colours, and the states below each first view beyond hover and the
dialogs above.

## Tests

- Unit (`node --test tests/*.test.ts tests/*.test.mjs`): **418 of 418**. Three had failed since Comfy Cloud added 23 workflows on
  23 October: Utensils' knowledge base was rebuilt from the new catalogue and the seven now among the most used were written by hand.
- Browser (`tests/*.browser.mjs`), every one passing on the afternoon of 25 October: toaster (207 checks), spice, spice-picture,
  harnesses (146), account, oven, toaster-projects, song-cover, macaron-create, utensils-apps (27), plus the three repaired that day:
  - `jam-editor.browser.mjs` (165) follows Jam's five workspaces on our own three videos, with the songs' covers, the films in the
    Library and opening not being an edit;
  - `macaron-ui.browser.mjs` (148) follows Macaron's five workspaces (its two failing checks were stale; one real bug, the Brand kit
    3 px past a 1000-high screen, is fixed);
  - `utensils-apps.browser.mjs`: its failing check was a real bug (a book scrolled into view lost its card), fixed.
  - Five waits in harnesses and macaron-create did not wait (`waitForFunction` does not await an async check); they poll now.
  - On a loaded machine (other programs kept the load average near 13 tonight) the 3D pages draw slower under software GL; the Toaster
    test now waits for what it checks instead of a fixed moment.

## Rights and likenesses (the competition forbids unlicensed IP and likenesses)

- ✅ **Done on 25 October (D1, the owner's call)**: Mixer's trend recipes shipped the trends' **original sounds**, commercial
  recordings, tracked in git (eleven `sound.m4a` and `vocals.m4a` under `web/brand/mixer/trends/*/`; their `recipe.json` said they were
  to be replaced or removed before publishing), the eight trend previews carried them as their audio, and Jam's Toc Toc and Hotel Lobby
  showcases played them. The recordings are deleted, the previews' audio track is cut (`-an -c:v copy`: the clips stay, silent, with
  the same picture), the recipes name no sound, and the two showcases are retired (an untouched copy leaves an older data folder at the
  next start, one that was worked on stays). Mixer makes a track in the trend's feel instead (ACE-Step, first, so a failure costs
  nothing else), and Jam starts a dance trend with its dance and a track to make. **Not done**: the history. The files are still in
  older commits (the paths to cover are in the blocker section of [competition/README.md](competition/README.md)), so the repo is not
  safe to make public until a rewrite, which needs the owner's go. Also still in the tree, for the owner: the look
  frames, pose and depth videos and keypoints derived from the original videos (`web/brand/mixer/trends/*/`).
- The Toaster mockups of 24 October (`docs/brand/products/toaster-v2/`: `r1.txt`, `c1.txt` and `toaster-render.png`) show a character
  from JoJo's Bizarre Adventure: remove them before submitting, or keep them out of anything shown.
- Fixed tonight: the image guides' worked examples (sent to the writer with every prompt) used that character; they now use Crumpet's
  workshop. The tests that named him use our cast.
- The examples every product ships use only our cast (Ketkout, Pickle, Paprika, Brioche, Crumpet, Truffle, the cats, the otter) and our
  own outputs ([examples/README.md](../examples/README.md)).

## Security notes

- The Comfy API key never reaches the browser: the account window shows its last four characters only.
- A remote bridge gets its own token (`COMFY_PROXY_TOKEN`), never the Comfy key ([docs/guides/LOCAL-COMFYUI.md](guides/LOCAL-COMFYUI.md)).
- Static files are served from inside their folder only, and `.json` under the media mounts is refused.
- The server listens on 127.0.0.1 by default and sends no CORS headers: a hosted copy needs a reverse proxy with its own auth and a
  spending cap (see docs/competition/HOSTING.md).

## The morning after (25 October, 06:00 to 09:00)

**Fixed and pushed**, each with the check that proves it:

- **The home banner** ran its words into the product tiles (Mixer, Macaron and Spice at 1600 wide, every slide on a laptop): the
  name is the big word and its tagline a half-size line, sized by the screen's height too; measured clear from 1280×720 to 2560×1440.
- **Jam's Words page**: the style controls spilled over *Style the captions* at 1600×950, and below 820 high the styles' second row
  slid under the controls; measured clear at eight sizes from 1366×768 to 2560×1440.
- **Kitchen's first visit** featured the *Rainy bus stop* stage instead of the example film (the stages were put in after it); the
  film's references showed a garbled picture.
- **Stuck ffmpeg**: Spice's fog preview on a still never ended (two ran for 3.5 hours at full CPU); every preview, job step and bake
  now has a deadline and is killed past it, and Spice's bake keeps its whole sound (it was cut to a fifth of a second).
- **Small ones**: "Make the songnull" and four other places that wrote *null* on the page; a redraw asked for during a frame was
  lost (checked quiet on every page at rest); deleting the open story toasted "No such project"; Jam called Taro "Your photo".

**Tests**: unit 436 of 436 by the afternoon; every browser test passes (see Tests above).

**Found by the agents**: fixed later that morning, each with a check: Spice's FX reading "not baked" after a renamed layer was
read back (the test fails without the fix), a shipped example's FX reading "Baked" over a newer Light or Paint, Roto's subject
circle (`url(true)`), a shipped comp with no download, Macaron's encodes with no deadline, Jam counting a shipped video as credits
spent, a Paint spot against the frame's edge coming out magenta, Jam's edit showing only its ruler on a laptop, Jam's Words at 1180
wide and under, the Stage's examples now going in by the examples' rules (an example added later reaches an install that had the
others), the tours tidying up after themselves (a step's element brought into view, no tooltip over the card, Macaron's window and
Mixer's preview closed when a tour is left), and the header fitting all seven products at 1300 wide and under. That afternoon:
Spice's cover (Paprika before her portal, the six passes fanned beside her: no person left in the app's art), Spice's cards on a
laptop (cut in 274 of 540 views measured across 45 window sizes, in none now; `tests/spice-laptop.browser.mjs`), and a slow-motion
comp played whole in the viewer, the footage beside it at the matching rate.

**Still open**, small: FX's Look and Place cards scroll inside themselves from 886 high up (as designed); a slow-motion comp made
from a wider range whose range was later shortened is read as the shorter one's (the pass would need to record its source frames);
the woman in the raincoat is left only in old design boards (`docs/brand/products/spice-v1/`, `spice-v2/`), which nothing uses.

## Next, ranked

1. Decide the trend sounds and the Toaster mockups (above), before the submission.
2. Decide the accessibility proposals (fields' edges, the ring over pictures, a skip link: the list under Accessibility).
