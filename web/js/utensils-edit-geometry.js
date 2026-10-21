// The Edit tools' shared geometry: where a reframe's crop frame sits in a clip and how big its picture comes out. The server
// cuts with it and the page draws the draggable frame with it, so what is seen is what is cut. Pure functions, no DOM.

export const FORMATS = { "9:16": [9, 16], "1:1": [1, 1], "4:5": [4, 5], "16:9": [16, 9] };

const even = (v) => Math.max(2, Math.floor(v / 2) * 2);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** A picture's size of an aspect (a ratio of width to height) whose shorter side is `short`, both sides even. */
export function frameOf(ratio, short) {
  const s = even(short);
  return ratio >= 1 ? { w: even(s * ratio), h: s } : { w: s, h: even(s / ratio) };
}

/**
 * The crop of a clip for a format, at a zoom, with the frame's place in the room it has (px and py, 0 to 1: how far along
 * the room the window sits). Answers the window in the clip's own pixels (cw, ch, x, y) and the size of the picture that
 * comes out (w, h): never larger than the window holds, never past 1080 on the short side.
 */
export function reframeBox(src, format, zoom = 1, px = 0.5, py = 0.5) {
  const [fw, fh] = FORMATS[format] ?? FORMATS["9:16"];
  const ratio = fw / fh;
  const z = clamp(Number(zoom) || 1, 1, 4);
  let cw = src.width;
  let ch = src.height;
  if (src.width / src.height >= ratio) cw = src.height * ratio;
  else ch = src.width / ratio;
  cw = even(cw / z);
  ch = even(ch / z);
  cw = Math.min(cw, even(src.width));
  ch = Math.min(ch, even(src.height));
  const x = Math.round(((src.width - cw) * clamp(px, 0, 1)) / 2) * 2;
  const y = Math.round(((src.height - ch) * clamp(py, 0, 1)) / 2) * 2;
  // the picture is the window itself (nothing resampled for nothing), made smaller only when it passes 1080 on the short side
  const k = Math.min(1, 1080 / Math.min(cw, ch));
  return { cw, ch, x, y, w: even(cw * k), h: even(ch * k) };
}

/** The frame a letterboxed reframe (a blurred or coloured ground) comes out in: the format at the clip's short side, 1080 at most. */
export function letterboxFrame(src, format) {
  const [fw, fh] = FORMATS[format] ?? FORMATS["9:16"];
  return frameOf(fw / fh, clamp(Math.min(src.width, src.height), 2, 1080));
}
