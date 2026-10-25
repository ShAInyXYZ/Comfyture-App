"""A matte for a Spice example, cut out on this machine: the subject white on black, frame by frame, as Roto's pass.

In the app, Roto cuts subjects out with SAM3 on Comfy Cloud. The examples stand in for it with BiRefNet run locally (rembg's
`birefnet-general`), so making them spends no credit. A picture gives a PNG, a clip an MP4 at the clip's own size and rate.

    python3 -I scripts/spice-roto.py <picture or clip> <out.png | out.mp4>

Needs rembg with the birefnet-general model (it downloads it once) and ffmpeg for clips. A clip's mattes are smoothed over three
frames (a median), so the edge does not shimmer where the model hesitates.
"""

import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image
from rembg import new_session, remove


def matte(session, picture):
    return np.asarray(remove(picture.convert("RGB"), session=session, only_mask=True).convert("L"))


def probe(path, entries):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", f"stream={entries}", "-of", "csv=p=0", path],
                         check=True, capture_output=True, text=True).stdout.strip()
    return out.split(",")


def main(src, out):
    session = new_session("birefnet-general")
    if not src.lower().endswith((".mp4", ".mov", ".webm", ".mkv")):
        Image.fromarray(matte(session, Image.open(src))).save(out)
        print(out)
        return
    rate = probe(src, "r_frame_rate")[0]
    with tempfile.TemporaryDirectory(prefix="spice-roto-") as tmp:
        subprocess.run(["ffmpeg", "-v", "error", "-i", src, os.path.join(tmp, "f%04d.png")], check=True)
        frames = sorted(f for f in os.listdir(tmp) if f.startswith("f"))
        mattes = []
        for i, name in enumerate(frames):
            mattes.append(matte(session, Image.open(os.path.join(tmp, name))))
            print(f"\r{i + 1}/{len(frames)}", end="", file=sys.stderr, flush=True)
        print(file=sys.stderr)
        stack = np.stack(mattes)
        for i in range(len(stack)):
            lo, hi = max(0, i - 1), min(len(stack), i + 2)
            Image.fromarray(np.median(stack[lo:hi], axis=0).astype(np.uint8)).save(os.path.join(tmp, f"m{i + 1:04d}.png"))
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", rate, "-i", os.path.join(tmp, "m%04d.png"),
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", "-movflags", "+faststart", out], check=True)
    print(out)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
