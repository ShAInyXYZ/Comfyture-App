#!/usr/bin/env python3
"""Gather what the website (www/) shows into www/media, from the repo's own files.

  python3 scripts/www-media.py                     # make what is missing (npm run www)
  FORCE=1 python3 scripts/www-media.py             # make everything again
  CAPTURES=<folder> python3 scripts/www-media.py   # also bring in the app's screens and screen loops (see www/README.md)

Only our own media goes in, each file named here: the presets, the shipped examples (examples/), the brand folders (web/brand,
docs/brand) and a few named takes of the take log (data/runs, data/reels; skipped when this machine does not have them).
Never a whole folder: a Mixer trend's look frames and pose videos (and the original recordings it held until 25 October), and
anything of another creator must never reach the site. Pictures become WebP, clips H.264 MP4 with faststart and a poster;
loops carry no sound. ffmpeg and Pillow are needed."""
import json, os, shutil, subprocess, sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WWW = os.path.join(ROOT, "www")
OUT = os.path.join(WWW, "media")
FORCE = os.environ.get("FORCE") == "1"
CAPTURES = os.environ.get("CAPTURES")
made, missing = [], []


def src(*p):
    return os.path.join(ROOT, *p)


def dst(*p):
    path = os.path.join(OUT, *p)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


def todo(path, *sources):
    """Whether `path` has to be made: it is missing (or FORCE), and every source exists."""
    gone = [s for s in sources if not os.path.exists(s)]
    if gone:
        missing.extend(os.path.relpath(g, ROOT) for g in gone)
        return False
    if os.path.exists(path) and not FORCE:
        return False
    made.append(os.path.relpath(path, WWW))
    return True


def pic(source, path, width, q=78):
    """A picture as WebP, at most `width` wide (alpha kept)."""
    if not todo(path, source):
        return
    im = Image.open(source)
    alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
    im = im.convert("RGBA" if alpha else "RGB")
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(path, "WEBP", quality=q, method=6)


def ff(*args):
    subprocess.run(["ffmpeg", "-y", "-v", "error", *args], check=True)


def clip(source, path, width, crf=28, sound=False, start=None, length=None, vf="", fps=None):
    """A clip as H.264 MP4 (faststart), `width` wide; no sound unless asked."""
    if not todo(path, source):
        return
    cut = (["-ss", str(start)] if start is not None else []) + (["-t", str(length)] if length else [])
    filt = ",".join(f for f in [vf, f"scale={width}:-2:flags=lanczos", f"fps={fps}" if fps else "", "format=yuv420p"] if f)
    audio = ["-c:a", "aac", "-b:a", "96k"] if sound else ["-an"]
    ff(*cut, "-i", source, "-vf", filt, "-c:v", "libx264", "-crf", str(crf), "-preset", "slow", "-profile:v", "high",
       *audio, "-movflags", "+faststart", path)


def poster(video, path, at=0.0, width=960, q=76):
    """A still of a clip (WebP or JPG by the path's ending)."""
    if not todo(path, video):
        return
    tmp = path + ".png"
    ff("-ss", str(at), "-i", video, "-frames:v", "1", "-vf", f"scale={width}:-2:flags=lanczos", tmp)
    Image.open(tmp).convert("RGB").save(path, "WEBP" if path.endswith(".webp") else "JPEG", quality=q)
    os.remove(tmp)


# ── type and identity: the files the page names, never the whole brand folder (www/fonts/fonts.css is the site's own) ─────────
for f in ("manrope-400-800.woff2", "ibm-plex-mono-400.woff2", "ibm-plex-mono-500.woff2", "ibm-plex-mono-600.woff2",
          "OFL-Manrope.txt", "OFL-IBMPlexMono.txt"):
    if os.path.exists(src("web", "fonts", f)):
        shutil.copy2(src("web", "fonts", f), os.path.join(WWW, "fonts", f))
for f in ("favicon.svg", "favicon.ico", "apple-touch-icon.png", "wordmark.svg", "mark.svg", "icon.svg", "icon-512.png", "site.webmanifest"):
    if os.path.exists(src("web", "brand", f)):
        shutil.copy2(src("web", "brand", f), os.path.join(WWW, "brand", f))

# ── Kitchen's presets: poster, preview and painted last frame of each, and presets.json ───────────────────────────────────────
presets = []
for pid in sorted(os.listdir(src("presets"))):
    p = src("presets", pid)
    if not os.path.exists(os.path.join(p, "preset.json")):
        continue
    meta = json.load(open(os.path.join(p, "preset.json")))
    for f in ("poster.jpg", "preview.mp4"):
        if os.path.exists(os.path.join(p, f)) and todo(dst("presets", pid, f), os.path.join(p, f)):
            shutil.copy2(os.path.join(p, f), dst("presets", pid, f))
    last, prev = dst("presets", pid, "last.jpg"), dst("presets", pid, "preview.mp4")
    if os.path.exists(prev) and todo(last, prev):
        ff("-sseof", "-0.2", "-i", prev, "-frames:v", "1", "-q:v", "3", last)
    shot = (meta.get("script", {}).get("shots") or [{}])[0]
    presets.append({"id": pid, "name": meta.get("name", pid), "family": meta.get("category", ""), "blurb": meta.get("blurb", ""),
                    "sample": meta.get("sample", ""), "seconds": meta.get("seconds", 5), "camera": shot.get("camera", ""),
                    "action": shot.get("action", ""), "sound": shot.get("sound", ""), "paint": (meta.get("end") or {}).get("paint", "")})
json.dump(presets, open(dst("presets.json"), "w"), indent=1)
for f in ("dancer.jpg",):  # the photo of Last frame first
    if todo(dst("samples", f), src("samples", f)):
        shutil.copy2(src("samples", f), dst("samples", f))

# ── the pets ─────────────────────────────────────────────────────────────────────────────────────────────────
for pet in ("ketkout", "praline", "pickle", "brioche", "paprika", "crumpet", "canelle", "truffle"):
    face = src("web", "brand", "mixer", "crew", "praline-face.webp") if pet == "praline" else src("web", "brand", "cast", f"{pet}-face.webp")
    pic(face, dst("pets", f"{pet}.webp"), 256, 82)
for cat in ("praline", "sesame", "mochi", "meringue"):
    pic(src("web", "brand", "mixer", "crew", f"{cat}-face.webp"), dst("mixer", f"crew-{cat}.webp"), 256, 82)

# ── Mixer's trends acted by our cast, with their own lines (MiniMax H3, LTX-2.5), and Cabinet ────────────────────────────────
for t in ("we-listen", "uno-car-reveal", "tiny-desk", "getting-robbed", "ghost-photoshoot", "talking-about-me"):
    clip(src("web", "brand", "mixer", "trends", t, "preview.mp4"), dst("mixer", t + ".mp4"), 540, 27, sound=True, length=10)
    poster(dst("mixer", t + ".mp4"), dst("mixer", t + ".jpg"), 1.2, 540)
pic(src("docs", "brand", "products", "cabinet-cover.png"), dst("cabinet", "cover.webp"), 1400, 80)
for n in ("josie", "bagel", "earl"):
    pic(src("web", "brand", "cabinet", "examples", n + ".webp"), dst("cabinet", n + ".webp"), 360, 82)
for n in ("anime", "manga", "render-3d", "cinematic", "claymation", "storybook", "pixel", "oil", "neon", "bw-film", "comic", "sticker"):
    pic(src("docs", "brand", "products", "cabinet-v1", "originals", n + ".webp"), dst("cabinet", "style-" + n + ".webp"), 480, 80)
# (the pets' lineup, media/pets/lineup.webp, is docs/brand/cast/pets-lineup-8.png, drawn with Codex's GPT Image from the old lineup and
# Canelle's sheet; the app's screens are captured as below)

# ── the hero reel: real takes of our cast, cross-faded, picture and sound (16:9) ──────────────────────────────────────────────
JAR = src("examples", "kitchen", "tarte-for-friends", "a-little-jar-a-full-table.mp4")
REEL = [  # (source, start, seconds, window: where the 16:9 frame sits in a cover fit (x, y), has sound); a 9:16 source stands on the right
    (src("web", "brand", "mixer", "trends", "state-property", "preview.mp4"), 1.5, 4.5, (0.5, 0.5), False),  # Mixer: State Property
    (JAR, 4.6, 3.2, (0.5, 0.5), True),                                                                       # Kitchen: Ketkout rolls the dough
    (dst("spice", "spice-card.mp4"), 1.0, 3.4, (0.5, 0.2), False),                                           # Spice: plate and pass, wiped
    (src("web", "brand", "mixer", "trends", "uno-car-reveal", "preview.mp4"), 0.0, 4.0, (0.5, 0.5), True),  # Mixer: UNO Car Reveal
    (src("data", "runs", "20261021-501232c8", "shot.mp4"), 0.0, 4.0, (0.5, 0.28), True),                    # Jam: Taro sings his song
    (JAR, 41.0, 3.6, (0.5, 0.5), True),                                                                      # Kitchen: friends at the table
]


def reel(path, width=1280, crf=27, fade=0.5):
    if not todo(path, *[c[0] for c in REEL]):
        return
    h = width * 9 // 16
    args, vf, af = [], [], []
    for s, ss, d, _, _ in REEL:
        args += ["-ss", str(ss), "-t", str(d), "-i", s]
    for i, (_, _, d, (cx, cy), sound) in enumerate(REEL):
        tall = "/trends/" in REEL[i][0]  # a 9:16 trend: whole, on the right, over a blurred, darker copy of itself
        if tall:
            vf.append(f"[{i}:v]fps=24,trim=0:{d},setpts=PTS-STARTPTS,split[f{i}][g{i}];"
                      f"[g{i}]scale={width}:{h}:force_original_aspect_ratio=increase,crop={width}:{h},gblur=sigma=28,eq=brightness=-0.28[bg{i}];"
                      f"[f{i}]scale=-2:{h}:flags=lanczos[fg{i}];[bg{i}][fg{i}]overlay=x={width}*0.68-w/2:y=0,setsar=1,format=yuv420p[v{i}]")
        else:
            vf.append(f"[{i}:v]fps=24,scale={width}:{h}:force_original_aspect_ratio=increase:flags=lanczos,"
                      f"crop={width}:{h}:(iw-{width})*{cx}:(ih-{h})*{cy},setsar=1,format=yuv420p,trim=0:{d},setpts=PTS-STARTPTS[v{i}]")
        af.append(f"[{i}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:{d},asetpts=PTS-STARTPTS,apad=whole_dur={d}[a{i}]"
                  if sound else f"anullsrc=r=48000:cl=stereo,atrim=0:{d}[a{i}]")
    v, a, t = "v0", "a0", REEL[0][2]
    for i in range(1, len(REEL)):
        vf.append(f"[{v}][v{i}]xfade=transition=fade:duration={fade}:offset={t - fade:.3f}[x{i}]")
        af.append(f"[{a}][a{i}]acrossfade=d={fade}:c1=tri:c2=tri[y{i}]")
        v, a, t = f"x{i}", f"y{i}", t - fade + REEL[i][2]
    ff(*args, "-filter_complex", ";".join(vf + af), "-map", f"[{v}]", "-map", f"[{a}]", "-c:v", "libx264", "-crf", str(crf),
       "-preset", "slow", "-profile:v", "high", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", path)


# (the reel is made at the end: one of its takes is Spice's card, made further down)

# ── Kitchen: A Little Jar, A Full Table (Ketkout's example film), whole with its sound, and a short loop for its card; the Stage's examples
clip(JAR, dst("kitchen", "little-jar.mp4"), 960, 27, sound=True)
poster(dst("kitchen", "little-jar.mp4"), dst("kitchen", "little-jar.jpg"), 41.5)
clip(JAR, dst("kitchen", "little-jar-loop.mp4"), 960, 28, start=4.6, length=6)
poster(dst("kitchen", "little-jar-loop.mp4"), dst("kitchen", "little-jar-loop.jpg"), 0.5)
import base64, tempfile  # noqa: E402
for f in sorted(os.listdir(src("examples", "stage"))):
    # each example stage keeps its first render (Qwen Image 2.1, an edit of the clay frame) and its clay thumbnail inside its file
    stage = json.load(open(src("examples", "stage", f)))
    name = f.split(".")[0][3:]
    renders = [r for r in stage.get("renders", []) if r.get("data")]
    for kind, data in (("render", renders[0]["data"] if renders else ""), ("clay", stage.get("thumb") or "")):
        if not isinstance(data, str) or len(data) < 100:
            continue
        with tempfile.NamedTemporaryFile(suffix=".jpg") as tmp:
            tmp.write(base64.b64decode(data.split(",")[-1]))
            tmp.flush()
            pic(tmp.name, dst("kitchen", f"stage-{name}-{kind}.webp"), 1376, 78)

# ── Mixer: Meringue's takes (picture only), the crew ──────────────────────────────────────────────────────────────────────────
for rid, slug in (("20261020-2317f6ff", "meringue-1"), ("20261020-2b210845", "meringue-2")):
    clip(src("data", "runs", rid, "shot.mp4"), dst("mixer", slug + ".mp4"), 540, 28)
    poster(dst("mixer", slug + ".mp4"), dst("mixer", slug + ".jpg"), 0.8, 540)
pic(src("docs", "brand", "mixer-crew", "crew-lineup-v1.png"), dst("mixer", "crew-lineup.webp"), 1400, 78)

# ── Jam: Taro's video cover (his ACE-Step song, so it keeps its sound) and its cover ─────────────────────────────────────────
clip(src("data", "runs", "20261021-501232c8", "shot.mp4"), dst("jam", "taro.mp4"), 720, 27, sound=True)
poster(dst("jam", "taro.mp4"), dst("jam", "taro.jpg"), 0.5, 720)
pic(src("docs", "brand", "examples", "little-otter-tea", "song-cover.png"), dst("jam", "taro-cover.webp"), 720, 78)

# ── Macaron: what the Comfyture brand and Little Otter Tea made ───────────────────────────────────────────────────────────────
EX = ("web", "brand", "macaron", "comfyture", "exports")
for name in ("board", "brioche", "hero", "launch", "rooms"):
    pic(src(*EX, f"{name}-4x5.png"), dst("macaron", f"{name}.webp"), 720, 80)
OT = ("docs", "brand", "examples", "little-otter-tea", "made")
for f, name, w in (("little-otter-tea-launch-one-cup-then-the-moon-4x5.png", "otter-post", 720),
                   ("little-otter-tea-launch-web-hero-hero.png", "otter-web", 1200),
                   ("little-otter-tea-brand-share-image-og.png", "otter-share", 1200),
                   ("little-otter-tea-launch-cafe-flyer-a4.png", "otter-flyer", 720)):
    pic(src(*OT, f), dst("macaron", f"{name}.webp"), w, 80)
clip(src(*EX, "intro-9x16.mp4"), dst("macaron", "intro.mp4"), 540, 28)
poster(dst("macaron", "intro.mp4"), dst("macaron", "intro.jpg"), 4.0, 540)
clip(src(*OT, "logo-sting.mp4"), dst("macaron", "otter-sting.mp4"), 540, 28)
poster(dst("macaron", "otter-sting.mp4"), dst("macaron", "otter-sting.jpg"), 2.0, 540)

# ── Spice: the example scenario, Truffle's Jam Heist (examples/spice/heist/, every pass a real run): each shot's plate against the clip
#    its last pass made, side by side in a wipe on the site; the card: two shots side by side, a wipe sweeping across both ───────────
SP = ("examples", "spice", "heist")
HEIST = (("sh010", 2.0), ("sh020", 2.0), ("sh030", 2.0), ("sh040", 2.0), ("sh050", 2.0))
if os.path.exists(src(*SP, "scenario.json")):
    with open(src(*SP, "scenario.json")) as f:
        heist = json.load(f)
    for shot, at in HEIST:
        spec = next((x for x in heist["shots"] if x["id"] == shot), None)
        if not spec or not spec["passes"]:
            continue
        last = spec["passes"][-1]["media"]["file"]
        for source, out in ((spec["plate"]["file"], "plate"), (last, "pass")):
            clip(src(*SP, source), dst("spice", f"{shot}-{out}.mp4"), 960, 26, sound=out == "pass")
            poster(dst("spice", f"{shot}-{out}.mp4"), dst("spice", f"{shot}-{out}.jpg"), at, 960)
        # every pass of the chain, small, for the strip of passes under each shot on the site
        for i, p in enumerate(spec["passes"], 1):
            poster(src(*SP, p["media"]["file"]), dst("spice", f"{shot}-p{i}.jpg"), at, 480)
card = dst("spice", "spice-card.mp4")
A, B = ("sh010", "sh050")
if todo(card, *(src(*SP, f"{s}-{p}.mp4") for s in (A, B) for p in ("plate",)), *(dst("spice", f"{s}-pass.mp4") for s in (A, B))):
    # the yard and the dance side by side (five seconds each); the plates on the left of a yellow line that sweeps across and back once
    # a loop, the passes on its right
    n, x = 113, "(0.5+0.42*sin(2*PI*{t}/(113/24)))"
    side = lambda i: f"[{i}:v]scale=960:540,setsar=1,fps=24,format=yuv420p"
    ff("-i", src(*SP, f"{A}-plate.mp4"), "-i", src(*SP, f"{B}-plate.mp4"), "-i", dst("spice", f"{A}-pass.mp4"), "-i", dst("spice", f"{B}-pass.mp4"),
       "-filter_complex",
       f"{side(0)},trim=end_frame={n}[a];{side(1)},trim=end_frame={n}[b];{side(2)},trim=end_frame={n}[c];{side(3)},trim=end_frame={n}[d];"
       f"[a][b]hstack[p];[c][d]hstack[f];[p][f]blend=all_expr='if(lt(X,W*{x.format(t='T')}),A,B)'[w];color=c=0xF2FF59:s=3x540:r=24[l];"
       f"[w][l]overlay=x='W*{x.format(t='t')}-1':y=0:eval=frame:shortest=1,format=yuv420p[v]",
       "-map", "[v]", "-frames:v", str(n), "-c:v", "libx264", "-crf", "27", "-preset", "slow", "-an", "-movflags", "+faststart", card)
poster(card, dst("spice", "spice-card.jpg"), 3.0, 1080)

# ── Toaster: its examples, clay frame and render (renders made with GPT Image for the examples, as each example says) ───────
TOAST = [("toast-example-woodshop", "workbench", "workbench"), ("toast-example-woodshop", "close-up", "close-up"),
         ("toast-example-woodshop", "workbench", "storybook"), ("toast-example-stage", "crowd", "crowd"),
         ("toast-example-stage", "crowd", "poster"), ("toast-example-stage", "close-up", "close-up"),
         ("toast-example-perfume", "hero", "hero"), ("toast-example-perfume", "hero", "after-dark"),
         ("toast-example-perfume", "set", "set")]
for ex, frame, render in TOAST:
    short = ex.replace("toast-example-", "")
    pic(src("examples", "toaster", ex, f"frame-{frame}.jpg"), dst("toaster", f"{short}-{frame}-clay.webp"), 1280, 78)
    pic(src("examples", "toaster", ex, f"render-{render}.jpg"), dst("toaster", f"{short}-{render}.webp"), 1280, 80)
for ex, f in (("toast-example-woodshop", "depth-workbench.webp"), ("toast-example-stage", "colour-id-crowd.webp"),
              ("toast-example-woodshop", "crumpet-turnaround.webp"), ("toast-example-stage", "pickle-turnaround.webp"),
              ("toast-example-perfume", "depth-set.webp"), ("toast-example-perfume", "colour-id-hero.webp")):
    pic(src("examples", "toaster", ex, f), dst("toaster", f"{ex.replace('toast-example-', '')}-{f}"), 1280, 80)

# ── the app itself: screens and screen loops captured headless from a lab server on a fresh data folder (its shipped examples, our
#    cast only), at 1600x950 and twice the pixels; CAPTURES=<folder> names where they are (see www/README.md) ──────────────────────
APP = {  # www/media/app/<name>.webp ← <capture folder>/<file>
    "story": "a/story-02-storyboard.png", "stage": "a/stage-16-campfire-render-compare.png", "shot": "a/shot-01-desk.png",
    "cut": "a/cut-01-edit-title.png", "library": "a/library-01-images.png", "jam": "c/jam-01-track.png", "macaron": "b/macaron-01-kit.png",
    "spice": "c/spice-01-heist.png", "toaster": "c/toaster-01-scene.png",
    "utensils": "c/utensils-01-picture.png", "tour": "c/spice-02-tour-chain.png",
}
LOOPS = {  # www/media/loops/<name>.mp4 ← <capture folder>/<file> (a screen recording; no sound)
}
PASSES = [f"a/stage-0{i}-busstop-{p}.png" for i, p in enumerate(("clay", "colour-id", "depth", "normal", "openpose", "lines", "mask"), 1)]


def slides(stills, path, box, size=(960, 600), hold=1.1, fade=0.3):
    """A loop of stills cross-faded into one another (the last back into the first), each cropped to `box` (in the stills' pixels)."""
    if not todo(path, *stills):
        return
    args, f = [], []
    n = len(stills) + 1
    for s in stills + stills[:1]:
        args += ["-loop", "1", "-t", str(hold + fade), "-i", s]
    x, y, w, h = box
    for i in range(n):
        f.append(f"[{i}:v]crop={w}:{h}:{x}:{y},scale={size[0]}:{size[1]}:flags=lanczos,fps=30,setsar=1,format=yuv420p[s{i}]")
    cur, t = "s0", hold + fade
    for i in range(1, n):
        f.append(f"[{cur}][s{i}]xfade=transition=fade:duration={fade}:offset={t - fade:.3f}[t{i}]")
        cur, t = f"t{i}", t - fade + hold + fade
    # end where the first still begins, so the loop has no seam
    ff(*args, "-filter_complex", ";".join(f), "-map", f"[{cur}]", "-t", f"{(hold) * (n - 1) + fade:.3f}", "-c:v", "libx264", "-crf", "28",
       "-preset", "slow", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", path)


if CAPTURES:
    for name, f in APP.items():
        pic(os.path.join(CAPTURES, f), dst("app", name + ".webp"), 1800, 80)
    for name, f in LOOPS.items():
        clip(os.path.join(CAPTURES, f), dst("loops", name + ".mp4"), 1280, 30)
        poster(dst("loops", name + ".mp4"), dst("loops", name + ".jpg"), 0.0, 1280, 74)
    # the Stage's seven passes of one frame, its viewport cropped out of the screens (3200x1900): clay, colour ID, depth, normal…
    slides([os.path.join(CAPTURES, f) for f in PASSES], dst("loops", "stage-passes.mp4"), (894, 368, 1347, 842))
    poster(dst("loops", "stage-passes.mp4"), dst("loops", "stage-passes.jpg"), 0.0, 960, 76)

# ── the hero reel, last (see above) ──
reel(dst("hero", "reel.mp4"))
poster(dst("hero", "reel.mp4"), dst("hero", "reel.jpg"), 1.2, 1280, 72)

print(f"{len(made)} files made in www/media" + (f"; skipped, source missing: {', '.join(sorted(set(missing)))}" if missing else ""))
size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(OUT) for f in fs)
print(f"www/media holds {size / 1e6:.1f} MB")
