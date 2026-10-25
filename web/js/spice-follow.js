// A layer that FOLLOWS keeps its place on Roto's subject as the subject moves through a clip (flames on the pumpkin a dancer holds over his
// head, which drifts about a twelfth of the frame in two seconds). The subject's ANCHOR on a frame is the middle of the white of its matte;
// a layer that follows has a PIN, the anchor on the frame where it was placed (or last moved with follow on), and on any frame sits where it
// was placed plus how far the anchor has moved since: its centre is x + (anchor.x - pin.x), y + (anchor.y - pin.y). With no matte on the
// frame, or an empty one, or no pin yet, it stays where it was placed; a picture has no frames to follow over, so it is ignored there.
// Pure, but for the read of the matte (a small canvas); the compositor (spice-layers.js), the viewer's handles (spice-canvas.js) and the
// changes of the layers (spice-fx-ops.js) all go through here, so what is seen, what is moved by hand and what is baked agree.
const FIRST = 1001;
/** How wide the matte is read: the anchor is a mean over thousands of pixels, a hundred columns of them tell it to a pixel of a 1080p frame. */
const READ = 96;

/**
 * The anchor of a matte: the middle of its white, { x, y } as shares of its frame (0 to 1, from the top left), or null when it has none.
 * `image` has the fields an ImageData has: `data` (RGBA bytes), `width`, `height`. A pixel is white when its luminance, as much of it as
 * its opacity lets through, is above a half.
 */
export function anchorOf({ data, width, height }) {
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) * (data[i + 3] / 255);
      if (lum <= 127.5) continue;
      n++;
      sx += x + 0.5;
      sy += y + 0.5;
    }
  }
  return n ? { x: sx / n / width, y: sy / n / height } : null;
}

let probe = null;
/** The anchor of what a matte shows now, read from a copy of it 96 columns wide. */
function read(matte) {
  const mw = matte.videoWidth || matte.naturalWidth || matte.width;
  const mh = matte.videoHeight || matte.naturalHeight || matte.height;
  if (!mw || !mh) return null;
  const h = Math.max(1, Math.round((READ * mh) / mw));
  probe ??= document.createElement("canvas");
  if (probe.width !== READ || probe.height !== h) ((probe.width = READ), (probe.height = h));
  const g = probe.getContext("2d", { willReadFrequently: true });
  g.clearRect(0, 0, READ, h);
  g.drawImage(matte, 0, 0, READ, h);
  return anchorOf(g.getImageData(0, 0, READ, h));
}

const kept = new WeakMap();
/**
 * The anchor of the matte clip `matte` at a frame of the shot: { matte (the clip, drawn from where it is), frame (the slate frame),
 * fps, matteFrom (the slate frame the matte's first frame is) }. Answers null where there is nothing to follow: no clip (a picture's matte
 * is a picture), not ready, not covering that frame, or empty. What the clip shows is what is read, each of its frames once (kept by the
 * clip and the frame it is at, so a clip is read once in the viewer and once in the bake); a clip that is still seeking shows the frame
 * before, so that is read for this once and not kept.
 */
export function anchorAt(matte, { frame, fps = 24, matteFrom = FIRST } = {}) {
  if (!matte || matte.tagName !== "VIDEO" || matte.readyState < 2) return null;
  const t = (frame - matteFrom) / fps;
  if (t < -0.5 / fps || t > (matte.duration || 0) + 0.5 / fps) return null;
  const at = Math.round(matte.currentTime * fps);
  let frames = kept.get(matte);
  if (!frames) kept.set(matte, (frames = new Map()));
  if (frames.has(at)) return frames.get(at);
  const found = read(matte);
  if (!matte.seeking) frames.set(at, found);
  return found;
}

/** A layer as it is on a frame: itself, or when it follows and there is an anchor and a pin, a copy with its centre moved by the subject's. */
export function followed(layer, at) {
  if (!layer.follow || !layer.pin || !at?.matte) return layer;
  const a = anchorAt(at.matte, at);
  return a ? { ...layer, x: layer.x + (a.x - layer.pin.x), y: layer.y + (a.y - layer.pin.y) } : layer;
}

// ---------------------------------------------------------------- the playhead

let playhead = null;
/** The viewer says where the playhead is and what matte it holds: `fn` answers { matte, frame, fps, matteFrom }, or null (not a clip, not FX). */
export const watchPlayhead = (fn) => void (playhead = fn);
/** The subject's anchor at the playhead, or null. */
export const anchorNow = () => {
  const at = playhead?.();
  return at ? anchorAt(at.matte, at) : null;
};
/** A layer as it is seen at the playhead. */
export const followedNow = (layer) => {
  const at = playhead?.();
  return at ? followed(layer, at) : layer;
};
