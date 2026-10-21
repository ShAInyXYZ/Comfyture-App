// A design placed on a surface in a photograph, for the mockup window's preview: the surface's four corners are known (a quad), the
// design is fitted to the surface at its own shape and drawn onto it in the photograph's perspective, multiplied into the photo
// so the paper's own light and shade show through. A projective map from the surface's square to the quad, drawn as many small
// triangles (each an affine copy of its part of the design: the canvas has no perspective of its own).

/** The projective map from the unit square to a quad (tl, tr, br, bl), as a function of (u, v) giving a point. */
export function homography([tl, tr, br, bl]) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = [tl[0], tl[1], tr[0], tr[1], br[0], br[1], bl[0], bl[1]];
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const det = dx1 * dy2 - dx2 * dy1;
  const g = det ? (dx3 * dy2 - dx2 * dy3) / det : 0;
  const hh = det ? (dx1 * dy3 - dx3 * dy1) / det : 0;
  const a = x1 - x0 + g * x1, b = x3 - x0 + hh * x3, c = x0;
  const d = y1 - y0 + g * y1, e = y3 - y0 + hh * y3, f = y0;
  return (u, v) => {
    const w = g * u + hh * v + 1;
    return [(a * u + b * v + c) / w, (d * u + e * v + f) / w];
  };
}

/** Where a design of a shape (width over height) sits on a surface of a shape: the biggest that fits, centred, as a square of (u, v). */
export function fitOn(designAspect, panelAspect) {
  const [du, dv] = designAspect > panelAspect ? [1, panelAspect / designAspect] : [designAspect / panelAspect, 1];
  return { u0: (1 - du) / 2, v0: (1 - dv) / 2, u1: (1 + du) / 2, v1: (1 + dv) / 2 };
}

// one triangle of the source drawn as one of the destination: an affine copy
function triangle(ctx, img, s, d) {
  const [[sx0, sy0], [sx1, sy1], [sx2, sy2]] = s;
  const [[dx0, dy0], [dx1, dy1], [dx2, dy2]] = d;
  const det = sx0 * (sy1 - sy2) + sx1 * (sy2 - sy0) + sx2 * (sy0 - sy1);
  if (!det) return;
  const a = (dx0 * (sy1 - sy2) + dx1 * (sy2 - sy0) + dx2 * (sy0 - sy1)) / det;
  const b = (dy0 * (sy1 - sy2) + dy1 * (sy2 - sy0) + dy2 * (sy0 - sy1)) / det;
  const c = (dx0 * (sx2 - sx1) + dx1 * (sx0 - sx2) + dx2 * (sx1 - sx0)) / det;
  const dd = (dy0 * (sx2 - sx1) + dy1 * (sx0 - sx2) + dy2 * (sx1 - sx0)) / det;
  const e = (dx0 * (sx1 * sy2 - sx2 * sy1) + dx1 * (sx2 * sy0 - sx0 * sy2) + dx2 * (sx0 * sy1 - sx1 * sy0)) / det;
  const f = (dy0 * (sx1 * sy2 - sx2 * sy1) + dy1 * (sx2 * sy0 - sx0 * sy2) + dy2 * (sx0 * sy1 - sx1 * sy0)) / det;
  // a hair outward, so the triangles leave no seam between them
  const cx = (dx0 + dx1 + dx2) / 3, cy = (dy0 + dy1 + dy2) / 3;
  const grow = ([x, y]) => {
    const k = Math.hypot(x - cx, y - cy) || 1;
    return [x + ((x - cx) / k) * 1.6, y + ((y - cy) / k) * 1.6];
  };
  ctx.save();
  ctx.beginPath();
  const [p0, p1, p2] = [grow(d[0]), grow(d[1]), grow(d[2])];
  ctx.moveTo(...p0);
  ctx.lineTo(...p1);
  ctx.lineTo(...p2);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, dd, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/**
 * Draws `img` (a design, as a bitmap or a canvas) onto the quad of a photograph already on `ctx`: fitted to the surface's shape,
 * in the photograph's perspective, multiplied into it. `quad` is in the canvas's own pixels; `round` is the surface's corner radius
 * as a share of its shorter side (a screen).
 */
export function placeOn(ctx, img, quad, { panel = img.width / img.height, round = 0, steps = 14, blend = "multiply", fill = false } = {}) {
  const map = homography(quad);
  // paper takes the design whole, at its shape; a screen is filled by it (the middle of it, cropped to the screen's shape)
  const fit = fill ? { u0: 0, v0: 0, u1: 1, v1: 1 } : fitOn(img.width / img.height, panel);
  let [cx, cy, cw, ch] = [0, 0, img.width, img.height];
  if (fill) {
    if (img.width / img.height > panel) ((cw = img.height * panel), (cx = (img.width - cw) / 2));
    else ((ch = img.width / panel), (cy = (img.height - ch) / 2));
  }
  const layer = document.createElement("canvas");
  layer.width = ctx.canvas.width;
  layer.height = ctx.canvas.height;
  const lx = layer.getContext("2d");
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const [a0, a1, b0, b1] = [i / steps, (i + 1) / steps, j / steps, (j + 1) / steps];
      const uv = (u, v) => [fit.u0 + u * (fit.u1 - fit.u0), fit.v0 + v * (fit.v1 - fit.v0)];
      const dst = [uv(a0, b0), uv(a1, b0), uv(a1, b1), uv(a0, b1)].map(([u, v]) => map(u, v));
      const src = [[cx + a0 * cw, cy + b0 * ch], [cx + a1 * cw, cy + b0 * ch], [cx + a1 * cw, cy + b1 * ch], [cx + a0 * cw, cy + b1 * ch]];
      triangle(lx, img, [src[0], src[1], src[2]], [dst[0], dst[1], dst[2]]);
      triangle(lx, img, [src[0], src[2], src[3]], [dst[0], dst[2], dst[3]]);
    }
  }
  ctx.save();
  if (round) {
    // the surface's own rounded outline, as a clip: a corner is a quarter circle in the real surface (width `panel`, height 1)
    const R = round * Math.min(panel, 1);
    const [ru, rv] = [R / panel, R];
    const pts = [];
    const arc = (cu, cv, from) => {
      for (let k = 0; k <= 8; k++) {
        const t = from + (k / 8) * (Math.PI / 2);
        pts.push([cu + ru * Math.cos(t), cv + rv * Math.sin(t)]);
      }
    };
    arc(ru, rv, Math.PI);
    arc(1 - ru, rv, Math.PI * 1.5);
    arc(1 - ru, 1 - rv, 0);
    arc(ru, 1 - rv, Math.PI * 0.5);
    ctx.beginPath();
    pts.forEach(([u, v], k) => {
      const [x, y] = map(fit.u0 + u * (fit.u1 - fit.u0), fit.v0 + v * (fit.v1 - fit.v0));
      k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.clip();
  }
  ctx.globalCompositeOperation = blend;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}
