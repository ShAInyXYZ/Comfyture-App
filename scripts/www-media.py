#!/usr/bin/env python3
"""Gather what the website shows from the app's own files into www/media.

  python3 scripts/www-media.py

Copies each preset's poster and preview, the sample photos and the docs pictures,
cuts the last frame of every preview, and writes www/media/presets.json with each
preset's name, family, blurb, sample photo and sound line. Run it again after the
presets change; www/ is then a self-contained static site."""
import json, os, shutil, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "www", "media")
os.makedirs(os.path.join(OUT, "presets"), exist_ok=True)
os.makedirs(os.path.join(OUT, "samples"), exist_ok=True)
os.makedirs(os.path.join(OUT, "app"), exist_ok=True)

manifest = []
for pid in sorted(os.listdir(os.path.join(ROOT, "presets"))):
    src = os.path.join(ROOT, "presets", pid)
    if not os.path.exists(os.path.join(src, "preset.json")):
        continue
    meta = json.load(open(os.path.join(src, "preset.json")))
    dst = os.path.join(OUT, "presets", pid)
    os.makedirs(dst, exist_ok=True)
    for f in ("poster.jpg", "preview.mp4"):
        if os.path.exists(os.path.join(src, f)):
            shutil.copy2(os.path.join(src, f), os.path.join(dst, f))
    last = os.path.join(dst, "last.jpg")
    if not os.path.exists(last) and os.path.exists(os.path.join(dst, "preview.mp4")):
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-sseof", "-0.2", "-i", os.path.join(dst, "preview.mp4"), "-frames:v", "1", "-q:v", "3", last], check=False)
    shot = (meta.get("script", {}).get("shots") or [{}])[0]
    manifest.append({
        "id": pid, "name": meta.get("name", pid), "family": meta.get("category", ""), "blurb": meta.get("blurb", ""),
        "sample": meta.get("sample", ""), "seconds": meta.get("seconds", 5), "camera": shot.get("camera", ""),
        "action": shot.get("action", ""), "sound": shot.get("sound", ""), "paint": (meta.get("end") or {}).get("paint", ""),
    })
json.dump(manifest, open(os.path.join(OUT, "presets.json"), "w"), indent=1)

for f in os.listdir(os.path.join(ROOT, "samples")):
    shutil.copy2(os.path.join(ROOT, "samples", f), os.path.join(OUT, "samples", f))
for f in ("desk.jpg", "director.jpg", "last-frame-first.jpg", "references.jpg", "presets.webp"):
    shutil.copy2(os.path.join(ROOT, "docs", f), os.path.join(OUT, "app", f))
shutil.copytree(os.path.join(ROOT, "web", "brand"), os.path.join(ROOT, "www", "brand"), dirs_exist_ok=True)
shutil.copytree(os.path.join(ROOT, "web", "fonts"), os.path.join(ROOT, "www", "fonts"), dirs_exist_ok=True)
print(len(manifest), "presets;", sum(len(f) for _, _, f in os.walk(OUT)), "files in www/media")


# ── the takes and the film: real output from the app's own take log, re-encoded small for the web
def encode(src, dst, width, crf):
    if os.path.exists(dst):
        return
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src, "-vf", f"scale={width}:-2", "-c:v", "libx264", "-crf", str(crf), "-preset", "slow",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", dst], check=True)


def poster(src, dst, at="1.5"):
    if not os.path.exists(dst):
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", at, "-i", src, "-frames:v", "1", "-vf", "scale=960:-2", "-q:v", "4", dst], check=True)


TAKES = [  # (run id, slug, kind)
    ("20261016-d8b29203", "waking-up", "Story shot"), ("20261016-15639d93", "finding-life", "Story shot"),
    ("20261016-fe2bf9d0", "observing-sky", "Story shot"), ("20261016-86f937a5", "rescue-arrival", "Story shot"),
    ("20261016-800aa468", "canal-discovery", "Story shot"), ("20261016-28c00dd6", "gutter-flow", "Story shot"),
    ("20261016-2425942a", "not-tonight", "Talking shot"), ("20261016-e656a180", "chef-lip-sync", "Talking shot"),
    ("20261016-b4dd8820", "chef-copied-motion", "Copy motion"), ("20261017-d6cd3f01", "stage-to-video", "From the Stage"),
    ("20261016-74a9e3a0", "harbor-morning", "Single take"), ("20261016-0959104a", "thunder-god-extended", "Extend"),
]
os.makedirs(os.path.join(OUT, "takes"), exist_ok=True)
os.makedirs(os.path.join(OUT, "film"), exist_ok=True)
takes = []
for rid, slug, kind in TAKES:
    run = os.path.join(ROOT, "data", "runs", rid)
    if not os.path.exists(os.path.join(run, "run.json")):
        continue
    m = json.load(open(os.path.join(run, "run.json")))
    mp4 = next((os.path.join(run, f) for f in ("shot.mp4", "extension.mp4") if os.path.exists(os.path.join(run, f))), None)
    if not mp4:
        continue
    encode(mp4, os.path.join(OUT, "takes", slug + ".mp4"), 960, 27)
    poster(mp4, os.path.join(OUT, "takes", slug + ".jpg"))
    r = m["request"]; shot = (r["script"]["shots"] or [{}])[0]
    takes.append({"id": slug, "title": r.get("name", slug).replace(" · extended", ""), "kind": kind, "seconds": r.get("seconds"),
                  "width": m["size"]["width"], "height": m["size"]["height"], "prompt": m.get("prompt", ""), "sound": shot.get("sound", ""),
                  "dialogue": [d.get("line", "") for sh in r["script"]["shots"] for d in sh.get("dialogue", [])]})
json.dump(takes, open(os.path.join(OUT, "takes.json"), "w"), indent=1)

film_src = os.path.join(ROOT, "data", "reels", "20261016-37b820.mp4")
if os.path.exists(film_src):
    encode(film_src, os.path.join(OUT, "film", "desert-dawn-rescue.mp4"), 1280, 25)
    poster(film_src, os.path.join(OUT, "film", "desert-dawn-rescue.jpg"), "3")
print(len(takes), "takes;", "film", os.path.exists(os.path.join(OUT, "film", "desert-dawn-rescue.mp4")))
