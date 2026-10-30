#!/usr/bin/env python3
"""Pack a Kitchen story and its edit (from data/) as a shipped example: examples/kitchen/<folder>/example.json plus every
picture, clip and sound they use, each referenced as "example:<file>" (server/examples.ts puts them in on first start).

  python3 scripts/pack-kitchen-example.py <story id> <cut id> <reel id> <folder> <example id>
"""
import json, os, re, shutil, sys

story_id, cut_id, reel_id, folder, ex_id = sys.argv[1:6]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
data = os.path.join(root, "data")
out = os.path.join(root, "examples", "kitchen", folder)
os.makedirs(out, exist_ok=True)
SHELVES = ["photos", "videos", "audio", "models"]
MEDIA = re.compile(r"^[\w.-]+\.(png|jpg|jpeg|webp|mp4|mov|webm|mp3|wav|m4a|flac|ogg|glb)$", re.I)
copied = set()


def find(name, shelf=None):
    for s in [shelf] if shelf else SHELVES:
        p = os.path.join(data, s, name)
        if os.path.exists(p):
            return p
    return None


def take(name, shelf=None):
    p = find(name, shelf)
    if not p:
        return None
    if name not in copied:
        shutil.copyfile(p, os.path.join(out, name))
        copied.add(name)
    return name


def story_walk(v, key=None):
    """Story body: every media file becomes "example:<file>"."""
    if isinstance(v, dict):
        return {k: story_walk(x, k) for k, x in v.items()}
    if isinstance(v, list):
        return [story_walk(x, key) for x in v]
    if isinstance(v, str):
        m = re.match(r"^/media/(\w+)/([\w.-]+)$", v)
        if m and take(m.group(2), m.group(1) if m.group(1) in SHELVES else None):
            return f"example:{m.group(2)}"
        if key == "file" and MEDIA.match(v) and take(v):
            return f"example:{v}"
        if key != "saved" and MEDIA.match(v) and take(v):
            return f"{ex_id}-{v}"  # named by file elsewhere: the name it is put in under (shipped through the edit's file list)
    return v


def cut_walk(v, key=None):
    """The edit names its media by file ("src.id"): those become the names the example puts them in under."""
    if isinstance(v, dict):
        return {k: cut_walk(x, k) for k, x in v.items()}
    if isinstance(v, list):
        return [cut_walk(x, key) for x in v]
    if isinstance(v, str):
        m = re.match(r"^/media/(\w+)/([\w.-]+)$", v)
        if m and take(m.group(2), m.group(1) if m.group(1) in SHELVES else None):
            return f"/media/{m.group(1)}/{ex_id}-{m.group(2)}"
        if key in ("id", "file") and MEDIA.match(v) and take(v):
            return f"{ex_id}-{v}"
    return v


story = json.load(open(os.path.join(data, "stories", f"{story_id}.json")))
cut = json.load(open(os.path.join(data, "cuts", f"{cut_id}.json")))
reel = json.load(open(os.path.join(data, "reels", f"{reel_id}.json")))
ex_cut = f"cuts-{folder}-example"

body = story_walk(story["body"])
film_name = f"{folder}.mp4"
shutil.copyfile(os.path.join(data, "reels", f"{reel_id}.mp4"), os.path.join(out, film_name))
body["tutorial"] = {
    "version": 1,
    "duration": float(reel.get("seconds", 0)),
    "cut": ex_cut,
    "film": {"id": reel_id, "url": f"example:{film_name}", "name": story["name"], "takes": [], "cut": ex_cut,
             "seconds": float(reel.get("seconds", 0)), "createdAt": reel.get("createdAt")},
    "steps": [],
}
cut_body = cut_walk(cut["body"])
# The edit's own files, so they are put in even where the story does not name them.
cut_body["exampleFiles"] = [f"example:{n}" for n in sorted(copied) if n != film_name]
thumb = story.get("thumb", "")
m = re.match(r"^/media/(\w+)/([\w.-]+)$", thumb or "")
thumb = f"example:{m.group(2)}" if m and take(m.group(2), m.group(1)) else None

spec = {"id": ex_id, "rev": 1, "name": story["name"], **({"thumb": thumb} if thumb else {}),
        "story": {"body": body}, "cut": {"id": ex_cut, "name": cut.get("name") or story["name"], "body": cut_body}}
json.dump(spec, open(os.path.join(out, "example.json"), "w"), ensure_ascii=False, indent=1)
size = sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out))
print(f"{out}: {len(os.listdir(out))} files, {size / 1e6:.1f} MB")
