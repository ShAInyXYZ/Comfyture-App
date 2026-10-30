/* Comfyture's website: the hero's song, clips that play while they are seen, the compare wipes, Kitchen's rooms, the dock,
   the presets rail, the gallery and its viewer. Plain JavaScript, no build step. */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const icon = (id) => `<svg class="i"><use href="#${id}"/></svg>`;
const DEMO = "demo/";

/* ── the bar gets a line once the page moves ── */
const bar = $("#top");
const onScroll = () => bar.classList.toggle("stuck", scrollY > 8);
addEventListener("scroll", onScroll, { passive: true }); onScroll();

/* ── clips that load when near and play while seen ── */
const clips = new IntersectionObserver((es) => es.forEach((e) => {
  const v = e.target;
  if (e.isIntersecting) {
    if (!v.getAttribute("src") && v.dataset.src) v.src = v.dataset.src;
    if (!reduce && !v.dataset.held) v.play().catch(() => {});
  } else v.pause();
}), { rootMargin: "240px 0px", threshold: 0.12 });
const watch = (v) => clips.observe(v);
$$("video.lazy").forEach(watch);

/* ── reveals ── */
const shown = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); shown.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
$$("[data-r]").forEach((el) => {
  const sibs = [...el.parentElement.children].filter((c) => c.hasAttribute("data-r"));
  el.style.setProperty("--d", `${Math.min(sibs.indexOf(el), 5) * 70}ms`);
  shown.observe(el);
});

/* ── the open-weights ticker ── */
const MODELS = ["LTX-2.5", "Qwen Image 2.1", "ACE-Step 1.5", "Gemma 4", "SAM3", "Depth Anything 3", "Pixal3D", "FLUX 3 Klein", "Krea 2 Turbo", "Z-Image Turbo",
  "Stable Audio 3", "Demucs", "Whisper", "BiRefNet", "SeedVR2", "4x-UltraSharp", "FILM", "VOID"];
$("#ticker").innerHTML = [...MODELS, ...MODELS].map((m) => `<span>${m}</span>`).join("");

/* ── the hero: Praline Lo-Fi's loop plays while seen, its song on demand, each line's words lit as they are sung ── */
const reel = $("#reel"), song = $("#song"), lyric = $("#lyric"), seek = $("#seek"), clock = $("#clock");
const LINES = [ // start in the song, then each word with its own start and end in the line (from the edit's karaoke titles)
  [21, [["窓の向こう", 0, 2.61], ["雨のリズム", 2.61, 5.22]]],
  [26.22, [["ノートの端に", 0, 2.68], ["小さな落書き", 2.68, 5.36]]],
  [32.37, [["あたたかいお茶", 0, 2.08], ["湯気がゆれて", 2.08, 4.15]]],
  [37.22, [["時計の針も", 0, 2.18], ["ゆっくり歩く", 2.18, 4.36]]],
  [42.5, [["ヘッドフォンの中", 0, 2.38], ["やさしい夜", 2.38, 4.76]]],
  [48.22, [["眠い目こすって", 0, 2.63], ["ページをめくる", 2.63, 5.26]]],
  [53.48, [["街の灯りが", 0, 2.28], ["にじんで見える", 2.28, 4.56]]],
  [58.04, [["まだ少しだけ", 0, 2.87], ["ここにいたい", 2.87, 5.74]]],
  [64.32, [["ゆっくりでいいよ", 0, 2.28], ["急がなくていい", 2.28, 4.56]]],
  [69.38, [["今夜の音に", 0, 2.11], ["包まれて", 2.11, 4.22]]],
  [74.68, [["明日のことは", 0, 2.58], ["明日に任せて", 2.58, 5.16]]],
  [79.84, [["このページだけ", 0, 2.64], ["読み終えよう", 2.64, 5.28]]],
  [106.98, [["消しゴムのかす", 0, 2.18], ["机の上", 2.18, 4.36]]],
  [111.34, [["書きかけの夢", 0, 2.62], ["まだ途中でも", 2.62, 5.24]]],
  [118.52, [["しっぽをまるめて", 0, 1.93], ["深呼吸して", 1.93, 3.86]]],
  [122.91, [["ひとつずつでいい", 0, 2.23], ["前に進む", 2.23, 4.45]]],
  [128.2, [["ゆっくりでいいよ", 0, 2.51], ["急がなくていい", 2.51, 5.02]]],
  [133.22, [["今夜の音に", 0, 2.11], ["包まれて", 2.11, 4.22]]],
  [138.3, [["明日のことは", 0, 2.64], ["明日に任せて", 2.64, 5.28]]],
  [144.08, [["このページだけ", 0, 2.2], ["読み終えよう", 2.2, 4.4]]],
  [154.46, [["雨がやむころ", 0, 2.01], ["またね", 2.01, 4.02]]],
  [158.48, [["おやすみ", 0, 5.76], ["やさしい夜", 5.76, 11.51]]]
];
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
let line = -1;
function paint() {
  const t = song.currentTime, len = song.duration || +seek.max;
  if (document.activeElement !== seek) seek.value = t;
  seek.style.setProperty("--p", `${(t / len) * 100}%`);
  clock.textContent = `${mmss(t)} / ${mmss(len)}`;
  let k = LINES.findIndex(([at, w]) => t < at + w.at(-1)[2]); // the line being sung, or the next one
  if (k < 0) k = LINES.length - 1;
  if (k !== line) {
    line = k;
    lyric.replaceChildren(...LINES[k][1].map(([w]) => Object.assign(document.createElement("span"), { className: "w", textContent: w })));
  }
  const [at, ws] = LINES[k];
  $$(".w", lyric).forEach((s, i) => s.style.setProperty("--p", `${Math.max(0, Math.min(1, (t - at - ws[i][1]) / (ws[i][2] - ws[i][1]))) * 100}%`));
}
let raf = 0;
const tick = () => { paint(); raf = song.paused ? 0 : requestAnimationFrame(tick); };
song.addEventListener("play", () => { if (!raf) raf = requestAnimationFrame(tick); setSound(true); });
song.addEventListener("pause", () => setSound(false));
song.addEventListener("timeupdate", () => { if (!raf) paint(); });
song.addEventListener("loadedmetadata", paint);
seek.addEventListener("input", () => { song.currentTime = +seek.value; paint(); });
const playBtn = $("#reel-play"), soundBtn = $("#reel-sound");
function setPlay(on) { playBtn.innerHTML = icon(on ? "pause" : "play"); playBtn.setAttribute("aria-label", on ? "Pause" : "Play"); }
function setSound(on) {
  soundBtn.innerHTML = icon(on ? "sound-on" : "sound-off");
  soundBtn.setAttribute("aria-pressed", String(on));
  soundBtn.setAttribute("aria-label", on ? "Stop the song" : "Play the song");
  $(".now").classList.toggle("live", on);
}
reel.addEventListener("play", () => setPlay(true));
reel.addEventListener("pause", () => setPlay(false));
let held = reduce, songWas = false; // held: paused by hand (or reduced motion); songWas: the song played when Pause was pressed
const play = () => { held = false; reel.play().catch(() => {}); };
playBtn.addEventListener("click", () => {
  if (reel.paused) { play(); if (songWas) song.play().catch(() => {}); }
  else { held = true; songWas = !song.paused; reel.pause(); song.pause(); }
});
soundBtn.addEventListener("click", () => { if (song.paused) { song.play().catch(() => {}); play(); } else song.pause(); });
new IntersectionObserver(([e]) => { if (e.isIntersecting) { if (!held) reel.play().catch(() => {}); } else reel.pause(); }, { threshold: 0.2 }).observe(reel);
setPlay(false); setSound(false); paint();

/* ── sound on a clip ── */
$$("[data-sound]").forEach((b) => b.addEventListener("click", () => {
  const v = document.getElementById(b.dataset.sound);
  if (!v.getAttribute("src")) v.src = v.dataset.src;
  v.muted = !v.muted; v.dataset.held = "";
  if (!v.muted) { v.currentTime = 0; v.play().catch(() => {}); }
  b.setAttribute("aria-pressed", String(!v.muted));
  b.innerHTML = `${icon(v.muted ? "sound-off" : "sound-on")}<span>${v.muted ? "Play with sound" : "Sound on"}</span>`;
}));

/* ── compare wipes: drag (or arrow keys) the line; the pickers change the pictures ── */
$$(".wipe").forEach((w) => {
  const r = $("input", w);
  if (!r) return;
  const set = (x) => w.style.setProperty("--x", `${x}%`);
  r.addEventListener("input", () => { w.dataset.touched = "1"; set(r.value); });
  if (reduce) return;
  // a first sweep when it comes into view, so it reads as something to drag
  new IntersectionObserver(([e], o) => {
    if (!e.isIntersecting) return; o.disconnect();
    // (around where it rests, read once: a picker may set that, so the effect is in view when it stops)
    const t0 = performance.now(), rest = Number(w.dataset.rest ?? r.value);
    const step = (t) => {
      if (w.dataset.touched) return;
      const p = Math.min(1, (t - t0) / 1600);
      const x = Math.max(2, Math.min(98, rest + 32 * Math.sin(p * Math.PI * 2) * (1 - p)));
      set(x.toFixed(2)); r.value = x;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, { threshold: 0.5 }).observe(w);
});
/* a wipe of two clips: the take (a) is kept on the comp's (b) time, so the line divides one moment; it plays when the comp does */
$$(".wipe").forEach((w) => {
  const a = $("video.a", w), b = $("video.b", w);
  if (!a || !b) return;
  // (a seek asked before the take knows its length is dropped: it is asked again once it does, and after any jump of the comp's)
  const sync = () => { if (a.readyState >= 1 && Math.abs(a.currentTime - b.currentTime) > 0.06) a.currentTime = b.currentTime; };
  b.addEventListener("timeupdate", sync);
  b.addEventListener("seeked", sync);
  a.addEventListener("loadedmetadata", sync);
  a.addEventListener("canplay", sync);
  b.addEventListener("play", () => { sync(); a.play().catch(() => {}); });
  b.addEventListener("pause", () => a.pause());
});
$$(".picker").forEach((pk) => {
  const box = pk.closest(".compare"), w = $(".wipe", box), cap = $(".cap", box);
  $$("button", pk).forEach((b) => b.addEventListener("click", () => {
    $$("button", pk).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    const a = $("img.a", w), bb = $("img.b", w);
    a.src = b.dataset.a; bb.src = b.dataset.b;
    a.alt = `Before: ${b.textContent.trim()}`; bb.alt = `After: ${b.textContent.trim()}`;
    if (cap) cap.textContent = b.dataset.cap;
    // each example rests where its effect is seen
    if (b.dataset.x) { const r = $("input", w); w.dataset.rest = b.dataset.x; w.style.setProperty("--x", `${b.dataset.x}%`); if (r) r.value = b.dataset.x; }
  }));
});

/* ── Kitchen's rooms ── */
const ROOMS = {
  story: { img: "media/app/story.webp", cap: "Story: the film's scenes and shots on the left, each shot's workspace in the middle (what happens, its visual direction, ideas and images), its references on the right.", alt: "Story with A Little Jar, A Full Table open: the scenes and shots, the shot workspace of A little jar, and its references" },
  stage: { img: "media/app/stage.webp", cap: "Stage: block a scene with mannequins and 372 set pieces, then render its frame: the picture laid over the clay, a compare bar between them.", alt: "The Stage: a campfire night blocked with mannequins, its render laid over the clay frame with a compare bar" },
  shot: { img: "media/app/shot.webp", cap: "Shot: the inputs (start frame, end frame, keyframes, references, sound), the script and its camera, the presets and the take log; one to four takes, picture and sound together.", alt: "The Shot desk: the inputs, the script, the presets and the take log" },
  cut: { img: "media/app/cut.webp", cap: "Cut: the media bin, the monitor and the timeline, with A Little Jar, A Full Table open; it makes what is missing: music with ACE-Step, sound effects, voice lines.", alt: "Cut with A Little Jar, A Full Table open: the media bin, the monitor and its twelve clips on the timeline" },
  library: { img: "media/app/library.webp", cap: "Library: every take, film and picture, each reopened with the inputs that made it.", alt: "The Library: the films made in the app" },
};
const tabs = $$(".rooms [role=tab]"), roomImg = $("#room-img");
function room(b, focus) {
  const r = ROOMS[b.dataset.room];
  tabs.forEach((t) => { t.setAttribute("aria-selected", String(t === b)); t.tabIndex = t === b ? 0 : -1; });
  if (focus) b.focus();
  roomImg.classList.add("fade");
  const next = new Image(); next.src = r.img;
  next.decode().catch(() => {}).finally(() => { roomImg.src = r.img; roomImg.alt = r.alt; roomImg.classList.remove("fade"); });
  $("#room-url").textContent = `127.0.0.1:5177/#/${b.dataset.room}`; $("#room-cap").textContent = r.cap;
}
tabs.forEach((b, i) => {
  b.tabIndex = i ? -1 : 0;
  b.addEventListener("click", () => room(b));
  b.addEventListener("keydown", (e) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (d) { e.preventDefault(); room(tabs[(i + d + tabs.length) % tabs.length], true); }
  });
});
Object.values(ROOMS).forEach((r, i) => i && setTimeout(() => { new Image().src = r.img; }, 4000 + i * 400));

/* ── the dock and the bar follow the page ── */
const dockLinks = $$("#dock a"), dk = $("#dock .dk");
const spyDock = new IntersectionObserver((es) => es.forEach((e) => {
  if (!e.isIntersecting) return;
  dockLinks.forEach((a) => {
    const on = a.getAttribute("href") === `#${e.target.id}`;
    a.classList.toggle("on", on);
    if (on) { a.setAttribute("aria-current", "true"); dk.scrollTo({ left: a.offsetLeft - dk.clientWidth / 2 + a.clientWidth / 2, behavior: reduce ? "auto" : "smooth" }); }
    else a.removeAttribute("aria-current");
  });
}), { rootMargin: "-45% 0px -50% 0px" });
$$(".prod").forEach((s) => spyDock.observe(s));
const navLinks = $$(".top nav a");
const spyNav = new IntersectionObserver((es) => es.forEach((e) => {
  if (e.isIntersecting) navLinks.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === `#${e.target.id === "studio-run" ? "studios" : e.target.id}`));
}), { rootMargin: "-45% 0px -50% 0px" });
["studios", "studio-run", "pets", "open", "made", "run"].forEach((id) => document.getElementById(id) && spyNav.observe(document.getElementById(id)));

/* ── the viewer ── */
const viewer = $("#viewer"), vMedia = $("#v-media"), vInfo = $("#v-info");
let list = [], at = 0;
const field = (lab, txt, cls = "") => (txt ? `<div><div class="lab">${lab}</div><p class="${cls}">${esc(txt)}</p></div>` : "");
function show(i) {
  at = (i + list.length) % list.length;
  const it = list[at];
  vMedia.innerHTML = it.v
    ? `<video controls autoplay loop playsinline ${it.sound ? "" : "muted"} poster="${it.i}" src="${it.v}"></video>`
    : `<img src="${it.full || it.i}" alt="${esc(it.alt || it.t)}">`;
  const v = $("video", vMedia); if (v) v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
  const slug = it.p.toLowerCase();
  vInfo.innerHTML = `<span class="mono">${esc(it.p)}${it.m ? ` · ${esc(it.m)}` : ""}</span><h3>${esc(it.t)}</h3>${field(it.dl || "How it was made", it.d, "q")}${it.d2 ? field(it.d2l || "Sound", it.d2) : ""}
    <div class="vacts">${list.length > 1 ? `<button class="btn ghost sm" type="button" data-step="-1" aria-label="Previous">←</button><button class="btn ghost sm" type="button" data-step="1" aria-label="Next">→</button>` : ""}
    <a class="btn sm" href="${slug === "kitchen" ? DEMO : `${DEMO}#/${slug}`}">Open ${esc(it.p)} ${icon("arrow")}</a></div>`;
  $$("[data-step]", vInfo).forEach((b) => b.addEventListener("click", () => show(at + Number(b.dataset.step))));
}
function open(items, i) { list = items; show(i); if (!viewer.open) viewer.showModal(); }
viewer.addEventListener("close", () => { vMedia.innerHTML = ""; });
viewer.addEventListener("click", (e) => { if (e.target === viewer) viewer.close(); });
viewer.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") show(at + 1); else if (e.key === "ArrowLeft") show(at - 1); });
$("#v-close").addEventListener("click", () => viewer.close());

/* ── the presets rail ── */
fetch("media/presets.json").then((r) => r.json()).then((P) => {
  const FAM = { camera: "Camera move", vfx: "Effect", transform: "Transformation" };
  const items = P.map((p) => ({ p: "Kitchen", t: p.name, m: `${FAM[p.family] || p.family} preset`, v: `media/presets/${p.id}/preview.mp4`, i: `media/presets/${p.id}/poster.jpg`,
    d: p.action, dl: "The script", d2: p.sound, d2l: "Its sound", sound: true }));
  const rail = $("#presets-rail");
  const row = (idx, rev) => {
    const el = document.createElement("div"); el.className = "row" + (rev ? " rev" : "");
    const mk = (k) => `<button class="pz" type="button" data-k="${k}"><img src="${items[k].i}" alt="" width="150" height="100" loading="lazy"><b>${esc(items[k].t)}</b></button>`;
    el.innerHTML = [...idx, ...idx].map(mk).join("");
    return el;
  };
  const all = items.map((_, k) => k);
  rail.append(row(all.filter((k) => k % 2 === 0), false), row(all.filter((k) => k % 2 === 1), true));
  rail.addEventListener("click", (e) => { const b = e.target.closest(".pz"); if (b) open(items, Number(b.dataset.k)); });
}).catch(() => {});

/* ── the gallery: what the studios made ── */
const G = [
  { p: "Mixer", t: "State Property", m: "Our crew in the meme · 9:16", v: "media/mixer/state-property.mp4", i: "media/mixer/state-property.jpg", w: 540, h: 960, d: "Earl leans out of his truck window and complains, Mochi riding shotgun: the meme's own motion (DWPose's body, face and hands) driving our cast, four takes chained so the shot never jumps." },
  { p: "Kitchen", t: "A Little Jar, A Full Table", m: "A one-minute film · LTX-2.5", v: "media/kitchen/little-jar.mp4", i: "media/kitchen/little-jar.jpg", w: 960, h: 540, sound: true, d: "Ketkout bakes a jam tart for the kittens: twelve shots planned in Story from one sentence, each rolled with picture and sound, then cut together in Cut with its room tone." },
  { p: "Spice", t: "SH010 · The yard", m: "Four passes on one shot, all real runs", v: "media/spice/sh010-pass.mp4", i: "media/spice/sh010-pass.jpg", w: 960, h: 402, d: "Truffle's Jam Heist, the yard: the white van painted out by Inpaint (a stone house where it stood), the day turned to night, the frame widened to scope by In-outpainting, and the yard given its sound by LTX-2.5. Every pass a workflow on Comfy Cloud, kept with the clip it ran on." },
  { p: "Spice", t: "SH020 · The lookout", m: "Water, Crossview, Cut out", v: "media/spice/sh020-pass.mp4", i: "media/spice/sh020-pass.jpg", w: 960, h: 544, d: "Pickle keeps watch on a crate: rain poured on by the Water IC-LoRA, a new camera angle by Crossview, then SAM3 cut him out as a green screen with the matte kept beside it." },
  { p: "Spice", t: "SH030 · The jar", m: "Refocus, Upscale, Sound", v: "media/spice/sh030-pass.mp4", i: "media/spice/sh030-pass.jpg", w: 960, h: 544, d: "The close-up that missed focus, pulled back by Refocus, taken to 1080 lines by SeedVR2, and given its sound." },
  { p: "Spice", t: "SH040 · 1958", m: "Restoration, Colorization, Upscale", v: "media/spice/sh040-pass.mp4", i: "media/spice/sh040-pass.jpg", w: 960, h: 544, d: "The first heist as a scratched 1958 newsreel, rolled that way by LTX-2.5 from a first frame drawn in the archive look: restored, colourised and upscaled by the IC-LoRAs." },
  { p: "Spice", t: "SH050 · The dance", m: "Union control, Sound", v: "media/spice/sh050-pass.mp4", i: "media/spice/sh050-pass.jpg", w: 960, h: 544, d: "Truffle and Pickle dance on the counter: the clip redrawn under its own pose by the pose IC-LoRA, the same moves on a snowy night with two new faces, and an accordion tune from LTX-2.5." },
  { p: "Mixer", t: "UNO Car Reveal", m: "MiniMax H3 · 9:16", v: "media/mixer/uno-car-reveal.mp4", i: "media/mixer/uno-car-reveal.jpg", w: 540, h: 944, sound: true, d: "Dre at sunset, two UNO cards held up in front of a red car: a trend acted by our cast, with its lines and sound, rolled by MiniMax H3 from a first frame." },
  { p: "Cabinet", t: "Bagel's dressing room", m: "Cabinet's cover", i: "media/cabinet/cover.webp", w: 1400, h: 876, d: "Bagel the corgi in a trench coat on the velvet pouf, his other looks pinned to the mirrors: Cabinet's home." },
  { p: "Mixer", t: "We Listen, We Don't Judge", m: "LTX-2.5 Pro · 9:16", v: "media/mixer/we-listen.mp4", i: "media/mixer/we-listen.jpg", w: 540, h: 960, sound: true, d: "Josie and Earl trade confessions to the camera, each line voiced in the take itself by LTX-2.5." },
  { p: "Cabinet", t: "Josie · sundress, twirl", m: "Outfit + pose", i: "media/cabinet/josie.webp", w: 360, h: 497, d: "Josie in the floral sundress from the wardrobe, in the twirl from the pose shelf: one image edit with the character, the outfit and the pose as references." },
  { p: "Mixer", t: "Tiny Desk", m: "MiniMax H3 · 9:16", v: "media/mixer/tiny-desk.mp4", i: "media/mixer/tiny-desk.jpg", w: 540, h: 944, sound: true, d: "A little studio session with our cast at the microphone, with its sound." },
  { p: "Cabinet", t: "Earl · black tie", m: "Outfit + pose", i: "media/cabinet/earl.webp", w: 360, h: 480, d: "Earl in black tie, standing: Cabinet dressed him from the wardrobe and posed him from the shelf." },
  { p: "Mixer", t: "Ghost Photoshoot", m: "MiniMax H3 · 9:16", v: "media/mixer/ghost-photoshoot.mp4", i: "media/mixer/ghost-photoshoot.jpg", w: 540, h: 944, sound: true, d: "Two friends in white sheets pose for an autumn photoshoot." },
  { p: "Cabinet", t: "Bagel · chef whites", m: "Outfit + pose", i: "media/cabinet/bagel.webp", w: 360, h: 480, d: "Bagel in chef whites, waving." },
  { p: "Mixer", t: "Getting Robbed, But First…", m: "MiniMax H3 · 9:16", v: "media/mixer/getting-robbed.mp4", i: "media/mixer/getting-robbed.jpg", w: 540, h: 944, sound: true, d: "A café table, a phone, and priorities: a trend acted by our cast with its lines." },
  { p: "Cabinet", t: "Josie, anime", m: "One of twenty styles", i: "media/cabinet/style-anime.webp", w: 480, h: 480, d: "The same Josie drawn in the anime style: a style draws the whole picture one way." },
  { p: "Mixer", t: "You Talking About Me?", m: "MiniMax H3 · 9:16", v: "media/mixer/talking-about-me.mp4", i: "media/mixer/talking-about-me.jpg", w: 540, h: 944, sound: true, d: "Three friends at a café counter, one of them sure it is about him." },
  { p: "Cabinet", t: "Josie, claymation", m: "One of twenty styles", i: "media/cabinet/style-claymation.webp", w: 480, h: 480, d: "Josie as a claymation puppet." },
  { p: "Toaster", t: "Crumpet's workbench", m: "From the clay frame", i: "media/toaster/woodshop-workbench.webp", w: 1280, h: 720, d: "Crumpet building a toy at his workbench, in a woodshop of 17 parts. The example's render was made with GPT Image from the clay frame kept with it." },
  { p: "Jam", t: "Moonlit Oolong Walk", m: "ACE-Step 1.5 + LTX-2.5", v: "media/jam/taro.mp4", i: "media/jam/taro.jpg", w: 720, h: 720, sound: true,
    d: "Taro's song, written by Pickle from one sentence and made with ACE-Step 1.5; the six-second video cover rolled with LTX-2.5 from the cover picture, lip-synced to the chorus." },
  { p: "Toaster", t: "Brioche's perfume launch", m: "From the clay frame", i: "media/toaster/perfume-hero.webp", w: 1024, h: 1280, d: "The Brioche flacon on a travertine plinth with its gift box, a pearl and Brioche the bunny. The example's render was made with GPT Image from its clay frame." },
  { p: "Macaron", t: "Little Otter Tea", m: "A fictional brand, made end to end", i: "media/macaron/otter-flyer.webp", w: 720, h: 1018, d: "An A4 café flyer from the Little Otter Tea brand kit: deep teal, moon cream, tangerine, Manrope and IBM Plex Mono." },
  { p: "Toaster", t: "Pickle's little stage, as a poster", m: "From the clay frame", i: "media/toaster/stage-poster.webp", w: 1280, h: 720, d: "Pickle at the microphone with his band and three fans, a screen-printed poster look. The example's render was made with GPT Image from the clay frame kept with it." },
  { p: "Macaron", t: "Comfyture: the launch post", m: "4:5", i: "media/macaron/launch.webp", w: 720, h: 900, d: "A launch post made in Macaron from the Comfyture brand kit, with Brioche." },
  { p: "Toaster", t: "Crumpet's workbench, storybook look", m: "From the clay frame", i: "media/toaster/woodshop-storybook.webp", w: 1280, h: 720, d: "The same clay as the workbench, another look. The example's render was made with GPT Image." },
  { p: "Toaster", t: "After dark", m: "From the clay frame", i: "media/toaster/perfume-after-dark.webp", w: 1024, h: 1280, d: "Brioche's perfume launch, an after-dark look of the same clay. The example's render was made with GPT Image." },
  { p: "Jam", t: "Taro's song cover", m: "The cover row", i: "media/jam/taro-cover.webp", w: 720, h: 720, d: "The cover of Taro's song, and the first frame of its video cover." },
  { p: "Macaron", t: "Little Otter Tea: one cup, then the moon", m: "4:5", i: "media/macaron/otter-post.webp", w: 720, h: 900, d: "A 4:5 launch post from the Little Otter Tea kit." },
];
const grid = $("#gallery");
const cards = G.map((it, k) => {
  const b = document.createElement("button");
  b.type = "button"; b.className = "g"; b.dataset.p = it.p;
  b.setAttribute("aria-label", `${it.t}, ${it.p}${it.v ? ", video" : ""}`);
  b.innerHTML = `<img src="${it.i}" alt="" width="${it.w}" height="${it.h}" loading="lazy" decoding="async">${it.v ? `<span class="play">${icon("play")}</span>` : ""}<span class="gt"><span>${esc(it.p)}<span class="m"> · ${esc(it.m)}</span></span><b>${esc(it.t)}</b></span>`;
  b.addEventListener("click", () => { const vis = G.filter((_, j) => !cards[j].hidden); open(vis, vis.indexOf(it)); });
  if (it.v && !reduce && matchMedia("(hover: hover)").matches) {
    b.addEventListener("mouseenter", () => {
      let v = $("video", b);
      if (!v) { v = document.createElement("video"); v.muted = true; v.loop = true; v.playsInline = true; v.src = it.v; b.append(v); }
      v.play().then(() => b.classList.add("live")).catch(() => {});
    });
    b.addEventListener("mouseleave", () => { const v = $("video", b); if (v) { v.pause(); b.classList.remove("live"); } });
  }
  grid.append(b);
  return b;
});
const moreG = $("#more-g");
const unclamp = () => { grid.classList.remove("clamp"); moreG.remove(); };
moreG.textContent = `Show all ${G.length}`;
moreG.addEventListener("click", unclamp);
$$("#filters button").forEach((f) => f.addEventListener("click", () => {
  $$("#filters button").forEach((x) => x.setAttribute("aria-pressed", String(x === f)));
  cards.forEach((c) => { c.hidden = !!f.dataset.f && c.dataset.p !== f.dataset.f; });
  if (f.dataset.f && moreG.isConnected) unclamp();
}));

/* ── copy the commands ── */
$$("[data-copy]").forEach((b) => b.addEventListener("click", () => {
  navigator.clipboard?.writeText(b.dataset.copy).then(() => {
    b.innerHTML = `${icon("check")}<span>Copied</span>`;
    setTimeout(() => { b.innerHTML = `${icon("copy")}<span>Copy</span>`; }, 1800);
  }).catch(() => {});
}));
