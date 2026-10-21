// Truffle's GUIDE: a recipe of tools and Library workflows for a job, shown where the person is in Utensils. Truffle answers a job with
// a plan (her guide op: utensils-assist.js calls showGuide); the guide makes it a panel on the right ("Your recipe: N steps": each step
// with its section, why, how and price, an Open key, Start with step 1 and the total), lights the recipe's books on the Shelf (pulled out,
// a yellow edge and a number, the others dimmed, a golden thread joining them in order; a workflow that is not on the Shelf stands on a
// small Library cart at a shelf's end) and the workflow books in the Library, and, once a step is opened, a small COACH card near the
// tool's run key says how to use it and hands its result on to the next step. The recipe stays across workspaces and reloads until it is
// closed. What a recipe is (its steps made whole, its total, the thread's line) is utensils-guide-plan.js's.
import { h, icon, sprite } from "./dom.js";
import { changed, onChange, toast } from "./store.js";
import { currentPage } from "./router.js";
import { utensils, toolById, setWorkspace, handOn, estimate } from "./utensils.js";
import { WORKSPACES, TRUFFLE } from "./utensils-harness.js";
import { openTool } from "./utensils-home-ui.js";
import { wayOf } from "./utensils-home-facts.js";
import { appByName, openApp } from "./utensils-templates-api.js";
import { normalisePlan, totalOf, threadPath, handable, isWorkflow } from "./utensils-guide-plan.js";

const KEY = "comfyture.utensils.guide";

/** The workspace the Library is (the Templates workspace, or a Library one when it has its own id). */
const libraryWs = () => (WORKSPACES.find((w) => w.id === "library") ?? WORKSPACES.find((w) => w.id === "templates"))?.id ?? "templates";
const sectionOf = (id) => (id === "library" ? WORKSPACES.find((w) => w.id === libraryWs()) : WORKSPACES.find((w) => w.id === id)) ?? null;
const colorOf = (id) => sectionOf(id)?.color ?? "#9b9ba3";
const sectionName = (id) => (id === "library" ? "Library" : sectionOf(id)?.name ?? "Utensils");
const lookup = (id) => {
  const t = toolById(id);
  return t?.id === id ? t : null;
};
/** Whether a tool runs here for nothing (the Edit tools, the local effects): a step of it is Free even without its knowledge entry. */
const freeOf = (id) => {
  const t = lookup(id);
  try {
    return !!t && wayOf(t) === "free";
  } catch {
    return false;
  }
};
const estimateOf = (id) => {
  const t = lookup(id);
  try {
    return t ? estimate(t) : null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------- the recipe's state (kept in this browser until it is closed)

/** An entry kept small: what the guide reads of it. */
const slim = (e) => (e && typeof e === "object" ? { id: e.id, kind: e.kind, name: e.name, section: e.section, category: e.category, what: e.what, how: e.how, use: e.use, takes: e.takes, gives: e.gives, cost: e.cost, credits: e.credits, open: e.open, tutorial: e.tutorial } : null);

function persist() {
  try {
    if (utensils.guide) localStorage.setItem(KEY, JSON.stringify({ plan: utensils.guide.plan, current: utensils.guide.current, collapsed: utensils.guide.collapsed, started: utensils.guide.started, coach: utensils.guide.coach }));
    else localStorage.removeItem(KEY);
  } catch {}
}
function restore() {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (kept?.plan?.steps?.length) set(kept.plan, kept);
  } catch {}
}
/** The recipe made from a plan, the steps made whole. */
function set(plan, { current = null, collapsed = false, started = {}, coach = false } = {}) {
  const raw = { title: plan.title ?? "", steps: (plan.steps ?? []).map((s) => ({ id: s.id, why: s.why ?? "", how: s.how ?? "", entry: slim(s.entry) })) };
  const made = normalisePlan(raw, { lookup, estimate: estimateOf, free: freeOf });
  if (!made.steps.length) return false;
  utensils.guide = { plan: raw, title: made.title, steps: made.steps, current: current !== null && current < made.steps.length ? current : null, collapsed, started, coach: coach && current !== null };
  return true;
}

/**
 * Shows a recipe: plan = { title, steps: [{ id, why, how, entry }] } (an id is a tool's or `wf:<template name>`; entry is the knowledge
 * entry). Steps without their entry fetch it (the guide reads how to use the tool from it). Answers whether there was a recipe to show.
 */
export function showGuide(plan) {
  if (!set(plan)) return false;
  persist();
  changed("utensils");
  draw();
  enrich();
  return true;
}
/** Puts the recipe away: the panel, the coach, the lit books. */
export function hideGuide() {
  utensils.guide = null;
  persist();
  changed("utensils");
  draw();
}

/** The knowledge entries a plan came without (Truffle sends them; a plan made by hand may not): fetched, the steps made whole again. */
async function enrich() {
  const g = utensils.guide;
  if (!g) return;
  const missing = g.plan.steps.filter((s) => !s.entry);
  if (!missing.length) return;
  await Promise.all(missing.map(async (s) => {
    try {
      const r = await fetch(`api/utensils/knowledge/${encodeURIComponent(s.id)}`);
      if (r.ok) s.entry = slim(await r.json());
    } catch {}
  }));
  if (utensils.guide !== g) return;
  set(g.plan, g);
  persist();
  draw();
}

// ---------------------------------------------------------------- going to a step

/** Opens a step: its tool in its workspace, or its workflow in the Library (as an app when it is one); the coach shows how to use it. */
export function openStep(i) {
  const g = utensils.guide;
  const s = g?.steps[i];
  if (!s) return;
  g.current = i;
  g.started = { ...g.started, [i]: new Date().toISOString() };
  g.collapsed = true;
  g.coach = true;
  persist();
  goTo(s);
  changed("utensils");
  draw();
}
function goTo(s) {
  if (s.kind === "workflow") {
    const app = appByName(s.workflow);
    if (app) openApp(app);
    else {
      setWorkspace(libraryWs());
      document.dispatchEvent(new CustomEvent("utensils:template", { detail: { id: s.workflow } }));
    }
    revealLater(s.workflow);
    return;
  }
  const t = lookup(s.id);
  if (t) openTool(t);
}
/** The Library's own way to bring a workflow's book into view, when it has one (the Library may be drawn after the switch). */
function revealLater(name) {
  setTimeout(async () => {
    try {
      const m = await import("./utensils-space-templates.js");
      m.revealWorkflow?.(name, { pulse: true });
    } catch {}
  }, 120);
}

/** The newest result of a step, made since it was opened (a workflow's results are kept under the template's tool or its app's). */
function resultOf(i) {
  const g = utensils.guide;
  const s = g.steps[i];
  const since = g.started?.[i] ?? "";
  return utensils.results.find((r) => r.at >= since && (r.tool === s.id || (s.kind === "workflow" && (r.tool === "template" || String(r.tool).startsWith("app-") || r.template === s.workflow)))) ?? null;
}
/** The next step: what the step made is handed on when the next one takes it; else the next one opens as it is. */
function nextStep() {
  const g = utensils.guide;
  if (!g || g.current === null) return;
  const i = g.current;
  const next = g.steps[i + 1];
  if (!next) {
    g.coach = false;
    g.collapsed = false;
    persist();
    changed("utensils");
    draw();
    toast("That was the last step of the recipe.");
    return;
  }
  const r = resultOf(i);
  const kind = handable(r, next);
  if (kind && next.kind === "tool") {
    g.current = i + 1;
    g.started = { ...g.started, [i + 1]: new Date().toISOString() };
    g.coach = true;
    persist();
    handOn(r, next.id);
    toast(`${g.steps[i].name}'s result is in ${next.name}.`);
    changed("utensils");
    draw();
    return;
  }
  openStep(i + 1);
}

// ---------------------------------------------------------------- the panel, the pill and the coach

const root = h("div.rcp-root", { hidden: true });
const panel = h("aside.rcp-panel", { "aria-label": "Truffle's recipe" });
const pill = h("button.rcp-pill", { type: "button", hidden: true, on: { click: () => expand(true) } });
const coach = h("div.rcp-coach", { role: "dialog", hidden: true });
root.append(panel, pill, coach);
let mounted = false;
let drawnSig = "";

function expand(open) {
  const g = utensils.guide;
  if (!g) return;
  g.collapsed = !open;
  persist();
  draw();
}
/** Folds the recipe away (its books go back to a strip in the Library's frame, its panel to a pill) or brings it forward again. */
export function foldGuide(folded) {
  expand(!folded);
  changed("utensils");
}

function stepRow(s, i, g) {
  const now = g.current === i;
  const done = g.current !== null && i < g.current;
  return h(`li.rcp-step${now ? ".is-now" : ""}${done ? ".is-done" : ""}`, { dataset: { step: String(i + 1), id: s.id } },
    h("span.rcp-num", { "aria-hidden": "true" }, done ? icon("check") : String(i + 1)),
    h("div.rcp-step-body", {},
      h("div.rcp-step-top", {},
        h("b.rcp-step-name", {}, s.name),
        h("span.rcp-chip", { style: { "--sec": colorOf(s.section) } }, sectionName(s.section))),
      s.why ? h("p.rcp-why", {}, s.why) : null,
      s.how ? h("p.rcp-how", {}, h("em", {}, "How"), " · ", s.how) : null,
      h("div.rcp-step-foot", {},
        h(`span.rcp-price${s.cost === "free" ? ".is-free" : ""}`, {}, s.price),
        h("button.rcp-open", { type: "button", title: `Open ${s.name}`, on: { click: () => openStep(i) } }, now ? "Here" : "Open", icon("next")))));
}

function drawPanel(g) {
  const total = totalOf(g.steps);
  const n = g.steps.length;
  const go = g.current === null ? 0 : Math.min(n - 1, g.current);
  const lead = g.current === null ? "Start with step 1" : g.current + 1 >= n ? `Back to step ${n}` : `Go on with step ${go + 1}`;
  panel.replaceChildren(
    h("header.rcp-head", {},
      h("img.rcp-face", { src: TRUFFLE.face, alt: "", draggable: false }),
      h("div.rcp-title", {}, h("span.rcp-eyebrow", {}, "Truffle's recipe"), h("b", {}, titleWords(g.title, n))),
      h("button.ut-iconkey.is-quiet.rcp-fold", { type: "button", title: "Fold the recipe away", "aria-label": "Fold the recipe away", on: { click: () => expand(false) } }, icon("chevron")),
      h("button.ut-iconkey.is-quiet.rcp-close", { type: "button", title: "Close the recipe", "aria-label": "Close the recipe", on: { click: () => hideGuide() } }, icon("close"))),
    h("ol.rcp-steps", {}, ...g.steps.map((s, i) => stepRow(s, i, g))),
    h("footer.rcp-foot", {},
      h("button.rcp-start", { type: "button", on: { click: () => openStep(go) } }, lead, icon("next")),
      h("span.rcp-total", {}, "Total: ", h("b", {}, total.label))));
}
/** "Your recipe: 4 steps" with the count lit; a title of Truffle's own is kept as she wrote it. */
function titleWords(title, n) {
  const m = title.match(/^(.*?)(\d+ steps?)(.*)$/);
  return m ? [m[1], h("em", {}, m[2]), m[3]] : title;
}

function drawPill(g) {
  const n = g.steps.length;
  pill.replaceChildren(h("img", { src: TRUFFLE.face, alt: "", draggable: false }), h("span", {}, "Recipe"), h("b", {}, g.current === null ? `${n} steps` : `step ${g.current + 1} of ${n}`), icon("chevron"));
  pill.title = "Open Truffle's recipe";
}

function drawCoach(g) {
  const s = g.steps[g.current];
  const last = g.current + 1 >= g.steps.length;
  const r = resultOf(g.current);
  const next = g.steps[g.current + 1];
  const hand = next && handable(r, next) && next.kind === "tool";
  coach.style.setProperty("--sec", colorOf(s.section));
  // (replaceChildren writes a null as the word: the tutorial link is left out by filtering)
  coach.replaceChildren(...[
    h("div.rcp-coach-head", {},
      h("span.rcp-num.is-small", {}, String(g.current + 1)),
      h("div", {}, h("span.rcp-eyebrow", {}, `Step ${g.current + 1} of ${g.steps.length}`), h("b", {}, s.name)),
      h("button.ut-iconkey.is-quiet", { type: "button", title: "Hide these tips (the recipe stays)", "aria-label": "Hide the tips", on: { click: () => ((g.coach = false), persist(), draw()) } }, icon("close"))),
    h("ol.rcp-coach-use", {}, ...s.use.map((u) => h("li", {}, u))),
    s.tutorial ? h("a.rcp-tutorial", { href: s.tutorial, target: "_blank", rel: "noopener" }, "Official tutorial", icon("next")) : null,
    h("div.rcp-coach-keys", {},
      h("button.ut-ghost.is-quiet", { type: "button", on: { click: () => expand(true) } }, "The recipe"),
      h("button.rcp-next", { type: "button", title: hand ? `Hand the result to ${next.name}` : last ? "Finish the recipe" : `Open ${next?.name}`, on: { click: () => nextStep() } }, last ? "Done" : hand ? `Hand it to step ${g.current + 2}` : "Next step", icon("next")))].filter(Boolean));
}

/**
 * The coach sits by the run key of the workspace open and points at it, where it covers nothing the person has to use: above the key,
 * to its left, or below it, the first of these that leaves the workspace's fields, wells and keys clear (else the one that covers the
 * least); with no run key on screen, at the foot of the screen above Truffle's bar.
 */
function placeCoach() {
  if (coach.hidden) return;
  const ws = utensils.workspace;
  // (in the Library's frame, the workflow's panel is the run key's place)
  const space = utensils.library ? document.querySelector(`.lbx [data-space="templates"]`) : document.querySelector(`.ut-main > [data-space="${ws}"]:not([hidden])`);
  const keys = space ? [...space.querySelectorAll(".ut-primary")].filter((k) => k.offsetParent && k.getBoundingClientRect().width) : [];
  document.querySelectorAll(".rcp-pulse").forEach((k) => k.classList.remove("rcp-pulse"));
  const key = keys.at(-1);
  const cw = coach.offsetWidth;
  const ch = coach.offsetHeight;
  const pad = 14;
  const W = window.innerWidth;
  const H = window.innerHeight;
  if (!key) {
    coach.classList.remove("has-arrow", "is-below", "is-left");
    coach.style.left = `${Math.round(W - cw - 24)}px`;
    coach.style.top = `${Math.round(Math.max(76, H - ch - 120))}px`;
    return;
  }
  key.classList.add("rcp-pulse");
  const r = key.getBoundingClientRect();
  const clampX = (x) => Math.min(W - cw - pad, Math.max(pad, x));
  const clampY = (y) => Math.min(H - ch - pad, Math.max(76, y));
  const spots = [
    { side: "above", left: clampX(r.left + r.width / 2 - cw / 2), top: r.top - ch - 16 },
    { side: "left", left: r.left - cw - 18, top: clampY(r.bottom - ch) },
    { side: "below", left: clampX(r.left + r.width / 2 - cw / 2), top: r.bottom + 16 },
  ].filter((p) => p.left >= pad && p.top >= 76 && p.top + ch <= H - pad);
  // and, when those cover something, higher up the key's own column, over what is only to be read (the arrow is left out there)
  for (let y = r.top - ch - 64; y >= 76; y -= 28) spots.push({ side: "far", left: clampX(r.right - cw), top: y });
  // what the coach must not hide: the workspace's fields, wells and keys (not the run key it points at)
  const busy = space ? [...space.querySelectorAll("input, textarea, select, button, [role=button], [class*=well], [class*=drop]")].filter((e) => e !== key && !key.contains(e) && e.offsetParent).map((e) => e.getBoundingClientRect()).filter((b) => b.width && b.height) : [];
  const covered = (p) => busy.reduce((n, b) => n + Math.max(0, Math.min(p.left + cw, b.right) - Math.max(p.left, b.left)) * Math.max(0, Math.min(p.top + ch, b.bottom) - Math.max(p.top, b.top)), 0);
  const best = spots.map((p) => ({ ...p, cover: covered(p) })).sort((a, b) => (a.cover > 0) - (b.cover > 0) || a.cover - b.cover)[0]
    ?? { side: "above", left: clampX(r.left + r.width / 2 - cw / 2), top: clampY(r.top - ch - 16) };
  coach.classList.toggle("has-arrow", best.side !== "far");
  coach.classList.toggle("is-below", best.side === "below");
  coach.classList.toggle("is-left", best.side === "left");
  coach.style.setProperty("--arrow", best.side === "left" ? `${Math.round(Math.min(ch - 20, Math.max(20, r.top + r.height / 2 - best.top)))}px` : `${Math.round(Math.min(cw - 24, Math.max(24, r.left + r.width / 2 - best.left)))}px`);
  coach.style.left = `${Math.round(best.left)}px`;
  coach.style.top = `${Math.round(best.top)}px`;
}

/** The panel, the pill and the coach as the recipe and the page are now. */
function draw() {
  if (!mounted) {
    document.body.append(root);
    mounted = true;
  }
  const g = utensils.guide;
  const here = currentPage() === "utensils";
  // the Library's frame shows the recipe as its reading table: the panel and the pill wait under it (the coach still shows)
  const framed = !!utensils.library;
  root.hidden = !g || !here;
  root.classList.toggle("is-framed", framed);
  document.body.classList.toggle("has-guide", !!g && here && !g.collapsed && !framed);
  if (!g || !here) {
    coach.hidden = true;
    document.querySelectorAll(".rcp-pulse").forEach((k) => k.classList.remove("rcp-pulse"));
    light();
    return;
  }
  const sig = JSON.stringify([g.title, g.steps.map((s) => [s.id, s.price, s.use.length, s.how]), g.current, g.collapsed, g.coach, utensils.workspace, framed, utensils.results[0]?.id]);
  if (sig !== drawnSig) {
    drawnSig = sig;
    panel.hidden = g.collapsed;
    pill.hidden = !g.collapsed;
    if (!g.collapsed) drawPanel(g);
    else drawPill(g);
    coach.hidden = !(g.coach && g.current !== null && g.collapsed);
    if (!coach.hidden) drawCoach(g);
    else document.querySelectorAll(".rcp-pulse").forEach((k) => k.classList.remove("rcp-pulse"));
  }
  requestAnimationFrame(() => (placeCoach(), light()));
}

// ---------------------------------------------------------------- the books of the recipe, lit

const SVGNS = "http://www.w3.org/2000/svg";
let lit = "";

/** A small round number on a book's spine. */
function badge(el, n) {
  let b = el.querySelector(":scope > .rcp-badge");
  if (!b) {
    b = document.createElement("span");
    b.className = "rcp-badge";
    b.setAttribute("aria-hidden", "true");
    el.append(b);
  }
  // (only when it changed: the page is watched for books made again, and a number written again would wake it)
  if (b.textContent !== String(n)) b.textContent = String(n);
}
function unlight(el) {
  el.classList.remove("is-guided", "is-guided-now");
  el.removeAttribute("data-guide-step");
  el.style.removeProperty("--guide-step");
  el.querySelector(":scope > .rcp-badge")?.remove();
}

/** The books of the recipe lit on the Shelf (and in the Library), the cart of its workflows, the thread between them. */
function light() {
  const g = utensils.guide;
  const on = !!g && currentPage() === "utensils";
  const want = new Map(on ? g.steps.map((s, i) => [s.id, i]) : []);
  // the books that are lit and should not be any more
  for (const el of document.querySelectorAll(".is-guided")) {
    const id = el.dataset.tool ?? el.dataset.id ?? (el.dataset.workflow ? `wf:${el.dataset.workflow}` : null);
    if (!want.has(id) || el.classList.contains("rcp-cartbook")) unlight(el);
  }
  const shelf = document.querySelector(".usb-case");
  const caseEl = shelf?.closest(".sh-case");
  shelf?.classList.toggle("rcp-on", on);
  if (!on) {
    document.querySelectorAll(".rcp-cart, .rcp-thread").forEach((x) => x.remove());
    lit = "";
    return;
  }
  // the Shelf's books, and the Library's (by their workflow)
  for (const [id, i] of want) {
    const sel = isWorkflow(id) ? `[data-workflow="${CSS.escape(id.slice(3))}"], [data-id="${CSS.escape(id)}"]` : `.usb-book[data-tool="${CSS.escape(id)}"]`;
    for (const el of document.querySelectorAll(sel)) {
      if (el.closest(".rcp-root")) continue;
      el.classList.add("is-guided");
      el.classList.toggle("is-guided-now", g.current === i);
      el.dataset.guideStep = String(i + 1);
      el.style.setProperty("--guide-step", String(i + 1));
      badge(el, i + 1);
    }
  }
  if (!shelf || !caseEl) return;
  // the steps that have no book on the Shelf stand on a little Library cart at the end of the middle shelf
  const away = g.steps.map((s, i) => ({ s, i })).filter(({ s }) => !shelf.querySelector(`.usb-book[data-tool="${CSS.escape(s.id)}"]`));
  cart(shelf, away, g);
  // the thread: drawn once the books have been pulled out (they move a little)
  const key = JSON.stringify([g.steps.map((s) => s.id), g.current, shelf.childElementCount, caseEl.clientWidth, caseEl.clientHeight]);
  if (key !== lit) {
    lit = key;
    thread(caseEl, g);
    setTimeout(() => thread(caseEl, g), 320);
  }
}

function cart(shelf, away, g) {
  const rows = shelf.querySelectorAll(".usb-row");
  const row = rows[Math.min(1, rows.length - 1)];
  let c = shelf.querySelector(".rcp-cart");
  if (!away.length || !row) {
    c?.remove();
    shelf.classList.remove("has-cart");
    return;
  }
  const sig = JSON.stringify([away.map(({ s, i }) => [s.id, i]), g.current]);
  if (c && c.dataset.sig === sig && row.contains(c)) return;
  c?.remove();
  c = h("div.rcp-cart", { dataset: { sig }, title: "From the Library: these books are workflows, not tools of the Shelf", style: { "--sec": colorOf("library") } },
    h("div.rcp-cart-books", {}, ...away.map(({ s, i }) => {
      const b = h(`button.rcp-cartbook.is-guided${g.current === i ? ".is-guided-now" : ""}`, { type: "button", title: `${s.name}: from the Library`, "aria-label": `Step ${i + 1}: ${s.name}, from the Library`, dataset: { id: s.id, guideStep: String(i + 1) }, on: { click: () => openStep(i) } },
        h("span.rcp-cartbook-name", {}, shortName(s.name)));
      b.style.setProperty("--guide-step", String(i + 1));
      badge(b, i + 1);
      return b;
    })),
    h("div.rcp-cart-deck", {}, h("span", {}, "Library")),
    h("i.rcp-wheel.is-left"), h("i.rcp-wheel.is-right"));
  row.querySelector(".usb-inner")?.append(c);
  shelf.classList.add("has-cart");
}
const shortName = (name) => String(name).replace(/^(LTX|Wan|Hunyuan|Qwen|FLUX)[\w.\- ]*?:\s*/i, "").slice(0, 32);

function thread(caseEl, g) {
  let svg = caseEl.querySelector(":scope > .rcp-thread");
  if (!svg) {
    svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", "rcp-thread");
    svg.setAttribute("aria-hidden", "true");
    caseEl.append(svg);
  }
  const box = caseEl.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${Math.round(box.width)} ${Math.round(box.height)}`);
  const points = g.steps.map((s, i) => {
    const el = caseEl.querySelector(`.usb-book[data-tool="${CSS.escape(s.id)}"], .rcp-cartbook[data-id="${CSS.escape(s.id)}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { step: i, x: r.left + r.width / 2 - box.left, y: r.top - box.top + Math.min(r.height * 0.22, 26) };
  });
  const parts = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    const d = threadPath([a, b]);
    if (d) parts.push(`<path d="${d}" class="rcp-span" marker-end="url(#rcp-arrow)"/>`);
  }
  svg.innerHTML = `<defs><marker id="rcp-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9 z" fill="var(--accent)"/></marker></defs>${parts.join("")}`;
}

// ---------------------------------------------------------------- what keeps it in step with the page

onChange((scopes) => scopes.has("utensils") && draw());
// (the page is built after a reload: the recipe kept from before shows as soon as Utensils is drawn)
document.addEventListener("utensils:drawn", () => draw());
window.addEventListener("hashchange", () => draw());
window.addEventListener("resize", () => ((lit = ""), draw()));
// the Shelf's books are made again when the shelf is rebuilt (a tool registered, the catalogue counted): they are lit again
let queued = false;
new MutationObserver(() => {
  if (queued || !utensils.guide || currentPage() !== "utensils") return;
  queued = true;
  requestAnimationFrame(() => ((queued = false), light(), placeCoach()));
}).observe(document.body, { childList: true, subtree: true });
document.addEventListener("keydown", (e) => e.key === "Escape" && !coach.hidden && document.activeElement?.closest?.(".rcp-coach") && ((utensils.guide.coach = false), persist(), draw()));

restore();
if (utensils.guide) requestAnimationFrame(() => (draw(), enrich()));

/**
 * A recipe to look at without asking Truffle (the console: __guideDemo()): the one of the guide's mockup, a product photo on a messy
 * table to a 9:16 clip with music: cut it out, bring it to life with LTX, make a track, put the track under the clip.
 */
window.__guideDemo = () => showGuide({
  title: "Your recipe: 4 steps",
  steps: [
    { id: "cutout", why: "Lift the product off the table", how: "Drop the photo, press Cut out: the product comes back on a clear ground" },
    { id: "wf:video_ltx2_5_i2v", why: "Make it turn slowly, in 9:16", how: "Give it the cut-out and say how it moves; LTX-2.5 animates it", entry: { id: "wf:video_ltx2_5_i2v", kind: "workflow", name: "LTX-2.5: Image to Video", section: "library", category: "Video", what: "Turns a picture into a short clip with its sound", use: ["Drop the cut-out on the picture well", "Say how it moves: a slow turn, soft light, 9:16", "Run on Comfy Cloud and confirm the price"], takes: ["image", "words"], gives: ["video"], cost: "gpu", credits: 24, open: { workspace: "templates", workflow: "video_ltx2_5_i2v" } } },
    { id: "music", why: "A 10 s upbeat track", how: "Say the mood in a few words, set 10 s, press Make the track" },
    { id: "ed-audio", why: "Put the music under the clip", how: "Give it the clip and the track, pick Replace, export" },
  ],
});
