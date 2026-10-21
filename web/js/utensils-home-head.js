// The header band of Utensils' Home. It carries what the left panel carries on every other workspace, since Home has none: who
// Truffle is, the way into every workspace (the pills), and what is running and what today has cost (the status card). Between them
// the question the page asks, "What shall we make or fix?", and a large search over every tool and every mini app: a word finds a
// tool or an app and opens it; words that match nothing go to Truffle's bar as a request.
import { h, icon, sprite, ago } from "./dom.js";
import { utensils, shelfTools, setWorkspace, toolById, creditsToday } from "./utensils.js";
import { TRUFFLE, WORKSPACES } from "./utensils-harness.js";
import { apps, openApp } from "./utensils-templates-api.js";
import { wayOf, MARK, findIn } from "./utensils-home-facts.js";
import { openTool } from "./utensils-home-ui.js";
import { tell } from "./harnesses.js";

const WHERE = { vfx: "VFX", picture: "Picture", video: "Video", audio: "Audio", edit: "Edit", templates: "App" };

export function headBand() {
  let query = "";
  let found = [];
  let active = 0;

  // ------------------------------------------------------------ Truffle
  const pet = h("div.hp-pet", {},
    h("span.hp-pet-pic", {}, h("img", { src: TRUFFLE.portrait, alt: "", draggable: false, loading: "eager" })),
    h("div.hp-pet-text", {}, h("b", {}, TRUFFLE.name), h("span", {}, TRUFFLE.tag)));

  // ------------------------------------------------------------ the search
  const input = h("input.hp-find", {
    type: "text", placeholder: "Find a tool, or say the job: remove the wind noise…", "aria-label": "Find a tool, or say what you want done", autocomplete: "off", spellcheck: "false", role: "combobox", "aria-expanded": "false", "aria-controls": "hp-found",
    on: {
      input: (e) => ((query = e.target.value), (active = 0), draw()),
      focus: () => draw(),
      blur: () => setTimeout(() => ((box.hidden = true), input.setAttribute("aria-expanded", "false")), 140),
      keydown: (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          if (found.length) ((active = (active + (e.key === "ArrowDown" ? 1 : found.length - 1)) % found.length), draw());
        } else if (e.key === "Enter") (e.preventDefault(), pick(found[active] ?? found[0]));
        else if (e.key === "Escape") ((query = ""), (e.target.value = ""), draw());
      },
    },
  });
  const go = h("button.hp-find-go", { type: "button", title: "Open the first match, or ask Truffle", "aria-label": "Go", on: { click: () => (query.trim() ? pick(found[0]) : input.focus()) } }, icon("next"));
  const box = h("div.hp-found", { id: "hp-found", role: "listbox", hidden: true, "aria-label": "Matches" });
  const field = h("div.hp-findrow", {}, h("span.hp-glass", {}, icon("search")), input, go, box);

  /** What a typed word finds: tools by name and what they do, mini apps by title and promise, then always the way to ask Truffle. */
  function matches() {
    const tools = findIn(shelfTools(), query, 7).map((t) => ({ kind: "tool", t, name: t.name, where: WHERE[t.workspace] ?? "Tool", way: wayOf(t) }));
    const asApps = findIn(apps.list.map((a) => ({ a, name: a.title, hint: a.promise, group: "app", workspace: "templates" })), query, 4).map((x) => ({ kind: "app", a: x.a, name: x.name, where: "App" }));
    return [...tools, ...asApps].slice(0, 8);
  }
  function draw() {
    const q = query.trim();
    found = q ? [...matches(), { kind: "ask", name: q }] : [];
    active = Math.min(active, Math.max(0, found.length - 1));
    const open = !!q && document.activeElement === input;
    box.hidden = !open;
    input.setAttribute("aria-expanded", String(open));
    box.replaceChildren(...found.map((m, i) => h(`button.hp-hit${i === active ? ".is-on" : ""}${m.kind === "ask" ? ".is-ask" : ""}`, {
      type: "button", role: "option", "aria-selected": String(i === active), dataset: { hit: m.kind === "tool" ? m.t.id : m.kind === "app" ? `app-${m.a.id}` : "ask" },
      // (a press, not a click: the field would lose the focus first, and the list with it)
      on: { pointerdown: (e) => (e.preventDefault(), pick(m)) },
    },
    h("span.hp-hit-icon", {}, m.kind === "tool" ? sprite(m.t.icon) : m.kind === "app" ? sprite("tool-templates") : sprite("tool-shelf")),
    h("span.hp-hit-name", {}, m.kind === "ask" ? h("span", {}, "No tool of that name: ask Truffle ", h("i", {}, `“${m.name}”`)) : m.name),
    m.kind === "ask" ? h("span.hp-hit-where", {}, "Truffle") : h("span.hp-hit-where", {}, m.where),
    m.way ? h(`span.ut-hm-mark.is-${m.way}`, {}, MARK[m.way]) : null)));
  }
  function pick(m) {
    if (!m) return;
    const text = query.trim();
    query = "";
    input.value = "";
    draw();
    input.blur();
    if (m.kind === "app") openApp(m.a);
    else if (m.kind === "tool") openTool(m.t);
    else if (text) tell(text);
  }

  // ------------------------------------------------------------ the way into every workspace
  const pills = h("nav.hp-pills", { "aria-label": "Workspaces" }, ...WORKSPACES.filter((w) => w.id !== "home").map((w) =>
    h("button.hp-pill", { type: "button", dataset: { go: w.id }, on: { click: () => setWorkspace(w.id) } }, sprite(w.icon), h("span", {}, w.name))));

  // ------------------------------------------------------------ the status card: what runs, what today has cost
  const thumb = h("span.hp-st-thumb", {});
  const name = h("b.hp-st-name", {});
  const pct = h("span.hp-st-pct", {});
  const bar = h("i", {});
  const sub = h("span.hp-st-sub", {});
  const credits = h("span.hp-st-credits", {});
  const spark = h("span.hp-st-spark", {});
  const status = h("aside.hp-status", { "aria-label": "What is running" },
    h("div.hp-st-top", {}, thumb, h("div.hp-st-text", {}, h("div.hp-st-row", {}, name, pct), h("span.hp-st-bar", { role: "progressbar" }, bar), sub)),
    h("div.hp-st-foot", {}, spark, credits));

  const el = h("header.hp-head", {},
    pet,
    h("div.hp-ask", {}, h("h1", {}, "What shall we ", h("em", {}, "make or fix"), "?"), field, pills),
    status);

  function update() {
    const running = utensils.jobs.find((j) => j.status === "running");
    const last = utensils.jobs[0];
    const job = running ?? last;
    const { total, hours } = creditsToday();
    if (job) {
      const t = toolById(job.tool);
      const p = Math.round((job.progress ?? 0) * 100);
      thumb.replaceChildren(sprite(t.icon));
      thumb.className = "hp-st-thumb is-icon";
      name.textContent = job.label;
      pct.textContent = job.status === "running" ? (p > 1 ? `${p}%` : "…") : job.status === "done" ? "Done" : job.status === "failed" ? "Failed" : "Stopped";
      bar.style.width = `${job.status === "done" ? 100 : p}%`;
      status.dataset.state = job.status;
      sub.textContent = job.status === "running" ? (typeof job.credits === "number" ? `≈ ${Math.round(job.credits)} cr` : "on your machine") : "";
    } else {
      const r = utensils.results[0];
      status.dataset.state = "idle";
      thumb.className = "hp-st-thumb";
      thumb.replaceChildren(r && r.kind === "image" ? h("img", { src: r.url, alt: "", draggable: false }) : r && r.kind === "video" ? h("video", { src: r.url, muted: true, preload: "metadata", playsInline: true }) : sprite("tool-shelf"));
      if (!r) thumb.classList.add("is-icon");
      name.textContent = "Nothing running";
      pct.textContent = "";
      bar.style.width = "0%";
      sub.textContent = r ? `Last: ${toolById(r.tool).name}, ${ago(r.at)}` : "What you run shows here";
    }
    credits.innerHTML = `<b>${total}</b> cr today`;
    const now = new Date().getHours();
    const max = Math.max(1, ...hours);
    const pts = hours.slice(0, now + 1).map((v, i) => `${((i / Math.max(1, now)) * 100).toFixed(1)},${(92 - (v / max) * 76).toFixed(1)}`).join(" ");
    spark.innerHTML = total > 0 && now > 0
      ? `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`
      : `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="92" x2="100" y2="92" stroke="currentColor" stroke-opacity=".3" stroke-width="1.4" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/></svg>`;
    // a list that is open reads the tools and the apps as they are now
    if (!box.hidden) draw();
  }
  const sig = () => JSON.stringify([
    utensils.jobs.map((j) => [j.id, j.status, Math.round((j.progress ?? 0) * 100)]), creditsToday().total, utensils.results[0]?.id, shelfTools().length, apps.list.length,
  ]);
  return { el, update, sig };
}
