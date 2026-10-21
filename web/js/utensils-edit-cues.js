// Caption cues for the Edit tools: a cue is { start, end, text } in seconds. This module reads .srt and .vtt files into cues,
// writes cues back as SRT, and checks a list of cues typed or dropped in. Pure functions, no DOM: the page and the server
// import it alike.

export const MAX_CUES = 200;
export const MAX_TEXT = 200;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** "00:01:02,500", "01:02.500" or "62.5" as seconds, or null when it is not a time. */
export function seconds(text) {
  const t = String(text ?? "").trim().replace(",", ".");
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/.exec(t);
  if (m) return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

/** Seconds as an SRT timecode ("00:00:01,500"). */
export function timecode(s) {
  const ms = Math.round(Math.max(0, s) * 1000);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
}

/** The cues of an .srt or .vtt text: blocks of an optional index, a "start --> end" line and the words under it. */
export function parseCues(source) {
  const blocks = String(source ?? "").replace(/\r/g, "").replace(/^﻿/, "").split(/\n{2,}/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const at = lines.findIndex((l) => l.includes("-->"));
    if (at < 0) continue;
    const [a, b] = lines[at].split("-->").map((x) => seconds(x.trim().split(/\s+/)[0]));
    if (a === null || b === null || b <= a) continue;
    const text = lines.slice(at + 1).join("\n").replace(/<[^>]+>/g, "").replace(/\{[^}]*\}/g, "").trim();
    if (text) cues.push({ start: a, end: b, text });
  }
  return cues.slice(0, MAX_CUES);
}

/** Cues as an SRT file. */
export const toSrt = (cues) => cues.map((c, i) => `${i + 1}\n${timecode(c.start)} --> ${timecode(c.end)}\n${c.text}\n`).join("\n");

/** A list of cues made safe: numbers in range, text short and free of markup, in time order, none empty. */
export function cleanCues(list, duration = 3600) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const c of list.slice(0, MAX_CUES)) {
    const start = clamp(Number(c?.start), 0, duration);
    const end = clamp(Number(c?.end), 0, duration);
    const text = String(c?.text ?? "").replace(/[{}]/g, "").replace(/\r/g, "").trim().slice(0, MAX_TEXT);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start && text) out.push({ start: Math.round(start * 1000) / 1000, end: Math.round(end * 1000) / 1000, text });
  }
  return out.sort((a, b) => a.start - b.start);
}
