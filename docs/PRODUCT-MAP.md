# Comfyture product map: six products on one engine

Goal plan for the session building the app platform. Everything below is built from the components Kitchen already has, so each new product is mostly a new screen, not a new engine.

## The idea in one paragraph

Higgsfield names its products with a Japanese theme (Katana, Cinema Studio, Marketing Studio). Comfyture names its products from the kitchen, the world of confiture. What the app does today is cooking, so it becomes **Kitchen: where we cook**. Around it come other products for other people, each with its own name and its own home screen. All of them run on the same server, the same workflows (LTX-2.5 and the rest) and the same take log, and each is built from Kitchen's components.

**Where the app is today.** Home already has the Kitchen's front door: a prompt bar with Imagine and Make the film, @-tagged references (pictures or videos pasted or dropped anywhere, up to eight), a writer picker (Sonnet 5.5) and an artist picker (Qwen 2.1), a New project button and a grid of projects. A project is one film at a time, and every section keeps to the open project.

**Built so far (2026-10-19).** Every product has a first version on its own screen, designed first as a GPT Image mockup (`docs/brand/products/`): the app's home presents all six, the header switches between them, and Kitchen's rooms sit on a second bar. Mixer remixes an edit shot by shot with your cast (split at its cuts, frames redrawn, motion copied, cut on its sound). Jam listens to a track on Comfy Cloud (Demucs vocals, Whisper words with their times, the beat), cuts on the beat, and performs, dances and captions it. Macaron has the brand kit, products, sixteen templates and the brand guard (palette). Utensils has ten tools. Spice (added 2026-10-23) runs a shot through six VFX departments. Recipes, Pantry and Delivery are not built yet.

**Models: LTX-2.5 first, anything pickable.** LTX-2.5 in ComfyUI is the priority and the default for video: open weights, cheapest (about $1 per minute of clips) and the one that makes picture and sound together. The Video picker can still choose a partner model through Comfy Router (Veo 3.1 and Veo 3.1 Fast, Kling 3, Seedance 2.5, MiniMax H3, Wan 3.0, Runway), each showing its price for a 5-second shot, and the artist picker likewise mixes open-weights and partner image models. A partner result is kept as an ordinary take. Every product below defaults to LTX-2.5 and lets the user pick another model when it matters.

**Kitchen's home is today's Home screen** (the "What's your film about?" prompt and the project grid). Kitchen stays the most advanced and most controllable product, for serious director projects. Every other product gets its own home in the same way.

| Product | For whom | One line |
|---|---|---|
| **Kitchen** | Power users | The full-control studio that exists today: Story, Stage, Shot, Cut, Library, the Oven, the assistant. Nothing is removed. |
| **Mixer** | Casual users, trend followers | Higgsfield's Katana equivalent. Quick, viral-style videos and edits with one command: pick a trend, add your face, photo or clips, and get the result, following trend presets. LTX with references and face/character swap. |
| **Jam** | Musicians, dancers, TikTok creators | Music-video generation with captions and subtitles. Use a dance video as the reference to make your own music avatar, or recreate a TikTok cover with edits. Starts from a track. |
| **Macaron** | Brands, studios, social teams | Higgsfield's Marketing Studio equivalent, with a real brand kit: "turn any product into ready-to-post content". Product videos, product photoshoots with studio references, UGC-style videos, TikTok and ad creatives, posters, marketplace visuals and motion graphics, all consistent with the brand. |
| **Utensils** | Anyone with one small job | No Higgsfield equivalent: just a shelf of tools put together. Upscale, remove background, create variations, extend a clip, add sound, lip-sync, captions. Each is one Kitchen component in its own frame. |

**Brigade** (teams, roles, approval) is not a product. It becomes a project setting later, first in Mixer, then in Macaron.

## Shared layers (proposed by the planning session, not part of the original brief: keep, cut or change)

Everything below is a suggestion for how to build the products faster. The product list above is the brief.

1. **Pantry** — a user's reusable ingredients: faces and characters, products, places, voices, styles, brand kits. A face added once works in Kitchen, Mixer, Jam and Macaron. Today's story bible (`@tags`) and the Library are its seeds.
2. **Recipes** — one saved-recipe format: a preset plus the inputs it asks for (a face, a photo, a line of text, a track), its settings and an example result. Extends `preset.json`. Mixer's trends, Macaron's templates and Jam's styles are all recipes at different levels of polish. Kitchen gets a **Save as recipe** action.
3. **Delivery** — export in each platform's size and length with captions; optional scheduling later. It is the last step of every product, and Macaron's whole flow ends there.

## Per product: first version

**Mixer** (build first)
- Three-step screen: choose a trend, add your inputs (a face from Pantry or an upload, a photo, clips, text), get the result. A feed of trending recipes on the first screen, each playing.
- One command on clips: drop clips in, say or pick what to do ("cut to the beat, add captions, glitch transition"), and get an edit back. This is the Katana side and uses Cut's timeline and the editor assistant.
- Face and character swap by LTX references (the existing References input: cast, prop, place).
- Reuses: Shot's inputs and run pipeline, Cut, the take player, the Library, the preset shelf.
- Suggested rules from day one (not in the original brief): only the user's own face, a clear consent line before the first face upload, a way to report a result, no real-person or public-figure presets.

**Macaron**
- **Template library:** filterable by category (product shot, motion, UGC, TikTok, ads, posters, marketplace) and by media type (images, videos), with named presets. A new project starts from a template. This is the Marketing Studio side.
- **Brand kit:** logo, colours, fonts, voice and tone, do/don't rules, taken from real files. The brand page at `web/brand/index.html` shows the shape.
- **Product projects:** per product, cutouts and angles, plus a studio setup reference (lighting, background, surface) so a photoshoot is repeatable.
- **Outputs:** product videos, photoshoots, UGC-style videos, TikTok and ad creatives, posters, marketplace visuals, and motion graphics (titles, lower thirds, end cards, logo stings) in the brand's colours. The NeuronKit social templates are the starting point.
- **Brand guard:** before export, flag off-palette colours, a missing or wrong logo, text outside safe areas.
- **Campaign packs:** one brief, the same story in 9:16, 1:1 and 16:9 with captions.

**Jam**
- Starts from a track (upload, or made in Cut with ACE-Step 1.5) and generates a music video from it.
- **Captions and subtitles** are core: lyrics and captions timed to the track, with styles.
- **Dance as reference:** a dance video drives your own music avatar (a character or your face, via Pantry) through motion copy.
- **Cover recreation:** recreate a TikTok cover with edits: beat-synced cuts, lip-sync performance shots, transitions.
- Reuses: Cut's music and voice tools, lip sync, motion copy, the timeline.

**Spice** (the VFX house, an AI suite; assistant: Paprika, a baby chameleon)
- A scenario of a few shots. Each shot is its **plate** (a clip LTX-2.5 rolls from a first frame and a few words, or a clip brought in) and the **chain** of passes the suite's tools made on it, each on the one before; the viewer wipes the clip a pass ran on against the clip it made. A pass taken off waits in the **bin** with what was made on top of it; put back, the chain is rebuilt to where it was made.
- Every tool is a workflow on Comfy Cloud, one route (`POST /api/spice/run`, `server/spice.ts`): the IC-LoRAs of LTX-2.3 on the app's own graph (`server/iclora.ts`, `workflows/ic-loras.json`: restore, upscale, grade and light, clean, frame, camera, control, effects), SAM3's cut-out (a green screen, the matte beside it), SeedVR2's upscale, LTX-2.5's sound, and the catalog's templates through the runner (Wan VACE restyle, frame interpolation). A registry (`GET /api/spice/tools`) says what each takes, what a real run of it showed (a dot), and what it still needs.
- The left panel is Paprika and the scenario's shots (a card each: the picture of what it is now, its passes, a lamp while a tool works), the key that adds a shot (a window: a first frame from the library, the words, the seconds, the price), and what the day's runs cost. The centre is the viewer with the chain under it, the tool picked (its words, dials, size and yellow key, which asks first), the shelf of tools by family, and the bin.
- Scenarios are projects of the `spice-scenarios` store; the example (`examples/spice/heist/`, Truffle's Jam Heist) is seeded on first run with every pass a real run. Paprika (`server/spice-assist.ts`) opens a shot, looks at a pass, picks and sets a tool, sets a new shot up, and asks for the key; running always waits for the person's yes.
- Reuses: the engine's graphs and jobs, the template runner, the examples seeder, the pet bar and the windows pattern. Utensils' own VFX workspace stays as it is.

**Utensils**
- One frame per tool, one input and one result. Start with: upscale, remove background, create variations, and the tools Kitchen already has (extend a clip, lip-sync, add or replace sound, image edit). Add tools by wrapping an existing component.

## Navigation

- A top-level switch between the six products (Kitchen is the default for existing users). Icons with tooltips, not text labels.
- Inside Kitchen the rooms stay as they are: Story, Stage, Shot, Cut, Library.
- Pantry, Recipes and Delivery appear inside every product, not as separate destinations.

## Constraints to keep (existing decisions)

- Each section is one scrollable dashboard screen; no step tabs or mini tabs inside a section.
- NeuronKit components and the media icon pack; icons over text, words in tooltips.
- Accent is Comfy Yellow `#F2FF59`, for interaction only.
- Only paths relative to the repo; nothing in code or docs may point outside it.

## Build order

1. Recipe format and **Save as recipe** in Kitchen; Pantry with faces and characters.
2. **Mixer**: trend feed, three-step run, face swap, consent flow.
3. **Utensils**: first five tools.
4. **Macaron**: brand kit and product projects first, then photoshoots, motion graphics, brand guard, campaign packs.
5. **Jam**: audio-first flow on top of Cut.
6. **Delivery** scheduling, and Brigade as a project setting.

## Open questions

- LTX-2.5 is the default everywhere. Where should a product steer users to another model (for example a face-swap trend that LTX holds poorly, or a product shot that needs more detail)? That needs a test, not a guess.

- Does Mixer run only on Comfy Cloud, or also on a local GPU? Face-swap quality and speed will decide.
- Are recipes shareable between users (a Market feed) in the first release, or private first?
- What is the minimum Brand kit a user must fill in before Macaron lets them generate?
