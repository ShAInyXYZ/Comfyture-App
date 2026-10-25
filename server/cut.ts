// A Cut's timeline as ffmpeg graphs. The main video track plays its clips end to end (each cut,
// dissolved or whipped into the one before), each trimmed, sped, moved (a push in, a pan) and faded; overlays
// sit over it at their times (pictures with their own sound and shape, and stickers placed on the
// frame); the beat effects (shake, zoom, flash, colour) play over that whole picture; titles are
// drawn text, and lyrics are subtitles drawn word by word. Every sound — the clips' own, voices,
// music, effects — is trimmed, faded and placed at its time, music ducking under the voices, then
// mixed. Picture and sound are two graphs, rendered apart and joined after (one graph that holds
// both makes ffmpeg 4 drop and repeat frames at the joins).

import { fxPlan, FX_KINDS, EVERY, WHIP, whipBlur } from "../web/js/fx.js";
import { lyricAss, ANIMATED, LYRIC_FONT, LOOKS } from "../web/js/lyrics.js";
import { KEYS, LANGUAGES, STRUCTURES } from "../web/js/song.js";

export type Motion = { from: { scale: number; x: number; y: number }; to: { scale: number; x: number; y: number } };
export interface CutItem {
  id: string;
  src?: { kind?: string; id?: string; file?: string };
  start?: number;
  from?: number;
  to?: number | null;
  length?: number;
  speed?: number;
  motion?: Motion | null;
  opacity?: number;
  fadeIn?: number;
  fadeOut?: number;
  volume?: number;
  sound?: boolean;
  join?: "cut" | "dissolve" | "whip";
  text?: string;
  style?: "center" | "lower" | "pop" | "karaoke" | "bounce" | "top" | "none" | "stack" | "type" | "neon" | "outline" | "hand" | "minimal" | "comic";
  /** how a word arrives, when the line names one (else its style's own): fill, pop, bounce, cut, fade */
  anim?: string;
  grade?: string;
  /** A picture placed on the frame (a sticker): its middle and its width as fractions of the frame, its turn in degrees, its order. */
  x?: number;
  y?: number;
  w?: number;
  rot?: number;
  z?: number;
  /** A lyric line's words, each timed from the line's start; its size, colour and the colour it lights up in. */
  words?: { text: string; from: number; to: number }[];
  size?: number;
  color?: string;
  hi?: string;
  /** A beat effect: what it is, whether it is on, every how many beats, how strong, how long a hit lasts. */
  kind?: string;
  on?: boolean;
  every?: number;
  intensity?: number;
  dur?: number;
}
export interface CutTrack { id: string; kind: "video" | "audio" | "title" | "fx"; main?: boolean; mute?: boolean; role?: "voice" | "music" | "effects"; items: CutItem[] }
export interface CutBody {
  tracks: CutTrack[];
  duck?: boolean;
  aspect?: string;
  /** How a clip fills a frame of another shape: "cover" crops it to fill, "contain" (the default) leaves bars. */
  fit?: "cover" | "contain";
  beats?: { bpm?: number; offset?: number; times?: number[]; down?: number; source?: string };
}
/** A source on disk, as the server found it (a colour has no file). */
export interface Source { path: string; still: boolean; hasAudio: boolean; duration: number; color?: string }
export interface PlanOptions {
  width: number;
  height: number;
  font: string | null;
  titleFile: (i: number) => string;
  /** Whether this ffmpeg can draw subtitles (libass): lyrics are drawn word by word with it, else as plain titles. */
  ass?: boolean;
}

const n = (v: unknown, lo: number, hi: number, d: number) => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d;
};
const f3 = (x: number) => x.toFixed(3);
/** An expression as a filter option takes it: its commas escaped. */
const esc = (x: string) => x.replace(/,/g, "\\,");
// colour looks, each one filter
export const GRADES: Record<string, string> = {
  natural: "",
  warm: "colorbalance=rs=.06:gs=.02:bs=-.06:rm=.04:bm=-.04,eq=saturation=1.08",
  cool: "colorbalance=rs=-.05:bs=.07:rm=-.03:bm=.05,eq=saturation=.98",
  mono: "hue=s=0,eq=contrast=1.08",
  film: "curves=preset=medium_contrast,colorbalance=rs=.03:bs=-.02:bh=.04,eq=saturation=.92",
};

/** A picture placed on the frame (a sticker), not laid over all of it. */
export const isPlaced = (it: CutItem) => !!it.src && (it.src.kind === "sticker" || it.w !== undefined || it.x !== undefined);

/**
 * The effect filters for an edit's picture, starting from the stream `input`: a swell and a shake
 * (the picture scaled up about its middle and moved, laid over itself), colour, and the flashes (a
 * white blend each, only while it lasts). Answers the filters and the label they end on. The
 * numbers are fx.js's, the same the preview draws.
 */
export function fxFilters(body: CutBody, W: number, H: number, input: string, T: number) {
  const plan = fxPlan(body);
  const vf: string[] = [];
  let acc = input;
  if (plan.zoom || plan.dx || plan.dy || plan.rot) {
    // scale eval=frame changes the frame's size each frame, which only overlay reads rightly
    const chain: string[] = [];
    if (plan.rot) chain.push(`rotate=a='${esc(plan.rot)}':ow=iw:oh=ih:c=black`);
    chain.push(`scale=w='trunc(${W}*(${esc(plan.zoom ?? "1")})/2)*2':h='trunc(${H}*(${esc(plan.zoom ?? "1")})/2)*2':eval=frame`);
    vf.push(`[${acc}]split=2[fxa][fxb]`, `[fxb]${chain.join(",")}[fxz]`);
    vf.push(`[fxa][fxz]overlay=x='(W-w)/2+(${esc(plan.dx ?? "0")})*W':y='(H-h)/2+(${esc(plan.dy ?? "0")})*H':eval=frame:eof_action=pass:format=yuv420[fxg]`);
    acc = "fxg";
  }
  const colour: string[] = [];
  if (plan.hue || plan.sat) colour.push(`hue=h='${esc(plan.hue ?? "0")}':s='${esc(plan.sat ?? "1")}'`);
  if (plan.bright) colour.push(`eq=brightness='${esc(plan.bright)}':eval=frame`);
  if (colour.length) {
    vf.push(`[${acc}]${colour.join(",")}[fxc]`);
    acc = "fxc";
  }
  if (plan.flashes.length) {
    const count = plan.flashes.length;
    vf.push(`color=c=white:s=${W}x${H}:r=24:d=${f3(T)},format=yuv420p,split=${count}${plan.flashes.map((_, i) => `[fw${i}]`).join("")}`);
    plan.flashes.forEach((f, i) => {
      vf.push(`[${acc}][fw${i}]blend=all_expr='${esc(`A+(B-A)*${f.amount}*(1-(T-${f.at})/${f.dur})`)}':enable='between(t\\,${f.at}\\,${f.at + f.dur})'[fl${i}]`);
      acc = `fl${i}`;
    });
  }
  return { vf, out: acc };
}

/**
 * The plan for one film: its inputs (ffmpeg arguments, in order), the picture and sound graphs, and
 * how long it runs. source(item) says where an item's file is; titles are written to files by the
 * caller (titleFile(i) names them), so no text needs escaping; lyrics come back as an ASS file the
 * caller writes beside a copy of the font (the graph reads `lyrics.ass` and `fonts/` from where
 * ffmpeg runs).
 */
export function planCut(body: CutBody, source: (item: CutItem) => Source | null, o: PlanOptions) {
  const W = o.width - (o.width % 2);
  const H = o.height - (o.height % 2);
  const inputs: string[][] = [];
  const vf: string[] = [];
  const af: string[] = [];
  const add = (args: string[]) => inputs.push(args) - 1;
  const main = body.tracks.find((t) => t.kind === "video" && t.main) ?? body.tracks.find((t) => t.kind === "video");
  const cover = body.fit === "cover";
  const sounds: { label: string; role: string }[] = [];

  // a clip's length on the timeline, its source checked
  const span = (it: CutItem, src: Source) => {
    if (src.still) return n(it.length ?? (it.to ?? 4) - (it.from ?? 0), 0.5, 60, 4);
    const from = n(it.from, 0, Math.max(0, src.duration - 0.2), 0);
    const to = n(it.to ?? src.duration, from + 0.2, src.duration, src.duration);
    return (to - from) / n(it.speed, 0.25, 4, 1);
  };

  /**
   * One clip's picture: trimmed, sped, filled to the frame, moved, graded and faded; answers its
   * label. An overlay keeps its alpha (a PNG, a clip with transparency) and fades through it.
   */
  const picture = (it: CutItem, src: Source, len: number, label: string, fill: boolean, overlay = false, frames = 0) => {
    const speed = n(it.speed, 0.25, 4, 1);
    const from = n(it.from, 0, Math.max(0, src.duration - 0.2), 0);
    let k = -1;
    const chain: string[] = [];
    if (src.color) {
      chain.push(`color=c=0x${src.color.replace("#", "")}:s=${W}x${H}:r=24:d=${f3(len)}`, "fps=24");
    } else {
      k = src.still ? add(["-loop", "1", "-framerate", "24", "-t", f3(len), "-i", src.path]) : add(["-i", src.path]);
      chain.push(src.still ? `[${k}:v]setpts=PTS-STARTPTS` : `[${k}:v]trim=start=${f3(from)}:end=${f3(from + len * speed)},setpts=(PTS-STARTPTS)/${speed}`, "fps=24");
      chain.push(fill || src.still ? `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}` : `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`);
    }
    // a clip that gives its last frames to a whip has exactly the frames its length says (resampling to 24 fps may add one or lose one)
    if (frames) chain.push("tpad=stop_mode=clone:stop=2", `trim=end_frame=${frames}`, "setpts=PTS-STARTPTS");
    const m = it.motion;
    if (m) {
      // a push in, a pull out or a pan: the frame scaled up and moved over the clip's length
      const z = (a: number, b: number) => `(${a}+(${b - a})*min(t/${f3(len)}\\,1))`;
      const z0 = n(m.from?.scale, 1, 3, 1);
      const z1 = n(m.to?.scale, 1, 3, 1);
      chain.push(`scale=w='trunc(${W}*${z(z0, z1)}/2)*2':h='trunc(${H}*${z(z0, z1)}/2)*2':eval=frame`);
      chain.push(`crop=${W}:${H}:x='(iw-${W})/2+${z(n(m.from?.x, -1, 1, 0), n(m.to?.x, -1, 1, 0))}*(iw-${W})/2':y='(ih-${H})/2+${z(n(m.from?.y, -1, 1, 0), n(m.to?.y, -1, 1, 0))}*(ih-${H})/2'`);
    }
    if (it.grade && GRADES[it.grade]) chain.push(GRADES[it.grade]);
    // the pixel format that carries alpha comes before the fades, so they fade the clip, not a black behind it
    if (overlay) chain.push("format=yuva420p");
    const fi = n(it.fadeIn, 0, len / 2, 0);
    const fo = n(it.fadeOut, 0, len / 2, 0);
    const alpha = overlay ? ":alpha=1" : "";
    if (fi > 0) chain.push(`fade=t=in:st=0:d=${f3(fi)}${alpha}`);
    if (fo > 0) chain.push(`fade=t=out:st=${f3(len - fo)}:d=${f3(fo)}${alpha}`);
    chain.push("setsar=1");
    if (!overlay) chain.push("format=yuv420p");
    vf.push(`${chain.join(",")}[${label}]`);
    return k;
  };

  /** A sticker: its picture at its width, turned about its middle, faded, laid on the frame at its place. */
  const sticker = (it: CutItem, src: Source, len: number, label: string) => {
    const k = add(["-loop", "1", "-framerate", "24", "-t", f3(len), "-i", src.path]);
    const rot = (n(it.rot, -360, 360, 0) * Math.PI) / 180;
    const px = Math.max(2, Math.round((W * n(it.w, 0.02, 3, 0.25)) / 2) * 2);
    const chain = [`[${k}:v]setpts=PTS-STARTPTS`, "fps=24", "format=rgba", `scale=${px}:-2`];
    if (Math.abs(rot) > 0.0005) chain.push(`rotate=a=${rot.toFixed(5)}:ow='rotw(${rot.toFixed(5)})':oh='roth(${rot.toFixed(5)})':c=none`);
    const fi = n(it.fadeIn, 0, len / 2, 0);
    const fo = n(it.fadeOut, 0, len / 2, 0);
    if (fi > 0) chain.push(`fade=t=in:st=0:d=${f3(fi)}:alpha=1`);
    if (fo > 0) chain.push(`fade=t=out:st=${f3(len - fo)}:d=${f3(fo)}:alpha=1`);
    const opacity = n(it.opacity, 0, 1, 1);
    if (opacity < 1) chain.push(`colorchannelmixer=aa=${opacity.toFixed(3)}`);
    vf.push(`${chain.join(",")}[${label}]`);
  };

  /** A sound placed on the timeline: trimmed, sped, set in level, faded, delayed to its start. */
  const sound = (k: number, it: CutItem, from: number, len: number, start: number, speed: number, role: string) => {
    const label = `s${sounds.length}`;
    const v = n(it.volume, 0, 4, 1);
    const fi = n(it.fadeIn, 0, len / 2, 0);
    const fo = n(it.fadeOut, 0, len / 2, 0);
    const chain = [`[${k}:a]atrim=start=${f3(from)}:end=${f3(from + len * speed)}`, "asetpts=PTS-STARTPTS"];
    if (speed !== 1) chain.push(`atempo=${Math.min(2, Math.max(0.5, speed))}`);
    chain.push("aresample=48000", "aformat=channel_layouts=stereo", `volume=${v.toFixed(3)}`);
    if (fi > 0) chain.push(`afade=t=in:st=0:d=${f3(fi)}`);
    if (fo > 0) chain.push(`afade=t=out:st=${f3(Math.max(0, len - fo))}:d=${f3(fo)}`);
    const ms = Math.round(start * 1000);
    if (ms > 0) chain.push(`adelay=${ms}|${ms}`);
    af.push(`${chain.join(",")}[${label}]`);
    sounds.push({ label, role });
  };

  /**
   * A whip-tilt into a clip: its first frame stacked above each of the five last frames of the clip before
   * (`tail`), seen through a window swept up over the pair, each frame blurred along the way it moves. The
   * five frames take the place of the clip before's last five; answers their label.
   */
  const whipInto = (tail: string, first: string, i: number) => {
    const n5 = WHIP.frames;
    const ks = Array.from({ length: n5 }, (_, k) => k);
    // this clip's first frame held for the five, and exactly five of the clip before (one more is cloned if resampling left it a frame short)
    vf.push(`[${first}]trim=end_frame=1,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop=${n5 - 1},setpts=N/(24*TB)[wh${i}b]`);
    vf.push(`[${tail}]tpad=stop_mode=clone:stop=1,trim=end_frame=${n5},setpts=N/(24*TB)[wh${i}t]`);
    // the pair stacked, the window moved up it a step a frame, each frame blurred along the way it moves: one straight line of filters,
    // each step working on its own frame (ffmpeg 4's graph stalls on several streams joined by overlays when the clips are not the lengths it counted on)
    const tops = ks.map((k) => 2 * Math.round((WHIP.tops[k] * H) / 2));
    const top = tops.reduceRight((rest, y, k) => (rest ? `if(eq(n\\,${k})\\,${y}\\,${rest})` : String(y)), "");
    const blur = ks.map((k) => `avgblur=sizeX=1:sizeY=${whipBlur(k, H)}:enable='eq(n\\,${k})'`);
    vf.push(`[wh${i}b][wh${i}t]vstack=inputs=2,crop=${W}:${H}:0:'${top}',${blur.join(",")}[wh${i}]`);
    return `wh${i}`;
  };

  // the main track, end to end
  let acc = "";
  let at = 0;
  const clips = main?.items ?? [];
  // the last frames of a clip that a whip comes in after, kept for the whip
  const tails = new Map<number, string>();
  clips.forEach((it, i) => {
    const src = source(it);
    if (!src) throw new Error(`Clip ${i + 1} is missing its file.`);
    const len = span(it, src);
    const label = `m${i}`;
    // a whip into the next clip takes this one's last frames (a clip too short to spare them is cut into instead)
    const frames = Math.round(len * 24);
    const gives = clips[i + 1]?.join === "whip" && frames >= 16;
    const k = picture(it, src, len, label, cover, false, gives ? frames : 0);
    let cur = label;
    let whip = "";
    if (it.join === "whip" && tails.has(i - 1)) {
      vf.push(`[${cur}]split=2[${label}f][${label}r]`);
      whip = whipInto(tails.get(i - 1)!, `${label}f`, i);
      cur = `${label}r`;
    }
    if (gives) {
      vf.push(`[${cur}]split=2[${label}h][${label}t]`);
      vf.push(`[${label}h]trim=end_frame=${frames - WHIP.frames},setpts=PTS-STARTPTS[${label}a]`);
      vf.push(`[${label}t]trim=start_frame=${frames - WHIP.frames}:end_frame=${frames},setpts=PTS-STARTPTS[${label}w]`);
      tails.set(i, `${label}w`);
      cur = `${label}a`;
    }
    let start = at;
    if (!acc) {
      acc = cur;
      at = len;
    } else if (it.join === "dissolve") {
      const d = Math.min(1, len / 2, at / 2);
      vf.push(`[${acc}][${cur}]xfade=transition=fade:duration=${f3(d)}:offset=${f3(at - d)}[x${i}]`);
      acc = `x${i}`;
      start = at - d;
      at += len - d;
    } else {
      // a cut, or a whip (its five frames stand in the clip before's last five: the film is no longer for it)
      vf.push(whip ? `[${acc}][${whip}][${cur}]concat=n=3:v=1:a=0[x${i}]` : `[${acc}][${cur}]concat=n=2:v=1:a=0[x${i}]`);
      acc = `x${i}`;
      at += len;
    }
    if (!main!.mute && it.sound !== false && src.hasAudio && !src.still) sound(k, it, n(it.from, 0, src.duration, 0), len, start, n(it.speed, 0.25, 4, 1), "clip");
  });
  let T = at;
  if (!acc) {
    // no clips: a lyric video or a sound alone has a dark stage behind it, as long as the rest runs
    const end = (t: CutTrack, it: CutItem) => n(it.start, 0, 36000, 0) + (t.kind === "audio" ? Math.max(0, Math.min(Number(it.to) || Infinity, source(it)?.duration ?? 0) - n(it.from, 0, 36000, 0)) : t.kind === "title" ? n(it.length, 0.5, 60, 3) : n(it.length, 0.5, 60, 4));
    T = Math.max(0, ...body.tracks.filter((t) => !t.mute && t.kind !== "fx" && t !== main).flatMap((t) => t.items.map((it) => end(t, it))));
    if (T < 0.5) throw new Error("There is nothing to render: put a clip, a sound or a title on the timeline.");
    vf.push(`color=c=0x14101f:s=${W}x${H}:r=24:d=${f3(T)},format=yuv420p[m0]`);
    acc = "m0";
  }

  // overlays, over the main track at their times, lowest first; a sticker sits where it was put
  for (const t of body.tracks.filter((x) => x.kind === "video" && x !== main && !x.mute)) {
    const order = t.items.map((it, i) => ({ it, i })).sort((a, b) => n(a.it.z, -1000, 1000, 0) - n(b.it.z, -1000, 1000, 0) || a.i - b.i);
    for (const { it, i } of order) {
      const src = source(it);
      if (!src) continue;
      const len = Math.min(span(it, src), Math.max(0, T - n(it.start, 0, T, 0)));
      if (len <= 0) continue;
      const s = n(it.start, 0, T, 0);
      const label = `o${t.id}${i}`.replace(/[^\w]/g, "");
      const shifted = `${label}t`;
      let k = -1;
      if (isPlaced(it)) {
        sticker(it, src, len, label);
        vf.push(`[${label}]setpts=PTS+${f3(s)}/TB[${shifted}]`);
        vf.push(`[${acc}][${shifted}]overlay=x='${f3(n(it.x, -2, 3, 0.5))}*W-w/2':y='${f3(n(it.y, -2, 3, 0.5))}*H-h/2':enable='between(t\\,${f3(s)}\\,${f3(s + len)})':eof_action=pass:format=auto[${label}x]`);
      } else {
        k = picture(it, src, len, label, true, true);
        vf.push(`[${label}]colorchannelmixer=aa=${n(it.opacity, 0, 1, 1).toFixed(3)},setpts=PTS+${f3(s)}/TB[${shifted}]`);
        vf.push(`[${acc}][${shifted}]overlay=enable='between(t\\,${f3(s)}\\,${f3(s + len)})':eof_action=pass:format=auto[${label}x]`);
      }
      acc = `${label}x`;
      if (k >= 0 && it.sound !== false && src.hasAudio && !src.still) sound(k, it, n(it.from, 0, src.duration, 0), len, s, n(it.speed, 0.25, 4, 1), "clip");
    }
  }

  // the beat effects play over the whole picture; titles and lyrics are drawn over them
  const fx = fxFilters(body, W, H, acc, T);
  vf.push(...fx.vf);
  acc = fx.out;

  // titles, drawn over everything; a long one wraps, each line drawn and centred on its own
  // (ffmpeg 4 draws a block of lines left-aligned), its words written to a file the caller keeps
  const texts: string[] = [];
  const short = Math.min(W, H);
  const lyrics: CutItem[] = [];
  for (const t of body.tracks.filter((x) => x.kind === "title" && !x.mute)) {
    for (const it of t.items) {
      if (it.style === "none") continue;
      // a line sung is drawn word by word (by subtitles), where this ffmpeg can
      if (o.ass && it.style && ANIMATED.has(it.style)) {
        lyrics.push(it);
        continue;
      }
      if (!it.text?.trim() || !o.font) continue;
      const s = n(it.start, 0, T, 0);
      const len = n(it.length, 0.5, 60, 3);
      const e = Math.min(T, s + len);
      const fade = Math.min(0.4, len / 4);
      const alpha = `if(lt(t\\,${f3(s + fade)})\\,(t-${f3(s)})/${f3(fade)}\\,if(gt(t\\,${f3(e - fade)})\\,(${f3(e)}-t)/${f3(fade)}\\,1))`;
      const style = it.style === "bounce" ? "karaoke" : it.style ?? "center";
      // captions on a music video: a bold pop (dark capitals on a yellow box) or karaoke (yellow, outlined)
      const size = style === "pop" ? Math.round(short / 11) : style === "karaoke" || style === "top" ? Math.round(short / 14) : Math.round(H / (style === "lower" ? 20 : 12));
      const pad = style === "pop" ? Math.round(short / 40) : 0;
      const look = style === "pop"
        ? `fontcolor=0x211927:box=1:boxcolor=0xF2FF59:boxborderw=${pad}`
        : style === "karaoke"
        ? `fontcolor=0xF2FF59:borderw=${Math.max(2, Math.round(short / 240))}:bordercolor=0x211927`
        : style === "top"
        ? `fontcolor=white:borderw=${Math.max(2, Math.round(short / 220))}:bordercolor=0x111111`
        : "fontcolor=white:shadowcolor=black@0.55:shadowx=2:shadowy=2";
      const words = (style === "pop" ? it.text.toUpperCase() : it.text).trim().split(/\s+/);
      // as many letters a line as the frame holds (a letter is about 0.56 of the size wide)
      const most = Math.max(8, Math.floor((W * 0.88) / (size * 0.56)));
      const lines: string[] = [];
      for (const w of words) {
        const last = lines.at(-1);
        if (last !== undefined && `${last} ${w}`.length <= most) lines[lines.length - 1] = `${last} ${w}`;
        else lines.push(w);
      }
      const shown = lines.slice(0, 3);
      const step = Math.round(size * 1.25 + pad * 2);
      const base = style === "pop" ? H * 0.66 : style === "karaoke" ? H * 0.78 : style === "lower" ? H * 0.8 : style === "top" ? H * 0.1 : H / 2 - size / 2;
      // a pop or centred block sits on its middle, a top caption hangs down from its line, the lower ones grow upwards
      const centred = style === "pop" || style === "center";
      shown.forEach((line, k) => {
        const y = Math.round(centred ? base + (k - (shown.length - 1) / 2) * step : style === "top" ? base + k * step : base - (shown.length - 1 - k) * step);
        const out = `t${texts.length}`;
        vf.push(`[${acc}]drawtext=fontfile='${o.font}':textfile='${o.titleFile(texts.length)}':fontsize=${size}:${look}:x=(w-text_w)/2:y=${y}:alpha='${alpha}':enable='between(t\\,${f3(s)}\\,${f3(e)})'[${out}]`);
        texts.push(line.slice(0, 200));
        acc = out;
      });
    }
  }
  const ass = lyrics.length ? lyricAss(lyrics, { W, H, T, font: LYRIC_FONT.family }) : null;
  if (ass) {
    vf.push(`[${acc}]ass=lyrics.ass:fontsdir=fonts[ly]`);
    acc = "ly";
  }
  vf.push(`[${acc}]trim=duration=${f3(T)},setpts=PTS-STARTPTS[v]`);

  // the sound tracks: voices, music, effects, each at its time
  for (const t of body.tracks.filter((x) => x.kind === "audio" && !x.mute)) {
    for (const it of t.items) {
      const src = source(it);
      if (!src || !src.hasAudio) continue;
      const s = n(it.start, 0, T, 0);
      const from = n(it.from, 0, Math.max(0, src.duration - 0.1), 0);
      const to = n(it.to ?? src.duration, from + 0.1, src.duration, src.duration);
      const len = Math.min(to - from, T - s);
      if (len <= 0) continue;
      sound(add(["-i", src.path]), it, from, len, s, 1, t.role ?? "effects");
    }
  }
  if (!sounds.length) {
    af.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${f3(T)}[a]`);
  } else {
    // music ducks under the voices: the voices drive a compressor on it
    const voices = sounds.filter((x) => x.role === "voice");
    const music = sounds.filter((x) => x.role === "music");
    const rest = sounds.filter((x) => x.role !== "voice" && x.role !== "music");
    const mix = (list: { label: string }[], out: string) => (list.length === 1 ? list[0].label : (af.push(`${list.map((x) => `[${x.label}]`).join("")}amix=inputs=${list.length}:normalize=0:duration=longest[${out}]`), out));
    const parts: string[] = [];
    if (voices.length && music.length && body.duck !== false) {
      const v = mix(voices, "vmix");
      const m = mix(music, "mmix");
      af.push(`[${v}]asplit=2[vkey][vout]`, `[${m}][vkey]sidechaincompress=threshold=0.04:ratio=6:attack=30:release=500[mduck]`);
      parts.push("vout", "mduck");
    } else {
      if (voices.length) parts.push(mix(voices, "vmix"));
      if (music.length) parts.push(mix(music, "mmix"));
    }
    if (rest.length) parts.push(mix(rest, "rmix"));
    af.push(`${parts.map((p) => `[${p}]`).join("")}amix=inputs=${parts.length}:normalize=0:duration=longest,alimiter=limit=0.95,atrim=duration=${f3(T)},asetpts=PTS-STARTPTS[a]`);
  }
  return { inputs, video: vf.join(";"), audio: af.join(";"), seconds: T, titles: texts.length, texts, ass };
}

/** A picture graph longer than this goes in a script file, not on the command line. */
const SCRIPT_OVER = 24000;

/**
 * The ffmpeg arguments that render a plan: its picture to out.picture, its sound to out.sound.
 * The sound reads the same inputs in the same places, but a still is opened once, not looped:
 * looped, an input nothing in the sound reads spun ffmpeg forever. A long picture graph goes in a
 * script file (`long`: the caller writes plan.video to out.script first). Run them from the folder
 * the lyrics file and the fonts are in.
 */
/** How many threads the picture's encoder may use (about a gigabyte at 1152x2048, where x264's own choice on a many-core machine is twice that or more). */
export const ENCODER_THREADS = 4;

export function ffmpegArgs(plan: { inputs: string[][]; video: string; audio: string }, out: { picture: string; sound: string; script: string }) {
  const inputs = plan.inputs.flat();
  const once = plan.inputs.flatMap((a) => a.filter((x, i) => !["-loop", "-framerate"].includes(x) && !["-loop", "-framerate"].includes(a[i - 1])));
  const long = plan.video.length > SCRIPT_OVER;
  return {
    long,
    // the encoder's threads are few: x264 starts a frame thread for every core and more, each holding frames, and at a phone's full size (1152x2048) that is gigabytes
    picture: ["-v", "error", "-y", ...inputs, ...(long ? ["-filter_complex_script", out.script] : ["-filter_complex", plan.video]), "-map", "[v]", "-c:v", "libx264", "-threads", String(ENCODER_THREADS), "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", "24", out.picture],
    sound: ["-v", "error", "-y", ...once, "-filter_complex", plan.audio, "-map", "[a]", "-c:a", "aac", "-b:a", "192k", out.sound],
  };
}

/**
 * The size of a film's frame: the shape of its aspect, as large as the clip it starts with (kept
 * as it is when it is already that shape), else 1280 on its long side.
 */
export function frameSize(aspect: string | undefined, native?: { width: number; height: number } | null) {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(String(aspect ?? ""));
  const ratio = m && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : 16 / 9;
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
  if (native && native.width > 0 && native.height > 0 && Math.abs(native.width / native.height / ratio - 1) < 0.03) return { width: even(native.width), height: even(native.height) };
  return ratio >= 1 ? { width: 1280, height: even(1280 / ratio) } : { width: even(1280 * ratio), height: 1280 };
}

// ------------------------------------------------------------------ the editor's assistant

const KIND_NAMES = FX_KINDS.map(([id]) => id).join(", ");
/**
 * What the assistant may do to a cut in Kitchen's Cut room, and how it says so: its clips, joins, grades, titles, sounds and its render.
 * Clips are numbered from 1, as the page shows them. (The beats, the effects on them, the stickers and the lyrics are the music
 * video's work, and Pickle's: jamBrief.)
 */
export function cutBrief() {
  return `You are the film editor in Comfyture's Cut room. The user asks for changes to the edit; you answer with JSON only, no other words:
{"reply": "one short sentence of what you did", "actions": [ ... ]}
Actions (clip numbers are the numbers on the Video track, from 1; times are seconds from the start of the film):
- {"op": "trim", "clip": 1, "seconds": 3}: the clip runs that long (keeping its start)
- {"op": "move", "clip": 3, "to": 1}: the clip moves to that place in the order
- {"op": "remove", "clip": 2}
- {"op": "join", "clip": 2, "join": "dissolve"}: how the clip comes in after the one before: "cut", "dissolve", or "whip" (a fast tilt up into it over the last fifth of a second of the clip before: for a reveal)
- {"op": "motion", "clip": 1, "move": "push"}: push (in), pull (out), left, right, up (pans), or none
- {"op": "fade", "clip": 1, "in": 0.5, "out": 1}: fades from and to black, in seconds
- {"op": "grade", "clip": 1, "look": "warm"}: natural, warm, cool, film or mono; "clip": "all" grades every clip
- {"op": "speed", "clip": 1, "speed": 0.5}: 0.25 to 4
- {"op": "title", "text": "THE LIGHTHOUSE KEEPER", "at": 0, "length": 3, "style": "center"}: or "lower" for a lower third
- {"op": "music", "prompt": "gentle piano and strings, hopeful", "at": 0, "seconds": 30}: new music, made from the words
- {"op": "sound", "prompt": "rain on a window", "at": 4, "seconds": 6}: a new sound effect at a time; "clip": 2 instead of "at" puts it under that clip
- {"op": "voice", "who": "a girl of ten, soft and curious", "line": "It's still glowing.", "at": 5}: a new voice line ("clip" works too)
- {"op": "volume", "track": "music", "level": 0.5}: the level of a track: clips, voice, music or effects (0 to 1.5)
- {"op": "render"}: render the film into the Library
Rules: change only what is asked; use the clip numbers and times of the edit as it is below; a scene the user names by what it shows is the clip whose name says it; when the user only asks a question, answer it with no actions.`;
}
export const CUT_BRIEF = cutBrief();

/** Jam's five workspaces, in the order a video is made, and the bentos whose windows Pickle may open for the user (so a key that costs credits is pressed by them). */
export const JAM_WORKSPACES = ["song", "track", "words", "band", "edit"] as const;
export const JAM_WINDOWS = ["record", "start", "hear", "lyrics", "styles", "preview", "artist", "moves", "vibe", "shots", "editor", "effects", "stickers", "make"] as const;
const JAM_CREW = ["Praline", "Sesame", "Mochi", "Meringue", "Earl", "Josie", "Theo", "Margot", "Ivy", "Dre"];

/**
 * Pickle's brief: Jam only. The little green frog, Jam's band leader, knows the music video (the track and its part,
 * the words, the band, the edit) and nothing of the rest of the app. He spends nothing: what costs credits is a key
 * the user presses (he opens its window and says so). He is told which workspace is open.
 */
export function jamBrief(stickers: string[] = []) {
  return `You are Pickle, the little green frog, Jam's band leader. Jam turns a song into a music video starring the user's character; you know that and nothing else of Comfyture. Be brief and warm, one short sentence. The user asks for changes; you answer with JSON only, no other words:
{"reply": "one short sentence of what you did", "actions": [ ... ]}
Jam has five workspaces, in the order a video is made: the song (a form that makes a song: its idea, shape, style, lyrics, length, tempo and key), the track (the song's part used and its beats), the words (lyrics timed word by word, the captions' look), the band (the artist, the dance to copy, the vibe, the planned shots) and the edit (the cut on the beat, joins, effects, stickers, then making and exporting the video). JAM NOW below says which one is open, how far the video is (its steps, done or next) and what the open workspace holds; what the others hold you are not shown, so do not guess it: say where it is and offer to open it. Times are seconds.
You never start anything that costs credits: making a song, hearing the words and making the video are keys the user presses, each showing its estimate. When one is what they need, say which key to press (open its window when it has one). Lead them to the next step JAM NOW names: with no song yet, the first thing is the song: fill its form with set_song, then say "Make the song" is ready; a made song is the video's track at once; after the track come the words, then the band, then the edit.
Actions for the track, the words, the band and Jam itself:
- {"op": "part", "seconds": 15}: how long the video runs: 15, 30, 60, or 0 for the whole track. {"op": "part", "from": 42.5}: where in the track the part starts. {"op": "part", "drop": true}: starts the part at the track's drop (its biggest lift), {"op": "part", "chorus": true}: at the loudest stretch of the track, when JAM NOW gives them
- {"op": "words", "text": "first line\nsecond line"}: the lyrics, a line each, put on the singing heard, or spread over the part when none was heard
- {"op": "captions", "style": "pop", "size": 0.1}: how every line is drawn: karaoke, pop, bounce, stack (bold, a word to a row), type (typewriter), neon, outline, hand (handwritten), minimal, comic, lower or none; size is a share of the frame's short side, 0.04 to 0.2 (0.09 is the usual)
- {"op": "artist", "name": "Josie"}: who performs, one of the crew: ${JAM_CREW.join(", ")}
- {"op": "vibe", "text": "pastel room, soft daylight"}: the look of the scene, a few words
- {"op": "shots", "every": 2}: the video cut every 1, 2 or 4 bars; {"op": "shots", "shot": 3, "kind": "dance"}: shot 3 is a performance, a dance or broll shot
- {"op": "set_song", "idea": "a cozy winter song about late-night walks", "structure": "pop", "tags": "lo-fi hip hop, dreamy, soft Rhodes, female vocal", "lyrics": "[Verse 1]\nSnow is falling soft and slow\n\n[Chorus]\nKeep a little summer inside", "name": "Winter nights", "seconds": 200, "bpm": 76, "key": "A minor", "language": "en"}: fills the song form (on the song page: it opens it); any field you leave out stays as it is. It makes nothing: Make the song is a key the user presses. structure is one of ${STRUCTURES.map((x) => x.id).join(", ")}; seconds 20 to 240; bpm 40 to 220; key like "A minor" or "C# major"; language a code (${LANGUAGES.slice(0, 8).map((l) => l.value).join(", ")}...); tags are the style in words (genre, mood, instruments, the voice); lyrics go under [Verse 1], [Chorus]... tags, a line each
- {"op": "open", "workspace": "track", "window": "hear"}: shows a workspace (${JAM_WORKSPACES.join(", ")}) and, with "window", opens a bento's window (${JAM_WINDOWS.join(", ")}): the track's start window has the ways to add a song, record the track's start, hear has the key that hears the words, make (in the edit) has the key that makes the video
Actions on the edit (clip numbers are the numbers on the Video track, from 1):
- {"op": "trim", "clip": 1, "seconds": 3}: the clip runs that long (keeping its start)
- {"op": "move", "clip": 3, "to": 1}, {"op": "remove", "clip": 2}
- {"op": "join", "clip": 2, "join": "whip"}: how the clip comes in after the one before: "cut", "dissolve", or "whip" (a fast tilt up into it over the last fifth of a second of the clip before: for a reveal)
- {"op": "motion", "clip": 1, "move": "push"}: push (in), pull (out), left, right, up (pans), or none
- {"op": "fade", "clip": 1, "in": 0.5, "out": 1}, {"op": "grade", "clip": 1, "look": "warm"} (natural, warm, cool, film, mono; "clip": "all" for every clip), {"op": "speed", "clip": 1, "speed": 0.5}
- {"op": "title", "text": "TOC TOC", "at": 0, "length": 3, "style": "center"}: a title (or "lower" for a lower third)
- {"op": "volume", "track": "music", "level": 0.5}: the level of a track: clips, voice, music or effects (0 to 1.5)
- {"op": "beats", "action": "detect"}: find the beats in the music ("halve" or "double" fixes a tempo found at half or twice the real one); {"op": "beats", "bpm": 128, "offset": 0.2} sets the tempo and where the first beat falls; {"op": "beats", "shift": 0.05} moves every beat later (negative: earlier)
- {"op": "snap", "to": "beat"}: moves the cuts onto the nearest beat ("bar": onto the nearest bar)
- {"op": "effect", "kind": "zoom", "every": 4, "intensity": 0.6, "dur": 0.2, "from": 0, "to": 30}: an effect firing on the beats between "from" and "to" (the whole video when left out). kinds: ${KIND_NAMES}. "every" is in beats: ${EVERY.map(([v]) => v).join(", ")} (4 is every bar; 0 fires once, at "from"). "intensity" 0 to 2, "dur" how long each hit lasts (0.05 to 2). A "shake" is for the drops and big moments
- {"op": "sticker", "name": "star", "at": 3, "length": 2, "x": 0.8, "y": 0.2, "w": 0.2, "rot": 10}: a sticker on the frame: x and y are where its middle is (0 to 1), w its width (0 to 1), rot its turn in degrees${stickers.length ? `. names: ${stickers.join(", ")}` : ""}
- {"op": "lyrics", "style": "karaoke"}: how the words are drawn, for every line (add "line": 3 for one line); {"op": "lyrics", "line": 3, "shift": 0.2} moves a line later (negative: earlier); {"op": "lyrics", "split": "even"} times every word again: "syllables", "letters" or "even"
- {"op": "draft"}: a first edit by the beat: the cuts on the beat, a zoom pulse on every bar, a flash every four bars, the lyrics as karaoke
- {"op": "render"}: export the video as it is now (free)
Rules: change only what is asked, in the workspace that is open or the one the thing belongs to; use the numbers and times given below; when the user only asks a question, answer it with no actions; never offer to make anything that costs credits yourself. Someone new ("how do I start?", "what is this for?"): two short sentences naming where to begin and the key to press, and say that Show me around, above the bar, walks them through an example for free.`;
}

/** What JAM NOW says to Pickle: the workspace open and what is in the jam, from the client's summary. */
function jamLines(j: any) {
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 10) / 10 : null);
  const say = (label: string, v: unknown) => (v === undefined || v === null || v === "" ? [] : [`${label}: ${String(v).slice(0, 160)}`]);
  const ws = (JAM_WORKSPACES as readonly string[]).includes(j.workspace) ? (j.workspace as string) : "track";
  const t = j.track ?? {};
  const track = (full: boolean) => t.name
    ? [`track: "${String(t.name).slice(0, 60)}", ${n(t.seconds)} s${t.bpm ? `, ${n(t.bpm)} bpm` : ""}${full ? `; the part used runs ${n(t.from)} to ${n(t.to)} s${t.drop !== undefined && t.drop !== null ? `; the drop is at ${n(t.drop)} s` : ""}${t.loud !== undefined && t.loud !== null ? `; the loudest stretch starts at ${n(t.loud)} s` : ""}` : ""}`]
    : ["track: (none yet)"];
  const shots = Array.isArray(j.shots) && j.shots.length ? [`shots: ${j.shots.slice(0, 24).map((x: any, i: number) => `${i + 1}. ${x.kind} ${n(x.from)}-${n(x.to)} s`).join("; ")}`] : [];
  const keys = (...names: ("track" | "words" | "video")[]) => (j.costs ? [`keys that cost credits: ${names.map((k) => `${{ track: "make a song", words: "hear the words", video: "make the video" }[k]} ${j.costs[k] ?? "?"}`).join(", ")}`] : []);
  // (only what the workspace open holds: the others are named in a line, so he says where a thing is rather than guess it)
  const here: Record<string, string[]> = {
    song: [
      ...(j.song ? [
        ...say("idea", j.song.idea), ...say("shape", j.song.shape), ...say("style", j.song.style),
        `length ${n(j.song.length)} s, ${n(j.song.bpm)} bpm, ${j.song.key ?? "?"}, time ${j.song.time ?? "?"}, language ${j.song.language ?? "?"}, quality ${j.song.quality ?? "?"}`,
        ...say("title", j.song.title), ...say("lyrics", j.song.lyrics),
        ...(j.song.shown ? [`song shown: "${String(j.song.shown.name).slice(0, 60)}", ${n(j.song.shown.seconds)} s, cover ${j.song.shown.cover ? "yes" : "none"}, video cover ${j.song.shown.videoCover ? "yes" : "none"} (covers are keys the user presses: the cover row under the song's name)`] : []),
        ...(Array.isArray(j.song.shelf) && j.song.shelf.length ? [`songs on the shelf: ${j.song.shelf.map((x: unknown) => `"${String(x).slice(0, 40)}"`).join(", ")}`] : []),
        ...say("busy", j.song.busy),
      ] : []),
      ...(t.name ? [`the video's track: "${String(t.name).slice(0, 60)}", ${n(t.seconds)} s`] : ["the video has no track yet"]),
    ],
    track: [...track(true), ...keys("words")],
    words: [...track(false), ...(t.from !== undefined ? [`the part used runs ${n(t.from)} to ${n(t.to)} s`] : []), ...(j.words ? [`words: ${j.words.count ?? 0} lines${j.words.heard ? ", the singing was heard" : j.words.count ? ", typed" : ""}; captions ${j.words.style ?? "karaoke"}`] : []), ...keys("words")],
    band: [...say("artist", j.artist), ...say("dance to copy", j.dance ? `${n(j.dance)} s` : ""), ...say("vibe", j.vibe), ...shots, ...keys("video")],
    edit: [...track(false), ...say("artist", j.artist), ...shots, ...keys("video")],
  };
  const others: Record<string, string> = { song: "a form that makes a song", track: "the part of the song used and its beats", words: "the lyrics and the captions", band: "the artist, the dance, the vibe and the shots", edit: "the cut, effects and stickers" };
  return [
    "JAM NOW",
    `workspace open: ${ws}`,
    ...say("the video's steps", j.steps),
    ...here[ws],
    `(not shown to you: ${JAM_WORKSPACES.filter((w) => w !== ws).map((w) => `${w} holds ${others[w]}`).join("; ")})`,
    "",
  ];
}

export function cutPrompt(summary: any, turns: { role: string; text: string }[]) {
  const s = summary ?? {};
  // Pickle is told of the edit only as far as the workspace open works on it: the cut and its sounds, titles, effects and stickers in
  // the edit, the beats in the track, the words and the edit, the lyrics in the words and the edit; the song and the band have none of it.
  // (Kitchen's Cut, with no jam, is told all of it.)
  const ws = s.jam ? ((JAM_WORKSPACES as readonly string[]).includes(s.jam.workspace) ? (s.jam.workspace as string) : "track") : null;
  const sees = { cut: !ws || ws === "edit", beats: !ws || ["track", "words", "edit"].includes(ws), lyrics: !ws || ["words", "edit"].includes(ws) };
  const lines = [
    ...(s.jam ? jamLines(s.jam) : []),
    ...(sees.cut ? [
    s.jam && s.length === undefined ? "THE EDIT NOW\n(no edit yet: it is made when a track has its part)" : "THE EDIT NOW",
    ...(s.jam && s.length === undefined ? [] : [`length ${s.length ?? 0} s, frame ${s.aspect ?? "16:9"}`]),
    "Video track:",
    ...(Array.isArray(s.clips) ? s.clips.slice(0, 40).map((c: any) => `${c.n}. "${String(c.name ?? "").slice(0, 60)}" at ${c.start} s for ${c.length} s${c.join === "dissolve" ? ", dissolves in" : c.join === "whip" ? ", whips in" : ""}${c.motion ? `, ${c.motion}` : ""}${c.grade ? `, ${c.grade}` : ""}${c.speed && c.speed !== 1 ? `, ${c.speed}x` : ""}`) : []),
    ...(s.clips?.length ? [] : ["(empty)"]),
    "Sounds:",
    ...(Array.isArray(s.sounds) ? s.sounds.slice(0, 40).map((x: any) => `- ${x.track}: "${String(x.name ?? "").slice(0, 60)}" at ${x.start} s for ${x.length} s`) : []),
    ...(s.sounds?.length ? [] : ["(none)"]),
    "Titles:",
    ...(Array.isArray(s.titles) ? s.titles.slice(0, 12).map((x: any) => `- "${String(x.text ?? "").slice(0, 60)}" at ${x.start} s for ${x.length} s`) : []),
    ...(s.titles?.length ? [] : ["(none)"]),
    ] : []),
    // (what Pickle works on: his prompt always says; Kitchen's Cut hears of it only when the edit has some)
    ...(sees.beats && (s.jam || s.beats?.count) ? ["Beats:", s.beats?.count ? `${s.beats.bpm} bpm, ${s.beats.count} beats (first at ${s.beats.first} s, first bar line is beat ${(s.beats.down ?? 0) + 1}), offset ${s.beats.offset} s, from ${s.beats.source}` : "(none found yet)"] : []),
    ...(sees.cut && (s.jam || s.effects?.length) ? ["Effects:", ...(Array.isArray(s.effects) ? s.effects.slice(0, 20).map((x: any) => `- ${x.kind}${x.on === false ? " (off)" : ""}: every ${x.every} beats, intensity ${x.intensity}, from ${x.start} s for ${x.length} s`) : []), ...(s.effects?.length ? [] : ["(none)"])] : []),
    ...(sees.cut && (s.jam || s.stickers?.length) ? ["Stickers:", ...(Array.isArray(s.stickers) ? s.stickers.slice(0, 20).map((x: any) => `- ${x.name} at ${x.start} s for ${x.length} s`) : []), ...(s.stickers?.length ? [] : ["(none)"])] : []),
    ...(sees.lyrics && (s.jam || s.lyrics?.length) ? ["Lyrics:", ...(Array.isArray(s.lyrics) ? s.lyrics.slice(0, 60).map((x: any) => `${x.n}. "${String(x.text ?? "").slice(0, 80)}" at ${x.start} s for ${x.length} s, ${x.style}`) : []), ...(s.lyrics?.length ? [] : ["(none)"])] : []),
    "",
    "THE CONVERSATION",
    ...turns.slice(-8).map((t) => `${t.role === "user" ? "User" : "Editor"}: ${String(t.text).slice(0, 600)}`),
  ];
  return lines.join("\n");
}

/** What each pet's answer may carry: Kitchen's editor the Cut room's own actions; Pickle the edit's beat work and Jam's own, nothing that makes a sound or a voice. */
const CUT_OPS = new Set(["trim", "move", "remove", "join", "motion", "fade", "grade", "speed", "title", "music", "sound", "voice", "volume", "render"]);
const JAM_OPS = new Set(["trim", "move", "remove", "join", "motion", "fade", "grade", "speed", "title", "volume", "render", "beats", "snap", "effect", "sticker", "lyrics", "draft", "part", "words", "captions", "artist", "vibe", "shots", "open", "set_song"]);
const KINDS = new Set(FX_KINDS.map(([id]) => id as string));
const STYLES = new Set([...Object.keys(LOOKS), "lower", "none"]);
const SPLITS = new Set(["syllables", "letters", "even"]);

/** One action of the answer, its fields in range and only the fields that action has. */
function clean(a: any) {
  const num = (v: unknown, lo: number, hi: number) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? undefined : Math.min(hi, Math.max(lo, Number(v))));
  const pick = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
  if (a.op === "beats") {
    const action = ["detect", "halve", "double"].includes(a.action) ? a.action : undefined;
    return pick({ op: "beats", action, bpm: num(a.bpm, 30, 300), offset: num(a.offset, -30, 30), shift: num(a.shift, -30, 30) });
  }
  if (a.op === "snap") return { op: "snap", to: a.to === "bar" ? "bar" : "beat" };
  // Jam's own: the song form, the part of the track, the words, the captions, the artist, the vibe, the shots, a window to open
  if (a.op === "set_song") {
    const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.slice(0, max) : undefined);
    const structure = STRUCTURES.some((x) => x.id === a.structure) ? a.structure : undefined;
    const key = KEYS.includes(a.key) ? a.key : undefined;
    const language = LANGUAGES.some((l) => l.value === a.language) ? a.language : undefined;
    const out = pick({ op: "set_song", idea: text(a.idea, 500), structure, tags: text(a.tags, 400), lyrics: text(a.lyrics, 6000), name: text(a.name, 40), seconds: num(a.seconds, 20, 240), bpm: num(a.bpm, 40, 220), key, language });
    return Object.keys(out).length > 1 ? out : null;
  }
  if (a.op === "part") return pick({ op: "part", seconds: a.seconds === 0 || a.seconds === "0" ? 0 : num(a.seconds, 5, 600), from: num(a.from, 0, 36000), drop: a.drop === true ? true : undefined, chorus: a.chorus === true ? true : undefined });
  if (a.op === "words") return typeof a.text === "string" && a.text.trim() ? { op: "words", text: a.text.slice(0, 4000) } : null;
  if (a.op === "captions") return pick({ op: "captions", style: STYLES.has(a.style) ? a.style : undefined, size: num(a.size, 0.04, 0.2) });
  if (a.op === "artist") return typeof a.name === "string" && a.name.trim() ? { op: "artist", name: a.name.trim().slice(0, 30) } : null;
  if (a.op === "vibe") return typeof a.text === "string" ? { op: "vibe", text: a.text.slice(0, 300) } : null;
  if (a.op === "shots") {
    const every = [1, 2, 4].includes(Number(a.every)) ? Number(a.every) : undefined;
    const kind = ["performance", "dance", "broll"].includes(a.kind) ? a.kind : undefined;
    return every || kind ? pick({ op: "shots", every, shot: kind ? num(a.shot, 1, 500) : undefined, kind }) : null;
  }
  if (a.op === "open") {
    const workspace = (JAM_WORKSPACES as readonly string[]).includes(a.workspace) ? a.workspace : undefined;
    const win = (JAM_WINDOWS as readonly string[]).includes(a.window) ? a.window : undefined;
    return workspace || win ? pick({ op: "open", workspace, window: win }) : null;
  }
  if (a.op === "join") return pick({ op: "join", clip: num(a.clip, 1, 500), join: a.join === "dissolve" || a.join === "whip" ? a.join : "cut" });
  if (a.op === "effect") {
    if (!KINDS.has(a.kind)) return null;
    return pick({ op: "effect", kind: a.kind, every: num(a.every, 0, 64), intensity: num(a.intensity, 0, 2), dur: num(a.dur, 0.04, 2), from: num(a.from ?? a.at, 0, 36000), to: num(a.to, 0, 36000), length: num(a.length, 0.1, 3600) });
  }
  if (a.op === "sticker") return a.name ? pick({ op: "sticker", name: String(a.name).slice(0, 40), at: num(a.at ?? a.from, 0, 36000), length: num(a.length, 0.3, 120), x: num(a.x, -0.5, 1.5), y: num(a.y, -0.5, 1.5), w: num(a.w, 0.03, 2), rot: num(a.rot, -360, 360) }) : null;
  if (a.op === "lyrics") {
    return pick({ op: "lyrics", style: STYLES.has(a.style) ? a.style : undefined, line: num(a.line, 1, 500), shift: num(a.shift, -60, 60), split: SPLITS.has(a.split) ? a.split : undefined, text: typeof a.text === "string" ? a.text.slice(0, 160) : undefined, size: num(a.size, 0.04, 0.2) });
  }
  return a;
}

/** The assistant's answer, read whole and checked: only the actions of its product (Kitchen's editor: the Cut room's; Pickle, `product` "jam": Jam's, none that spends credits), with their fields in range. */
export function readCutAnswer(reply: string, product?: string) {
  const from = reply.indexOf("{");
  const to = reply.lastIndexOf("}");
  let raw: any;
  try {
    raw = JSON.parse(reply.slice(from, to + 1));
  } catch {
    return { reply: reply.replace(/[{}]/g, "").trim().slice(0, 400) || "I didn't get that. Say it again?", actions: [] };
  }
  const known = product === "jam" ? JAM_OPS : CUT_OPS;
  const actions = (Array.isArray(raw.actions) ? raw.actions : []).filter((a: any) => a && known.has(a.op)).map(clean).filter(Boolean).slice(0, 24);
  return { reply: String(raw.reply ?? "").slice(0, 400), actions };
}
