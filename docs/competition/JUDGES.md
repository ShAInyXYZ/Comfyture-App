# Comfyture, for the judges

*For the #OpenSourceHiggsfield judges: read this first, it takes three minutes.*

<!-- Before submitting: fill the three links below, and check every line against the submission build. The last paragraph
     ("no one else's media") is only true once D1 in README.md is done in full (the trends' recordings left the tree on 25 Oct;
     their derived frames and motion, the reference material and the history are still to do); the Mixer line depends on D1 too; "the compass starts
     a guided tour" needs every product's tour (only Toaster's exists on 25 Oct). -->

**Comfyture is an open-source Higgsfield**: seven creative studios on one engine, built on the Comfy Developer Platform.
Each studio has a pet who knows it, does the work for you through checked actions, and never spends a credit without your yes.
Every picture, video and sound model it runs by default is open weights, and LTX-2.5 makes picture and sound in one pass.

| | |
|---|---|
| **Live app** (private, judge mode: examples and tours free, real runs capped) | `<judge link>`, user and password on the form |
| **Static demo** (always up, nothing renders) | `<https://shainyxyz.github.io/Comfyture/>` |
| **Demo video** (1:55) | `<video link>` |
| **Code** (MIT) | [github.com/ShAInyXYZ/Comfyture](https://github.com/ShAInyXYZ/Comfyture) |

## Run it in five minutes

You need **Node.js 22.18 or newer** and **ffmpeg**.

```bash
git clone --depth 1 https://github.com/ShAInyXYZ/Comfyture && cd Comfyture
npm install
npm start            # then open http://127.0.0.1:5177
```

- **No key**: every product opens on its example, and the compass at the top right starts a guided tour. Nothing is spent.
- **Real runs on Comfy Cloud**: paste a Comfy API key in the account panel (top right), or put `COMFY_API_KEY=…` in `.env`.
  Add `COMFYTURE_OPEN_WEIGHTS=1` to keep every partner model out.
- **Your own GPU**: ComfyUI with the models (`scripts/get-models.sh`), then `pip install comfy-api-proxy && comfy-api-proxy run`,
  and pick **Renders on → Your ComfyUI** in the account panel. Guide: [docs/guides/LOCAL-COMFYUI.md](../guides/LOCAL-COMFYUI.md).

## What to try, one line each

| Product · pet | Try this | Free? |
|---|---|---|
| **Kitchen** · Ketkout the chick | Stage → *Morning kitchen*: keys 1–7 show the clay as colour ID, depth, normal, pose, lines, mask; pose a mannequin; *Render references*. On Kitchen's home, one sentence and *Imagine* writes a film. | Stage free; writing and rolling cost |
| **Toaster** · Crumpet the beaver | Press the compass for Crumpet's tour. Ask him for *"a cosy reading corner, camera low"* and watch him build it in clay; *Render* shows what is sent; *Toast it* renders it; *3D* makes a GLB. | Building free; toast and 3D cost |
| **Spice** · Paprika the chameleon | *Paprika's portal* → FX: drag a flame or a portal from the library onto the picture, move, scale and turn it; Comp: drag the wipe; Export. | All free; Roto (SAM3), Paint and Light passes cost |
| **Jam** · Pickle the frog | Open the example video and play the track: the beat and the sections are read in your browser; *The Words*: caption styles; *The Edit*: the cut on the beat. | Free; songs and performances cost |
| **Mixer** · Praline the cat | Pick a trend, swap the crew around, read its beats; *Make it* rolls it with LTX-2.5. | *Make it* costs |
| **Macaron** · Brioche the bunny | The Comfyture brand: palette, logos, type, rules, the brand book; ask Brioche for a colourway. | Kit free; pictures and motion cost |
| **Utensils** · Truffle the raccoon | The shelf of one-job tools; *Library*: the 691 official ComfyUI workflows, each as one form. | Edit tools free; models cost |

**Free** (in your browser, or on the server with ffmpeg): examples and tours; the Stage and Toaster in clay and their control passes;
Spice's compositor and its bake; Jam's beat; Cut's edit and film render; Utensils' edit tools and free effects; Macaron's kit and brand guard.
**Costs Comfy credits** (on Comfy Cloud; free on your own GPU): whatever a model makes. A 5-second LTX-2.5 shot is about 24 credits,
a picture 2–6. Every paid key shows its price, and a pet only *offers* a paid run: it waits under the answer for your yes.

## Where the interesting parts live

| What | Where |
|---|---|
| Talking to ComfyUI through the Comfy SDK, on Comfy Cloud or your GPU | [`server/engine.ts`](../../server/engine.ts), [`server/main.ts`](../../server/main.ts) |
| The workflows, as readable API-format graphs (LTX-2.5 shots, the Oven, songs) | [`workflows/`](../../workflows/) |
| Pets that act, checked: the tool, the checks, the actions applied | [`server/toaster-assist.ts`](../../server/toaster-assist.ts), [`web/js/toaster-assist.js`](../../web/js/toaster-assist.js), [`server/spice-assist.ts`](../../server/spice-assist.ts), `petAnswer` in [`server/main.ts`](../../server/main.ts) |
| Toaster: clay → maps → render → turnaround for Pixal3D → GLB | [`web/js/toaster.js`](../../web/js/toaster.js), [`web/js/toaster-model.js`](../../web/js/toaster-model.js) |
| Spice's compositor and its free bake | [`web/js/spice-canvas.js`](../../web/js/spice-canvas.js), [`web/js/spice-layers.js`](../../web/js/spice-layers.js), [`web/js/spice-bake.js`](../../web/js/spice-bake.js) |
| The Stage, its passes, and the MCP server any agent can drive | [`web/js/control/`](../../web/js/control/), [`scripts/control-mcp.ts`](../../scripts/control-mcp.ts) |
| The beat, read in the browser | [`web/js/beats.js`](../../web/js/beats.js) |
| The 691 official templates, run through Comfy Cloud's MCP | [`server/comfy-templates.ts`](../../server/comfy-templates.ts) |
| Examples and tours | [`examples/`](../../examples/), [`server/examples.ts`](../../server/examples.ts), [`web/js/tour.js`](../../web/js/tour.js), [`web/js/tours/`](../../web/js/tours/) |

## Models: open weights by default

| Job | Models |
|---|---|
| Video and sound, one pass | **LTX-2.5** with Lightricks' IC-LoRAs (Ingredients, union control, pixel upscaler) and its upscalers; LTX-2.3 clean-up LoRAs |
| Pictures | Qwen Image 2.1 (default), its Turbo and Edit; FLUX 3 Klein, Krea 2 Turbo, Z-Image Turbo |
| Music and sound | ACE-Step 1.5, Stable Audio 3 small |
| Words (writer, pets, LTX's text encoder) | Gemma 4 |
| VFX and listening | SAM3, Depth Anything 3, VOID, FILM, Demucs, Whisper, BiRefNet |
| Finishing and 3D | 4x-UltraSharp, SeedVR2, Pixal3D |

Partner models (Claude, GPT-6 and Gemini as writers; GPT Image, Nano Banana, Seedream and others as artists; Veo, Kling, Seedance,
MiniMax H3 and others for video) are opt-in through Comfy Router, billed in Comfy credits, and off with `COMFYTURE_OPEN_WEIGHTS=1`,
as on the live link.

Also used, as the rules ask us to say: three.js (the Stage and Toaster), ffmpeg (Cut, bakes, free effects), the official Blender MCP
(an optional round trip from the Stage). Built with Claude Code and Codex; our cast was drawn with GPT Image during development.
Every character is our own: no real people, no one else's media.
