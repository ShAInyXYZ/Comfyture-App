#!/usr/bin/env python3
"""Make the showreel's voice and sound effects with ElevenLabs, through the local ComfyUI's partner nodes (Comfy API credits).

Usage: python3 scripts/gen-audio.py <job> [<job> ...]   (jobs below; "all" runs every one)
Writes public/audio/<job>.mp3. Every job costs a few cents; nothing runs that is not named.
"""
import json, os, shutil, sys, time, urllib.request, uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
REPO = HERE.parent.parent
COMFY = "http://127.0.0.1:8188"
COMFY_IN = Path("/home/shiny/Documents/donkey-art/comfyui_data/input")
COMFY_OUT = Path("/home/shiny/Documents/donkey-art/outputs")
OUT = HERE / "public" / "audio"

def key():
    for line in open(REPO / ".env"):
        k, _, v = line.strip().partition("=")
        if k == "COMFY_API_KEY":
            return v.strip()
    raise SystemExit("COMFY_API_KEY missing in .env")

VO = ("[deadpan] Well... this might be private property. "
      "[pause] [mischievously] But Comfyture isn't. "
      "[excited] [shouting] It's PUUUUBLIC PROPERTYYY!")

def tts(voice, text, seed, stability=0.3):
    return {
        "1": {"class_type": "ElevenLabsVoiceSelector", "inputs": {"voice": voice}},
        "2": {"class_type": "ElevenLabsTextToSpeech", "inputs": {
            "voice": ["1", 0], "text": text, "stability": stability, "apply_text_normalization": "auto",
            "model": "eleven_v3", "model.speed": 1.0, "model.similarity_boost": 0.75,
            "language_code": "en", "seed": seed, "output_format": "mp3_44100_192"}},
    }

def sfx(text, seconds, influence=0.45):
    return {"2": {"class_type": "ElevenLabsTextToSoundEffects", "inputs": {
        "text": text, "model": "eleven_sfx_v2", "model.duration": seconds, "model.loop": False,
        "model.prompt_influence": influence, "output_format": "mp3_44100_192"}}}


JOBS = {
    # The narrator, three voices to choose from.
    "vo-brian": lambda: tts("Brian (male, american)", VO, 11),
    "vo-bill": lambda: tts("Bill (male, american)", VO, 12),
    "vo-chris": lambda: tts("Chris (male, american)", VO, 13),
    # The last line alone, pushed harder, for a longer "PUUUBLIC".
    "vo-public-brian": lambda: tts("Brian (male, american)", "[excited] [shouting] It's PUUUUUUUBLIC PROPERTYYYY!", 21, 0.0),
    "vo-public-chris": lambda: tts("Chris (male, american)", "[excited] [shouting] It's PUUUUUUUBLIC PROPERTYYYY!", 22, 0.0),
    # Sound effects.
    "sfx-scratch": lambda: sfx("vinyl record scratch, music stops abruptly, comedic freeze frame", 1.2, 0.6),
    "sfx-stamp": lambda: sfx("heavy rubber stamp slammed hard on a wooden desk, one loud thud", 1.0, 0.6),
    "sfx-whoosh": lambda: sfx("smooth cinematic camera pull back whoosh, airy and wide", 1.8, 0.5),
    "sfx-hit": lambda: sfx("huge cinematic bass drop impact, then a stadium crowd cheering", 3.0, 0.5),
    "sfx-logo": lambda: sfx("bright energetic logo sting: glitchy digital swooshes, sparkling shimmer, punchy bass hit at the end", 4.0, 0.45),
    "sfx-pops": lambda: sfx("seven quick cartoon bubble pops in a row, playful", 1.6, 0.55),
    "sfx-jingle": lambda: sfx("upbeat funky brass and drums jingle, triumphant, ends on a big final hit", 5.0, 0.4),
}

def post(graph, api_key):
    body = json.dumps({"prompt": graph, "client_id": str(uuid.uuid4()),
                       "extra_data": {"api_key_comfy_org": api_key}}).encode()
    req = urllib.request.Request(f"{COMFY}/prompt", body, {"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req))["prompt_id"]

def wait(pid, timeout=300):
    t0 = time.time()
    while time.time() - t0 < timeout:
        h = json.load(urllib.request.urlopen(f"{COMFY}/history/{pid}"))
        if pid in h:
            st = h[pid].get("status", {})
            if st.get("status_str") == "error":
                msgs = [m for m in st.get("messages", []) if m[0] == "execution_error"]
                raise RuntimeError(json.dumps(msgs)[:800])
            if st.get("completed"):
                return h[pid]["outputs"]
        time.sleep(2)
    raise TimeoutError(pid)

def run(name, api_key):
    g = JOBS[name]()
    prefix = f"showreel/{name}-{int(time.time())}"
    g["9"] = {"class_type": "SaveAudioMP3", "inputs": {"audio": ["2", 0], "filename_prefix": prefix, "quality": "320k"}}
    outs = wait(post(g, api_key))
    for node in outs.values():
        for a in node.get("audio", []):
            src = COMFY_OUT / a.get("subfolder", "") / a["filename"]
            dst = OUT / f"{name}.mp3"
            shutil.copyfile(src, dst)
            print(f"{name}: {dst}", flush=True)
            return
    raise RuntimeError(f"{name}: no audio in {outs}")

if __name__ == "__main__":
    names = sys.argv[1:]
    if names == ["all"]:
        names = list(JOBS)
    OUT.mkdir(parents=True, exist_ok=True)
    k = key()
    for n in names:
        try:
            run(n, k)
        except Exception as e:
            print(f"{n}: FAILED {e}", flush=True)
