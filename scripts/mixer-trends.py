"""Builds Mixer's trend shelf from the crew's artwork and the trend research.

Reads docs/brand/mixer-crew (the crew's sheets, lineup and trend illustrations, the source-matched
revisions first) and docs/research/trends-2026-10-19/trend-recipes.json, and writes:
  web/brand/mixer/trends/<id>.webp   each trend's cover, at a size for the web
  web/brand/mixer/crew/<name>.png    each crew cat: a round avatar and a clean reference picture
  web/js/mixer-trends.js             the shelf: names, kinds, lengths, casts, beats and music feel
Source frames from the review are never copied: only our own artwork goes on the shelf.

Run from the repository root: python3 scripts/mixer-trends.py
"""
import json
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CREW_DIR = ROOT / "docs/brand/mixer-crew"
RESEARCH = ROOT / "docs/research/trends-2026-10-19/trend-recipes.json"
OUT_ART = ROOT / "web/brand/mixer/trends"
OUT_CREW = ROOT / "web/brand/mixer/crew"
OUT_JS = ROOT / "web/js/mixer-trends.js"
OUT_CAST = ROOT / "web/brand/cast"

# the shelf, in the order it shows: our name for each trend and its kind
SHELF = {
    "02-hotel-lobby": ("Hotel Lobby", "duo"),
    "03-smalltown-boy": ("Smalltown Boy", "reactions"),
    "01-private-property": ("State Property", "reactions"),
    "12-clapping-cat": ("Black Cat Clapping", "reactions"),
    "24-ramalama": ("Ramalama", "walks"),
    "04-la-calabaza": ("La Calabaza", "dance"),
    "05-three-kittens": ("Three Kittens", "dance"),
    "10-bulin": ("Bulin 47", "dance"),
    "11-toc-toc": ("Toc Toc", "dance"),
    "08-tiptoe": ("Tiptoe", "walks"),
    "09-alors": ("Alors on Danse", "duo"),
    "06-sway": ("Sway", "dance"),
    "07-scuba": ("Scuba", "dance"),
    "13-lights-off": ("Lights Off", "dance"),
    "15-closer": ("Closer", "duo"),
    "20-dance-with-me": ("Dance With Me", "duo"),
    "17-dance-audition": ("Dance Audition", "dance"),
    "16-job-dance": ("Job Dance", "dance"),
    "18-sea-lion": ("Sea Lion", "dance"),
    "14-face-dance": ("Face Dance", "reactions"),
    "19-grand-entrance": ("Grand Entrance", "glowups"),
    "29-documentary": ("Documentary", "reactions"),
}
# the revisions matched against the trends' own frames replace the first concepts
REVISED = {
    "02-hotel-lobby": "hotel-lobby-v2.2",
    "03-smalltown-boy": "smalltown-boy-v2",
    "01-private-property": "state-property-v2",
    "12-clapping-cat": "black-cat-clapping-v2.2",
    "24-ramalama": "ramalama-v2.2",
}
CREW = {
    "praline": ("Praline", "Ringleader", ROOT / "docs/brand/cast/praline-sheet.png", "the fluffy cream-and-caramel cat with amber eyes and a gold bell collar"),
    "sesame": ("Sesame", "Reactor", CREW_DIR / "characters/sesame-sheet-v1.png", "the black cat with emerald-green eyes and a tiny cream chest tuft"),
    "mochi": ("Mochi", "Scene-stealer", CREW_DIR / "characters/mochi-sheet-v1.png", "the round grey-lilac cat with pale blue eyes and a plum bow tie"),
    "meringue": ("Meringue", "Performer", CREW_DIR / "characters/meringue-sheet-v1.png", "the snowy-white longhaired kitten with sky-blue eyes and a coral-pink ribbon"),
}
# each cat's face on the lineup, as fractions of its width and height
FACES = {"praline": (0.035, 0.19, 0.245, 0.56), "sesame": (0.27, 0.19, 0.47, 0.56), "mochi": (0.5, 0.24, 0.71, 0.58), "meringue": (0.73, 0.21, 0.95, 0.58)}
# the rest of the cast, any of whom can be picked to play a role: (name, sheet, the front view on it)
CAST = {
    "ketkout": ("Ketkout", ROOT / "docs/brand/mascot/ketkout-character-sheet-v1.png", (0.02, 0.1, 0.255, 0.585)),
    "bagel": ("Bagel", ROOT / "docs/brand/cast/bagel-sheet.png", (0.01, 0.11, 0.25, 0.515)),
    "truffle": ("Truffle", ROOT / "docs/brand/cast/truffle-sheet.png", (0.01, 0.11, 0.25, 0.515)),
    "tofu": ("Tofu", ROOT / "docs/brand/cast/tofu-sheet.png", (0.01, 0.11, 0.25, 0.515)),
    "pickle": ("Pickle", ROOT / "docs/brand/cast/pickle-sheet.png", (0.01, 0.11, 0.25, 0.515)),
    "brioche": ("Brioche", ROOT / "docs/brand/cast/brioche-sheet.png", (0.01, 0.11, 0.25, 0.515)),
}
ROLES = ["Lead", "Partner", "Third"]
SPECIES = r"\b(cats?|kittens?|raccoons?|bunny|bunnies|frogs?|capybaras?|corgis?|pupp(?:y|ies)|dogs?|chicks?)\b"


def beats_of(trend, names):
    """The trend's beats as short lines over time, its animals named after the cast."""
    species = [s.lower() for s in (trend.get("cast") or {}).get("best_fit") or []]
    one = lambda w: re.sub(r"s$", "", re.sub(r"ies$", "y", w.lower()))
    def named(text):
        def swap(m):
            word = one(m.group(1))
            word = "cat" if word == "kitten" else word
            for i, s in enumerate(species):
                if word in s or (word == "cat" and "kitten" in s):
                    return names[i] if i < len(names) else names[0]
            return names[0]
        return re.sub(SPECIES, swap, text, flags=re.I)
    out = []
    for shot in trend.get("shots") or []:
        action = shot.get("action", "")
        # an action that says its own times ("0–1s: …. 1–6s: …") is split at them
        parts = re.split(r"(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*s:\s*", action)
        end = float(shot.get("to_s", trend.get("length_s", 10)))
        if len(parts) > 3:
            mine = [{"from": float(parts[i]), "to": float(parts[i + 1]), "text": named(parts[i + 2].strip().rstrip(".").split(". ")[0])} for i in range(1, len(parts) - 2, 3)]
            # the last beat runs to the end of its shot
            mine[-1]["to"] = max(mine[-1]["to"], end)
            out += mine
        else:
            out.append({"from": float(shot.get("from_s", 0)), "to": end, "text": named(action.split(". ")[0].rstrip("."))})
    for b in out:
        t = b["text"]
        if len(t) > 120:
            t = t[:120].rsplit(" ", 1)[0]
        t = t.rstrip(" ,;:")
        b["text"] = t[:1].upper() + t[1:]
    return out


def main():
    manifest = json.loads((CREW_DIR / "manifest.json").read_text())
    research = json.loads(RESEARCH.read_text())
    by_id = {i["id"]: i for i in manifest["illustrations"]}
    OUT_ART.mkdir(parents=True, exist_ok=True)
    OUT_CREW.mkdir(parents=True, exist_ok=True)

    trends = []
    for tid, (name, kind) in SHELF.items():
        ill = by_id[tid]
        src = CREW_DIR / ("reference-match-v2/edits/" + REVISED[tid] + ".png" if tid in REVISED else ill["illustration"])
        art = Image.open(src).convert("RGB")
        art.thumbnail((720, 1280))
        # a trend goes by our name for it
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        art.save(OUT_ART / f"{slug}.webp", quality=84, method=6)
        t = research[ill["research_index"] - 1]
        cast = ill["cast"]
        names = [CREW[c][0] for c in cast]
        audio = t.get("audio") or {}
        trends.append({
            "id": slug,
            "name": name,
            "kind": kind,
            "seconds": t.get("length_s", 10),
            "heat": t.get("virality", 3),
            "cast": [{"role": ROLES[i] if i < len(ROLES) else f"Star {i + 1}", "crew": c} for i, c in enumerate(cast)],
            "beats": beats_of(t, names),
            "music": {"bpm": audio.get("bpm"), "genre": audio.get("genre"), "mood": audio.get("mood"), "instruments": audio.get("instruments") or []},
            "caption": next((s.get("text_on_screen") for s in t.get("shots") or [] if (s.get("text_on_screen") or "").lower().startswith("top:")), None),
        })
        if trends[-1]["caption"]:
            trends[-1]["caption"] = trends[-1]["caption"].split(":", 1)[1].strip().strip('"“”').rstrip(".")

    # the crew: a round avatar from the lineup, and a clean front view from each sheet for the models
    lineup = Image.open(CREW_DIR / "crew-lineup-v1.png").convert("RGB")
    W, H = lineup.size
    crew = []
    for key, (name, role, sheet, desc) in CREW.items():
        x0, y0, x1, y1 = FACES[key]
        face = lineup.crop((int(W * x0), int(H * y0), int(W * x1), int(H * y1)))
        side = min(face.size)
        face = face.crop(((face.width - side) // 2, 0, (face.width - side) // 2 + side, side)).resize((256, 256), Image.LANCZOS)
        face.save(OUT_CREW / f"{key}-face.webp", quality=88, method=6)
        s = Image.open(sheet).convert("RGB")
        sw, sh = s.size
        # the front view alone: no heading above it, no label under it (models would draw the words)
        front = s.crop((int(sw * 0.01), int(sh * 0.135), int(sw * 0.25), int(sh * 0.515)))
        front.save(OUT_CREW / f"{key}.png", optimize=True)
        crew.append({"id": key, "name": name, "role": role, "look": desc})

    # the rest of the cast: a clean front view for the models and a round face for the pickers
    for key, (name, sheet, (x0, y0, x1, y1)) in CAST.items():
        s = Image.open(sheet).convert("RGB")
        sw, sh = s.size
        ref = s.crop((int(sw * x0), int(sh * y0), int(sw * x1), int(sh * y1)))
        ref.save(OUT_CAST / f"{key}-ref.png", optimize=True)
        side = int(ref.width * 0.8)
        face = ref.crop(((ref.width - side) // 2, 0, (ref.width - side) // 2 + side, side)).resize((256, 256), Image.LANCZOS)
        face.save(OUT_CAST / f"{key}-face.webp", quality=88, method=6)

    OUT_JS.write_text(
        "// Mixer's trend shelf and its crew, written by scripts/mixer-trends.py from the crew's artwork and the\n"
        "// trend research (docs/research/trends-2026-10-19). Each trend: its length, how hot it is now (1 to 5),\n"
        "// who stars in it, its beats over time, and the feel of the music made for it (never the original track).\n"
        f"export const CREW = {json.dumps(crew, ensure_ascii=False, indent=2)};\n\n"
        f"export const TRENDS = {json.dumps(trends, ensure_ascii=False, indent=2)};\n\n"
        'export const KINDS = [["all", "All"], ["dance", "Dance"], ["duo", "Duo"], ["reactions", "Reactions"], ["walks", "Walks"], ["glowups", "Glow-ups"]];\n'
        "export const trendById = (id) => TRENDS.find((t) => t.id === id) ?? null;\n"
        "export const crewById = (id) => CREW.find((c) => c.id === id) ?? null;\n"
        "export const trendArt = (t) => `brand/mixer/trends/${t.id}.webp`;\n"
        "export const crewFace = (id) => `brand/mixer/crew/${id}-face.webp`;\n"
        "export const crewPicture = (id) => `brand/mixer/crew/${id}.png`;\n"
    )
    print(len(trends), "trends,", len(crew), "crew")


if __name__ == "__main__":
    main()
