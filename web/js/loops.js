// A clip set to loop (`loop: true`) on a lane over the film repeats until the film ends. The repeats are never kept in the edit:
// they are laid out wherever the film is read (the timeline draws them as a ghost trail, the player and the render play them).
// Shared by the page and the server's render.

const round = (x) => Math.round(x * 1000) / 1000;
// (a picture or a colour is stretched by its length; a clip or a sound is cut by where it stops)
const STILL = new Set(["photo", "color", "sticker"]);

/** The repeats of a looping item that starts at `start` and runs `len` seconds, up to `end`; the last one is cut short to fit. */
export function loopCopies(it, start, len, end) {
  if (!it?.loop || !(len >= 0.25)) return [];
  const out = [];
  for (let s = start + len, n = 1; s < end - 0.05 && n <= 500; s += len, n++) {
    const copy = { ...it, id: `${it.id}~${n}`, start: round(s), loop: false, ghost: it.id };
    const left = end - s;
    if (left < len - 0.001) {
      if (it.src && !STILL.has(it.src.kind)) copy.to = round((Number(it.from) || 0) + left * (Number(it.speed) || 1));
      else copy.length = round(left);
    }
    out.push(copy);
  }
  return out;
}

/** The edit with every looping item's repeats laid out after it on its lane (the main track's clips do not loop). */
export function withLoops(body, lengthOf, end) {
  if (!body?.tracks?.some((t) => !t.main && t.items?.some((it) => it.loop))) return body;
  return {
    ...body,
    tracks: body.tracks.map((t) => (t.main || !t.items.some((it) => it.loop) ? t
      : { ...t, items: t.items.flatMap((it) => [it, ...loopCopies(it, Number(it.start) || 0, lengthOf(it), end)]) })),
  };
}
