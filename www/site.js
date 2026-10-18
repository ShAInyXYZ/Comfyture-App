/* Comfyture website: a wall of live clips, the player, and the hero film. */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const FAM = { camera: "Camera move", vfx: "Effect", transform: "Transformation" };
const ico = (n) => `<svg class="ico"><use href="media/icons.svg#${n}"/></svg>`;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pdir = (id) => `media/presets/${id}/`;
let presets = [], takes = [];

/* ── clips that play while they're on screen (at most a handful at once) ── */
const playing = [];
const MAX = 14;
function started(v) { const i = playing.indexOf(v); if (i >= 0) playing.splice(i, 1); playing.push(v); while (playing.length > MAX) { const o = playing.shift(); o.pause(); o.parentElement?.classList.remove("live"); } }
const io = new IntersectionObserver((es) => es.forEach((e) => {
  const host = e.target;
  if (e.isIntersecting) {
    if (reduce) return;
    let v = $("video", host);
    if (!v) { v = document.createElement("video"); v.muted = true; v.loop = true; v.playsInline = true; v.preload = "metadata"; v.src = host.dataset.clip; host.append(v); }
    else if (!v.getAttribute("src") && v.dataset.src) v.src = v.dataset.src;
    v.play().then(() => { host.classList.add("live"); started(v); }).catch(() => {});
  } else { const v = $("video", host); if (v) { v.pause(); host.classList.remove("live"); } }
}), { rootMargin: "80px", threshold: 0.2 });
const live = (el, src) => { el.dataset.clip = src; io.observe(el); };

/* videos written straight into the page (promos, last-frame row) */
const watch = new IntersectionObserver((es) => es.forEach((e) => {
  const v = e.target;
  if (e.isIntersecting) { if (v.dataset.src && !v.getAttribute("src")) v.src = v.dataset.src; if (!reduce) v.play().catch(() => {}); } else v.pause();
}), { threshold: 0.25 });
$$("video[data-src]").forEach((v) => watch.observe(v));

/* ── ticker, runway ── */
const TICK = ["Open source · MIT", "28 presets", "Picture and sound in one pass", "Story · Stage · Shot · Cut", "Runs on your GPU or Comfy Cloud", "Open weights", "372 set pieces", "One photo in, a shot out"];
$("#ticker").innerHTML = [...TICK, ...TICK].map((t) => `<span>${t}</span>`).join("");
$("#runway").innerHTML = [..."LTX-2.5|Qwen Image 2.1|FLUX 3 Klein|Krea 2 Turbo|Z-Image Turbo|ACE-Step 1.5|Stable Audio 3|Gemma 4".split("|")].concat("LTX-2.5|Qwen Image 2.1|FLUX 3 Klein|Krea 2 Turbo|Z-Image Turbo|ACE-Step 1.5|Stable Audio 3|Gemma 4".split("|")).map((t) => `<span>${t}</span>`).join("");

/* ── hero film, with a chip per shot ── */
const film = $("#film-v");
const SHOTS = [["waking-up", "Waking Up", 0], ["finding-life", "Finding Life", 6], ["observing-sky", "Observing Sky", 11], ["rescue-arrival", "Rescue Arrival", 18]];
const bar = $("#film-shots");
for (const [id, name, t] of SHOTS) {
  const b = document.createElement("button"); b.type = "button"; b.setAttribute("aria-label", `Jump to ${name}`);
  b.innerHTML = `<img src="media/takes/${id}.jpg" alt="" loading="lazy">`;
  b.addEventListener("click", () => { film.currentTime = t; film.play().catch(() => {}); });
  bar.append(b);
}
const mark = () => { const t = film.currentTime; let k = 0; SHOTS.forEach((s, i) => { if (t >= s[2]) k = i; }); $$("button", bar).forEach((b, i) => b.classList.toggle("on", i === k)); };
film.addEventListener("timeupdate", mark); mark();
if (reduce) film.pause();
$("#film-sound").addEventListener("click", (e) => {
  const on = film.muted; film.muted = !on; const b = e.currentTarget;
  b.setAttribute("aria-pressed", String(on)); b.setAttribute("aria-label", on ? "Turn the sound off" : "Turn the sound on");
  b.innerHTML = ico(on ? "player-volume-high" : "player-volume-off");
  if (on) film.play().catch(() => {});
});

/* ── the player ── */
const view = $("#view"), vPl = $("#v-pl"), vInfo = $("#v-info");
let list = [], at = 0;
const field = (label, text, cls = "") => (text ? `<div><div class="lab">${label}</div><p class="txt ${cls}">${esc(text)}</p></div>` : "");
function show(i) {
  at = (i + list.length) % list.length; const cur = list[at], it = cur.item, isPreset = cur.type === "preset";
  const src = isPreset ? `${pdir(it.id)}preview.mp4` : `media/takes/${it.id}.mp4`, poster = isPreset ? `${pdir(it.id)}poster.jpg` : `media/takes/${it.id}.jpg`;
  vPl.innerHTML = `<video controls autoplay loop playsinline muted poster="${poster}" src="${src}"></video>`;
  const chips = isPreset ? `<span class="chip y">${FAM[it.family] || it.family}</span><span class="chip">${it.seconds} s</span>` : `<span class="chip y">${esc(it.kind)}</span><span class="chip">${it.seconds} s</span>`;
  const body = isPreset
    ? field("What happens", it.action, "q") + field("Camera", it.camera) + field("Sound", it.sound) + field("The painted ending", it.paint)
    : field("The prompt", it.prompt, "q") + (it.dialogue.length ? field("Dialogue", it.dialogue.map((d) => `“${d}”`).join(" ")) : "");
  vInfo.innerHTML = `<div class="row">${chips}</div><h3>${esc(it.title || it.name)}</h3>${isPreset ? `<p class="txt">${esc(it.blurb)}</p>` : ""}${body}
    <div class="acts">${isPreset ? `<button class="btn ghost sm" type="button" id="v-end">${ico("frame-last")} Show the ending</button>` : ""}<button class="btn ghost sm" type="button" id="v-prev" aria-label="Previous">${ico("player-skip-back")}</button><button class="btn ghost sm" type="button" id="v-next" aria-label="Next">${ico("player-skip-forward")}</button><a class="btn sm" href="demo/">Open the demo</a></div>`;
  $("#v-prev").onclick = () => show(at - 1); $("#v-next").onclick = () => show(at + 1);
  const endBtn = $("#v-end");
  if (endBtn) { let on = false; endBtn.onclick = () => { on = !on; const v = $("video", vPl); if (on) { v.pause(); v.style.display = "none"; vPl.insertAdjacentHTML("beforeend", `<img id="v-last" alt="The painted last frame" src="${pdir(it.id)}last.jpg">`); endBtn.innerHTML = `${ico("play")} Show the shot`; } else { $("#v-last")?.remove(); v.style.display = ""; v.play().catch(() => {}); endBtn.innerHTML = `${ico("frame-last")} Show the ending`; } }; }
}
function open(items, id) { list = items; show(Math.max(0, items.findIndex((x) => x.item.id === id))); if (!view.open) view.showModal(); }
view.addEventListener("close", () => { vPl.innerHTML = ""; });
view.addEventListener("click", (e) => { if (e.target === view) view.close(); });
$("#v-x").addEventListener("click", () => view.close());
view.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") show(at + 1); else if (e.key === "ArrowLeft") show(at - 1); });
const zoom = $("#zoom");
$$("[data-zoom]").forEach((b) => b.addEventListener("click", () => { $("#zoom-i").src = b.dataset.zoom; $("#zoom-i").alt = $("img", b).alt; zoom.showModal(); }));
zoom.addEventListener("click", () => zoom.close());

/* ── data ── */
Promise.all([fetch("media/presets.json").then((r) => r.json()), fetch("media/takes.json").then((r) => r.json())]).then(([P, T]) => {
  presets = P; takes = T;
  const asP = (arr) => arr.map((x) => ({ type: "preset", item: x })), asT = (arr) => arr.map((x) => ({ type: "take", item: x }));

  /* two rows of every preset, sliding past, each playing as it comes into view */
  const marq = $("#marq");
  const rowOf = (items, rev) => {
    const row = document.createElement("div"); row.className = "row" + (rev ? " rev" : "");
    const mk = (p) => { const b = document.createElement("button"); b.type = "button"; b.className = "mq"; b.innerHTML = `<img src="${pdir(p.id)}poster.jpg" alt="" width="720" height="480" loading="lazy"><b>${esc(p.name)}</b>`; live(b, `${pdir(p.id)}preview.mp4`); b.addEventListener("click", () => open(asP(presets), p.id)); return b; };
    [...items, ...items].forEach((p) => row.append(mk(p)));
    return row;
  };
  marq.append(rowOf(presets.filter((_, i) => i % 2 === 0), false), rowOf(presets.filter((_, i) => i % 2 === 1), true));

  /* the mosaic */
  const mosaic = $("#mosaic"); let fam = "", q = "";
  const BIG = new Set([0, 9, 16, 23]);
  const tiles = presets.map((p, i) => {
    const t = document.createElement("button"); t.type = "button"; t.className = "tile" + (BIG.has(i) ? " big" : "");
    t.innerHTML = `<img src="${pdir(p.id)}poster.jpg" alt="" width="720" height="480" loading="lazy"><span class="chip">${FAM[p.family] || p.family}</span><div class="t"><b>${esc(p.name)}</b><span>${esc(p.blurb)}</span></div>`;
    live(t, `${pdir(p.id)}preview.mp4`);
    t.addEventListener("click", () => open(asP(presets.filter(match)), p.id)); mosaic.append(t); return t;
  });
  function match(p) { return (!fam || p.family === fam) && (!q || `${p.name} ${p.blurb} ${p.camera} ${p.family}`.toLowerCase().includes(q)); }
  const apply = () => { mosaic.classList.toggle("flat", !!(fam || q)); tiles.forEach((t, i) => { t.hidden = !match(presets[i]); }); };
  $$("#p-tabs button").forEach((b) => b.addEventListener("click", () => { fam = b.dataset.f; $$("#p-tabs button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); apply(); }));
  $("#p-q").addEventListener("input", (e) => { q = e.target.value.trim().toLowerCase(); apply(); });

  /* talking, copying, extending: three big pairs */
  const byId = Object.fromEntries(takes.map((t) => [t.id, t]));
  const clip = (host, id, label) => {
    const t = byId[id]; if (!t) return;
    host.innerHTML = `<img src="media/takes/${t.id}.jpg" alt=""><div class="t">${esc(label)}</div>`; host.style.cursor = "pointer"; host.setAttribute("role", "button"); host.tabIndex = 0;
    live(host, `media/takes/${t.id}.mp4`);
    const go = () => open(asT(takes), t.id); host.addEventListener("click", go); host.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  };
  clip($("#tk-a"), "not-tonight", "Not tonight · she says it"); clip($("#tk-b"), "chef-lip-sync", "Chef · lip sync");
  clip($("#cp-a"), "chef-copied-motion", "Copied motion"); clip($("#cp-b"), "thunder-god-extended", "Extended clip");

  /* the gallery of real takes */
  const grid = $("#t-grid"); let kind = "";
  const cards = takes.map((t) => {
    const c = document.createElement("button"); c.type = "button"; c.className = "take";
    c.innerHTML = `<span class="sz" style="aspect-ratio:${t.width} / ${t.height}"></span><img src="media/takes/${t.id}.jpg" alt="" loading="lazy"><span class="chip">${esc(t.kind)}</span><div class="t"><b>${esc(t.title)}</b></div>`;
    live(c, `media/takes/${t.id}.mp4`); c.addEventListener("click", () => open(asT(takes.filter((x) => !kind || x.kind === kind)), t.id)); grid.append(c); return c;
  });
  $$("#t-tabs button").forEach((b) => b.addEventListener("click", () => { kind = b.dataset.k; $$("#t-tabs button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); cards.forEach((c, i) => { c.hidden = !!kind && takes[i].kind !== kind; }); }));
});

/* nav follows the page */
const links = $$(".bar nav a"), secs = links.map((a) => $(a.getAttribute("href")));
const spy = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) links.forEach((a, i) => a.classList.toggle("on", secs[i] === e.target)); }), { rootMargin: "-40% 0px -55% 0px" });
secs.forEach((s) => s && spy.observe(s));
