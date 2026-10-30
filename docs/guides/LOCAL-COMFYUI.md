# Render on your own ComfyUI

For anyone who wants Comfyture's renders to run on their own GPU (or a GPU they rent) instead of Comfy Cloud.

Comfyture talks to ComfyUI through the **Comfy API v2**, the API Comfy Cloud speaks. A local ComfyUI does not speak it by itself:
**comfy-api-proxy**, Comfy's small bridge, serves it in front of your ComfyUI. So it is three things, each in its own terminal:

```
Comfyture (127.0.0.1:5177) ──► comfy-api-proxy, the bridge (127.0.0.1:8189) ──► your ComfyUI (127.0.0.1:8188) ──► your GPU
```

Nothing else in the app changes: the same workflows, the same takes, the same pets.

## 1. ComfyUI with the models

1. Install a recent ComfyUI ([its instructions](https://github.com/comfyanonymous/ComfyUI#installing)) and start it:
   ```bash
   python main.py --listen 127.0.0.1 --port 8188
   ```
2. Put the models in its `models` folder. The files and folders are listed in the README's [Models](../../README.md#models) table, and
   one script fetches them with the Hugging Face CLI (accept the model terms on the Lightricks pages first):
   ```bash
   scripts/get-models.sh /path/to/ComfyUI/models          # what Kitchen, Jam and Mixer need
   ALL=1 scripts/get-models.sh /path/to/ComfyUI/models    # and the optional ones (references, copying motion, Production)
   ```
3. Two features use custom nodes, as Lightricks' own examples do: **References** and **Copy its motion** need
   [ComfyUI-LTXVideo](https://github.com/Lightricks/ComfyUI-LTXVideo), and following body and face needs DWPose from
   [comfyui_controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux). Everything else is core ComfyUI.

**The GPU.** LTX-2.5 (video and sound in one pass) is a 22B model; its int8 build runs on a 24 GB card (an RTX 3090 or 4090) at 720p.
Pictures (Qwen Image 2.1) and music (ACE-Step) need less.

## 2. The bridge

```bash
pip install comfy-api-proxy
comfy-api-proxy run            # the v2 API on 127.0.0.1:8189, in front of the ComfyUI on 127.0.0.1:8188
```

Its options (`comfy-api-proxy run --help`): `--comfyui` names another ComfyUI address, `--port` another port, `--token` asks every
request for a token. `comfy-api-proxy start` runs it in the background (`status`, `stop`).

## 3. Point Comfyture at it

Open **the account window** (the credits pill at the top right) and, under **Renders on**, pick **Local ComfyUI** (or **Both**, below):

1. the address is the bridge's (`http://127.0.0.1:8189` by default);
2. **Test** asks it what it is, for free;
3. **Use it** checks it again and switches every render to it, at once, without a restart. The choice is kept (in
   `data/target.json`) and outranks `.env`.

A job your ComfyUI cannot run (a node or a model file it does not have, read from its `/object_info`) stops at once and says what is
missing. **Both** sends that job to Comfy Cloud instead, with your key, and keeps every job your ComfyUI can run on it: your GPU for what
it has, Comfy Cloud for the rest. **Comfy Cloud** in the same switch goes back. Or set it in `.env` instead: `COMFY_BASE_URL=http://127.0.0.1:8189`.
With no key and no address at all, Comfyture already looks for the bridge at `127.0.0.1:8189`.

`npm run check` runs one tiny workflow through the bridge and saves `data/smoke.png`: the quickest proof the three are talking.

## What runs where

| | On your ComfyUI | Needs a Comfy API key |
|---|---|---|
| Video and sound (LTX-2.5), pictures (Qwen Image 2.1), music (ACE-Step), the free bakes and edits | yes | no |
| The writers and the pets on open weights (Gemma 4, a ComfyUI workflow) | yes | no |
| Partner image and video models (GPT Image, Nano Banana, FLUX, Kling, Veo…), writers on Claude or GPT | no: they run on Comfy Router | yes, with credits |
| Utensils' Templates (the official workflows, run as they are published) | no: they run on Comfy Cloud | yes, with credits |

`COMFYTURE_OPEN_WEIGHTS=1` in `.env` keeps every partner model out of the app: with it and your own ComfyUI, nothing leaves your machine.

## A GPU somewhere else

On a rented GPU (RunPod, a server of yours), run ComfyUI and the bridge there, then reach the bridge from your machine **without
opening it to the internet**:

- an SSH tunnel: `ssh -N -L 8189:127.0.0.1:8189 you@gpu-host`, then use `http://127.0.0.1:8189` as above; or
- a private network such as Tailscale, with the bridge bound to that address.

If the bridge must listen on a network address, start it with a token (`comfy-api-proxy run --host 0.0.0.0 --token <a long random
token>`) and give Comfyture the same token in `.env` as `COMFY_PROXY_TOKEN=<the token>`: it is sent to your bridge only, never to Comfy.

## When it does not connect

| What the Test says | What to do |
|---|---|
| *A ComfyUI answers here, but without the bridge* | You gave ComfyUI's own address (8188). Start `comfy-api-proxy run` and use its address (8189). |
| *Nothing answers at this address* | The bridge is not running, or on another port: `comfy-api-proxy status`. |
| *The bridge answers, and asks for a key* | It was started with `--token`: set `COMFY_PROXY_TOKEN` in `.env` and restart Comfyture. |
| A render fails with a missing file | A model is not in ComfyUI's `models` folder: the README's [Models](../../README.md#models) table says which and where. |
| The first render is slow | ComfyUI loads the models on the first run; the next ones are faster. |
