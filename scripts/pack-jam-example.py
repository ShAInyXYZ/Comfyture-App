#!/usr/bin/env python3
"""Pack a jam and its edit (from data/) as a shipped Jam example: examples/jam/<folder>/project.json plus every song, clip and picture
they use. Each file is put in as "<folder>-<file>" (server/main.ts putJam), and the jam and its edit are rewritten to those names.

  python3 scripts/pack-jam-example.py <jam id> <folder> "<about>"
"""
import json, os, re, shutil, sys

jam_id, folder, about = sys.argv[1:4]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
data = os.path.join(root, "data")
out = os.path.join(root, "examples", "jam", folder)
os.makedirs(out, exist_ok=True)
SHELVES = ["audio", "videos", "photos", "reels"]
MEDIA = re.compile(r"^[\w.-]+\.(png|jpg|jpeg|webp|mp4|mov|webm|mp3|wav|m4a|flac|ogg)$", re.I)
media = {}  # original file name -> (shelf, new name)


def take(name, shelf=None):
    if name in media:
        return media[name]
    for s in [shelf] if shelf in SHELVES else SHELVES:
        p = os.path.join(data, s, name)
        if os.path.exists(p):
            shutil.copyfile(p, os.path.join(out, name))
            media[name] = (s, f"{folder}-{name}")
            return media[name]
    return None


def walk(v, key=None):
    if isinstance(v, dict):
        return {k: walk(x, k) for k, x in v.items()}
    if isinstance(v, list):
        return [walk(x, key) for x in v]
    if isinstance(v, str):
        m = re.match(r"^/media/(\w+)/([\w.-]+)$", v)
        if m:
            got = take(m.group(2), m.group(1))
            if got:
                return f"/media/{got[0]}/{got[1]}"
        if key != "saved" and MEDIA.match(v):
            got = take(v)
            if got:
                return got[1]
    return v


jam = json.load(open(os.path.join(data, "jams", f"{jam_id}.json")))
body = jam["body"]
cut_id = body.get("cut")
cut = json.load(open(os.path.join(data, "cuts", f"{cut_id}.json"))) if cut_id else None
new_cut = f"cut-{folder}"
jam_body = walk(body)
if cut_id:
    jam_body["cut"] = new_cut
    for sc in (jam_body.get("backstage") or {}).get("scenes") or []:
        if isinstance(sc.get("addedToEdit"), dict):
            sc["addedToEdit"]["cut"] = new_cut
cut_body = walk(cut["body"]) if cut else None

thumb = None
t = jam.get("thumb") or ""
m = re.match(r"^/media/photos/([\w.-]+)$", t)
if m and os.path.exists(os.path.join(data, "photos", m.group(1))):
    shutil.copyfile(os.path.join(data, "photos", m.group(1)), os.path.join(out, "thumb" + os.path.splitext(m.group(1))[1]))
    thumb = "thumb" + os.path.splitext(m.group(1))[1]

track = body.get("track") or {}
spec = {
    "name": jam["name"], "rev": "1", "about": about, **({"thumb": thumb} if thumb else {}),
    "jam": jam_body,
    **({"cut": {"id": new_cut, "name": cut.get("name") or jam["name"], "body": cut_body}} if cut else {}),
    "media": [
        {"file": orig, "to": f"{shelf}/{new}",
         **({"name": track.get("name") or jam["name"], "kind": "music"} if shelf == "audio" and orig == track.get("file") else {}),
         **({"name": jam["name"], "kind": "music"} if shelf == "audio" and orig != track.get("file") else {})}
        for orig, (shelf, new) in sorted(media.items())
    ],
}
json.dump(spec, open(os.path.join(out, "project.json"), "w"), ensure_ascii=False, indent=1)
size = sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out))
print(f"{out}: {len(media)} files, {size / 1e6:.1f} MB")
