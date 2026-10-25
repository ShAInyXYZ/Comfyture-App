# Audit, 25 October 2026

For the people working on Comfyture: what was measured, what changed, and what is left, ranked by value.

Measured on this machine with a headless Chromium at 1600×950, every page opened fresh: the app's home, Kitchen's five rooms
(Story, Stage, Shot, Cut, Library), Mixer, Jam, Macaron, Spice, Toaster and Utensils, on an empty data folder (what a new user gets).

## In one look

| | Before | After tonight |
|---|---|---|
| Opening any page, first visit | **~30 MB**, ~730 requests | **~9 MB**, same requests (gzip) |
| Opening it again | **~30 MB** every time (no validators, `no-cache`) | **0.3 MB** (304s, the models kept a day) |
| Page errors on the 12 pages | 0 | 0 |
| Buttons and links with no name, images with no `alt`, fields with no label | 0 / 0 / 0 | 0 / 0 / 0 |
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

**What is still heavy**, in order of what it would save:

1. **The Stage loads every model in the background, on every page** (about 400 GLB files: 375 props, 8 bodies, 6 animals, 10 hand props;
   22 MB raw, ~6 MB gzipped). [app.js](../web/js/app.js) mounts the Stage when the browser is idle so the assistants and outside agents
   (the comfyture-control MCP) can stage a scene from anywhere, and [control/models.js](../web/js/control/models.js) `loadModels()` loads
   the whole manifest at once. Fix: load a piece's model when a scene uses it or the library draws it (the Stage already draws a built
   stand-in until a model arrives), and mount the Stage on demand, with a small listener on `api/control/events` that mounts it on an
   agent's first command. Effort M, risk M (the Stage, Toaster's library and the control MCP all read `MODELS`).
2. **Every product's code and styles load on every page**: 226 ES modules (4.7 MB, 1.5 MB gzipped) and 51 stylesheets (1 MB) whatever
   the product open. Fix: load each product's panel and CSS when its route is first shown (`import()` per product in app.js, `<link>`
   added on first visit). Effort M, risk M.
3. **Pictures**: Utensils' template thumbnails are up to 1.9 MB each (they are Comfy Cloud's own previews). A resized copy cached by the
   server would save ~8 MB on Utensils' home. Effort S.

## Errors

None on any of the 12 pages. One request is aborted on a first visit (`trend-toc-toc-dance.mp4`, a video preload cut short when the page
moves on): harmless.

## Accessibility

Every visible button and link has a name (text, `aria-label`, `title` or a tooltip), every image an `alt`, every field a label or a
placeholder, on each page's first view. Not checked tonight: colour contrast, keyboard-only paths through each product, and a screen
reader's reading order. The tours (web/js/tour.js) are keyboard-driven (arrows, Enter, Esc) and announce themselves as dialogs.

## Tests

- Unit (`node --test tests/*.test.ts tests/*.test.mjs`): **418 of 418**. Three had failed since Comfy Cloud added 23 workflows on
  23 October: Utensils' knowledge base was rebuilt from the new catalogue and the seven now among the most used were written by hand.
- Browser (`tests/*.browser.mjs`): toaster, spice, spice-picture, harnesses, account, oven, toaster-projects pass.
  - `jam-editor.browser.mjs` was written for Jam's first layout; the track and words pages were redesigned on 21 October. Tonight its
    first check follows the new cards; from its windows section on (line 112, about 480 lines) it still targets the old grid and needs
    a rewrite (effort M).
  - `macaron-ui.browser.mjs`: two checks of Brioche's tools per workspace fail, as they did before tonight (stale against Macaron's
    panel, to be looked at).
  - On a loaded machine (other programs kept the load average near 13 tonight) the 3D pages draw slower under software GL; the Toaster
    test now waits for what it checks instead of a fixed moment.

## Rights and likenesses (the competition forbids unlicensed IP and likenesses)

- **Blocker, for the owner to decide**: Mixer's trend recipes ship the trends' **original sounds**, commercial recordings, tracked in
  git (`web/brand/mixer/trends/*/sound.m4a`; their `recipe.json` says they are to be replaced or removed before publishing), and Jam's
  Toc Toc and Hotel Lobby showcases play them. Replace them with ACE-Step originals or remove them; taking them out of the published
  history needs a history rewrite.
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

## Next, ranked

1. Decide the trend sounds and the Toaster mockups (above), before the submission.
2. Load the Stage's models per piece and mount the Stage on demand (saves ~6 MB gzipped on every first visit).
3. Load each product's code and styles on its first visit.
4. Rewrite `jam-editor.browser.mjs` from its windows section on, and look at the two Macaron checks.
5. Contrast and keyboard-path checks on each product.
