// A Cut's timeline as ffmpeg graphs. The main video track plays its clips end to end (each cut or
// dissolved into the one before), each trimmed, sped, moved (a push in, a pan) and faded; overlays
// sit over it at their times; titles are drawn text. Every sound — the clips' own, voices, music,
// effects — is trimmed, faded and placed at its time, music ducking under the voices, then mixed.
// Picture and sound are two graphs, rendered apart and joined after (one graph that holds both
// makes ffmpeg 4 drop and repeat frames at the joins).

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
  join?: "cut" | "dissolve";
  text?: string;
  style?: "center" | "lower";
  grade?: string;
}
export interface CutTrack { id: string; kind: "video" | "audio" | "title"; main?: boolean; mute?: boolean; role?: "voice" | "music" | "effects"; items: CutItem[] }
export interface CutBody { tracks: CutTrack[]; duck?: boolean }
/** A source on disk, as the server found it. */
export interface Source { path: string; still: boolean; hasAudio: boolean; duration: number }

const n = (v: unknown, lo: number, hi: number, d: number) => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d;
};
const f3 = (x: number) => x.toFixed(3);
// colour looks, each one filter
export const GRADES: Record<string, string> = {
  natural: "",
  warm: "colorbalance=rs=.06:gs=.02:bs=-.06:rm=.04:bm=-.04,eq=saturation=1.08",
  cool: "colorbalance=rs=-.05:bs=.07:rm=-.03:bm=.05,eq=saturation=.98",
  mono: "hue=s=0,eq=contrast=1.08",
  film: "curves=preset=medium_contrast,colorbalance=rs=.03:bs=-.02:bh=.04,eq=saturation=.92",
};

/**
 * The plan for one film: its inputs (ffmpeg arguments, in order), the picture and sound graphs, and
 * how long it runs. source(item) says where an item's file is; titles are written to files by the
 * caller (titleFile(i) names them), so no text needs escaping.
 */
export function planCut(body: CutBody, source: (item: CutItem) => Source | null, o: { width: number; height: number; font: string | null; titleFile: (i: number) => string }) {
  const W = o.width - (o.width % 2);
  const H = o.height - (o.height % 2);
  const inputs: string[][] = [];
  const vf: string[] = [];
  const af: string[] = [];
  const add = (args: string[]) => inputs.push(args) - 1;
  const main = body.tracks.find((t) => t.kind === "video" && t.main) ?? body.tracks.find((t) => t.kind === "video");
  if (!main || !main.items.length) throw new Error("The main video track is empty: put a clip on it.");
  const sounds: { label: string; role: string }[] = [];

  // a clip's length on the timeline, its source checked
  const span = (it: CutItem, src: Source) => {
    if (src.still) return n(it.length ?? (it.to ?? 4) - (it.from ?? 0), 0.5, 60, 4);
    const from = n(it.from, 0, Math.max(0, src.duration - 0.2), 0);
    const to = n(it.to ?? src.duration, from + 0.2, src.duration, src.duration);
    return (to - from) / n(it.speed, 0.25, 4, 1);
  };

  /** One clip's picture: trimmed, sped, filled to the frame, moved, graded and faded; answers its label. */
  const picture = (it: CutItem, src: Source, len: number, label: string, fill: boolean) => {
    const k = src.still ? add(["-loop", "1", "-framerate", "24", "-t", f3(len), "-i", src.path]) : add(["-i", src.path]);
    const speed = n(it.speed, 0.25, 4, 1);
    const from = n(it.from, 0, Math.max(0, src.duration - 0.2), 0);
    const chain = [src.still ? `[${k}:v]setpts=PTS-STARTPTS` : `[${k}:v]trim=start=${f3(from)}:end=${f3(from + len * speed)},setpts=(PTS-STARTPTS)/${speed}`, "fps=24"];
    chain.push(fill || src.still ? `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}` : `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`);
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
    const fi = n(it.fadeIn, 0, len / 2, 0);
    const fo = n(it.fadeOut, 0, len / 2, 0);
    if (fi > 0) chain.push(`fade=t=in:st=0:d=${f3(fi)}`);
    if (fo > 0) chain.push(`fade=t=out:st=${f3(len - fo)}:d=${f3(fo)}`);
    chain.push("setsar=1", "format=yuv420p");
    vf.push(`${chain.join(",")}[${label}]`);
    return k;
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

  // the main track, end to end
  let acc = "";
  let at = 0;
  main.items.forEach((it, i) => {
    const src = source(it);
    if (!src) throw new Error(`Clip ${i + 1} is missing its file.`);
    const len = span(it, src);
    const label = `m${i}`;
    const k = picture(it, src, len, label, false);
    let start = at;
    if (!acc) {
      acc = label;
      at = len;
    } else if (it.join === "dissolve") {
      const d = Math.min(1, len / 2, at / 2);
      vf.push(`[${acc}][${label}]xfade=transition=fade:duration=${f3(d)}:offset=${f3(at - d)}[x${i}]`);
      acc = `x${i}`;
      start = at - d;
      at += len - d;
    } else {
      vf.push(`[${acc}][${label}]concat=n=2:v=1:a=0[x${i}]`);
      acc = `x${i}`;
      at += len;
    }
    if (!main.mute && it.sound !== false && src.hasAudio && !src.still) sound(k, it, n(it.from, 0, src.duration, 0), len, start, n(it.speed, 0.25, 4, 1), "clip");
  });
  const T = at;

  // overlays, over the main track at their times
  for (const t of body.tracks.filter((x) => x.kind === "video" && x !== main && !x.mute)) {
    t.items.forEach((it, i) => {
      const src = source(it);
      if (!src) return;
      const len = Math.min(span(it, src), Math.max(0, T - n(it.start, 0, T, 0)));
      if (len <= 0) return;
      const s = n(it.start, 0, T, 0);
      const label = `o${t.id}${i}`.replace(/[^\w]/g, "");
      const k = picture(it, src, len, label, true);
      const shifted = `${label}t`;
      vf.push(`[${label}]format=yuva420p,colorchannelmixer=aa=${n(it.opacity, 0, 1, 1).toFixed(3)},setpts=PTS+${f3(s)}/TB[${shifted}]`);
      vf.push(`[${acc}][${shifted}]overlay=enable='between(t\\,${f3(s)}\\,${f3(s + len)})':eof_action=pass:format=auto[${label}x]`);
      acc = `${label}x`;
      if (it.sound !== false && src.hasAudio && !src.still) sound(k, it, n(it.from, 0, src.duration, 0), len, s, n(it.speed, 0.25, 4, 1), "clip");
    });
  }

  // titles, drawn over everything
  let titles = 0;
  for (const t of body.tracks.filter((x) => x.kind === "title" && !x.mute)) {
    for (const it of t.items) {
      if (!it.text?.trim() || !o.font) continue;
      const s = n(it.start, 0, T, 0);
      const len = n(it.length, 0.5, 60, 3);
      const e = Math.min(T, s + len);
      const fade = Math.min(0.4, len / 4);
      const alpha = `if(lt(t\\,${f3(s + fade)})\\,(t-${f3(s)})/${f3(fade)}\\,if(gt(t\\,${f3(e - fade)})\\,(${f3(e)}-t)/${f3(fade)}\\,1))`;
      const lower = it.style === "lower";
      const size = Math.round(H / (lower ? 20 : 12));
      const out = `t${titles}`;
      vf.push(`[${acc}]drawtext=fontfile='${o.font}':textfile='${o.titleFile(titles)}':fontsize=${size}:fontcolor=white:shadowcolor=black@0.55:shadowx=2:shadowy=2:x=(w-text_w)/2:y=${lower ? "h*0.8" : "(h-text_h)/2"}:alpha='${alpha}':enable='between(t\\,${f3(s)}\\,${f3(e)})'[${out}]`);
      acc = out;
      titles++;
    }
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
  return { inputs, video: vf.join(";"), audio: af.join(";"), seconds: T, titles };
}
