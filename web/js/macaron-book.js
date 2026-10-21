// The Brand book workspace: the guidelines document built from the kit (a cover, the story, the logo, the colour, the type, the
// voice, the imagery, the rules, the examples), the brand guard's audit of everything made, the handoff package. The book is a
// fan of its live pages with the list of them beside it (a tick on a page that is whole, an orange dot on a thin one); it opens
// as a viewer; it leaves as a PDF or as one HTML file. A workspace is { el, update, sig }: the panel (panels/macaron.js) draws
// it again when sig() changes. The pages are macaron-book-render.js's, what they hold and how whole they are is
// macaron-book-model.js's, the audit macaron-book-audit.js's.
import { h, icon, sprite } from "./dom.js";
import { changed, toast } from "./store.js";
import { kitOf, cssName } from "./design.js";
import { macaron, setSpace, save, setKit, thumb, kitFiles } from "./macaron.js";
import { bento, mcicon, fill, key } from "./macaron-ui.js";
import { defineWindow, openWin, closeWin, closeAll } from "./macaron-win.js";
import { draftKey } from "./macaron-tools.js";
import { PAGES, PAGE_W, PAGE_H, pageStatus, bookSig, bookText, pageById, TEXT_PAGES } from "./macaron-book-model.js";
import { renderPage, drawnPage, pageJpegs } from "./macaron-book-render.js";
import { auditOf } from "./macaron-book-audit.js";
import { buildPdf, base64Of } from "./macaron-pdf.js";

const two = (n) => String(n).padStart(2, "0");
const slug = (b) => (b?.name ?? "brand").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** What the book remembers between draws: the page open, what is being made, the sizes of what was. */
const book = { page: 0, busy: null, sizes: {}, edit: "cover" };
const kb = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const redraw = () => changed("macaron");

/** The pages with the state of each, for the brand open (worked out from its body each time, never kept). */
const statusNow = () => pageStatus(macaron.brand.body);

// ---------------------------------------------------------------- what leaves

function download(blob, name) {
  const a = h("a", { href: URL.createObjectURL(blob), download: name, rel: "noopener" });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** The palette and the type as variables for the web (the same file the kit's export makes). */
export const kitCss = (kit) => `:root {\n${kit.palette.map((p) => `  --${cssName(p)}: ${p.hex.toUpperCase()}; /* ${p.name}${p.role ? `, ${p.role}` : ""} */`).join("\n")}\n  --font-display: "${kit.type.display.family}";\n  --font-text: "${kit.type.text.family}";\n  --font-mono: "${kit.type.mono.family}";\n}\n`;
/** The kit as data: palette, type, voice, rules and the logo list. */
export const kitJson = (b) => {
  const kit = kitOf(b.body);
  return JSON.stringify({ name: b.name, palette: kit.palette, type: kit.type, voice: b.body.kit.voice, rules: b.body.kit.rules, logos: kit.logos.map(({ id, name, kind, tone, ground, url }) => ({ id, name, kind, tone, ground, url })) }, null, 2);
};

/** Makes the pages as files, showing how far it is; answers null when one is already being made. */
async function withPages(kind, run) {
  if (book.busy || !macaron.brand) return null;
  const brand = macaron.brand;
  book.busy = { kind, done: 0 };
  redraw();
  try {
    const pages = await pageJpegs(brand, (done) => ((book.busy.done = done), redraw()));
    return await run(pages, brand);
  } catch (e) {
    toast(e.message, { tone: "crit" });
    return null;
  } finally {
    book.busy = null;
    redraw();
  }
}

export const exportPdf = () =>
  withPages("pdf", (pages, brand) => {
    const bytes = buildPdf(pages, { title: `${brand.name} · Brand guidelines`, author: brand.name });
    book.sizes.pdf = bytes.length;
    download(new Blob([bytes], { type: "application/pdf" }), `${slug(brand)}-brand-book.pdf`);
    toast(`The book: ${pages.length} pages, ${kb(bytes.length)}.`);
  });

/** The whole book as one HTML file: the pages as pictures inside it, a bar to move between them, nothing it needs from outside. */
function htmlBook(pages, brand) {
  const kit = kitOf(brand.body);
  const ink = kit.palette.find((p) => p.id === "ink")?.hex ?? "#19191c";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const names = PAGES.map((p, i) => `<a href="#p${i + 1}">${two(i + 1)} ${esc(p.name)}</a>`).join("");
  const imgs = pages.map((p, i) => `<section id="p${i + 1}"><img alt="${esc(PAGES[i].name)}" src="data:image/jpeg;base64,${base64Of(p.jpeg)}" width="${p.width}" height="${p.height}"></section>`).join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(brand.name)} · Brand guidelines</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:${ink};color:#f0efed;font:500 14px/1.4 system-ui,sans-serif}
nav{position:sticky;top:0;z-index:2;display:flex;gap:6px;flex-wrap:wrap;justify-content:center;padding:12px;background:${ink}ee;backdrop-filter:blur(8px)}
nav a{padding:7px 12px;border-radius:99px;color:#c9c8c6;text-decoration:none;font-size:13px}nav a:hover{background:#ffffff18;color:#fff}
main{display:grid;gap:28px;justify-items:center;padding:20px 12px 80px}section{width:min(100%,920px)}
img{display:block;width:100%;height:auto;border-radius:6px;box-shadow:0 18px 60px #0008}
h1{margin:0;padding:22px 12px 0;text-align:center;font-size:15px;letter-spacing:.2em;text-transform:uppercase;color:#c9c8c6}
</style></head><body>
<h1>${esc(brand.name)} · Brand guidelines</h1><nav>${names}</nav>
<main>
${imgs}
</main>
<script>addEventListener("keydown",function(e){var s=[].slice.call(document.querySelectorAll("section")),y=scrollY+innerHeight/2,i=s.findIndex(function(x){return x.offsetTop+x.offsetHeight>y});if(e.key==="ArrowRight"||e.key==="ArrowDown"||e.key==="PageDown"){e.preventDefault();(s[i+1]||s[i]).scrollIntoView({behavior:"smooth"})}if(e.key==="ArrowLeft"||e.key==="ArrowUp"||e.key==="PageUp"){e.preventDefault();(s[i-1]||s[0]).scrollIntoView({behavior:"smooth"})}})</script>
</body></html>
`;
}
export const exportHtml = () =>
  withPages("html", (pages, brand) => {
    const text = htmlBook(pages, brand);
    book.sizes.html = text.length;
    download(new Blob([text], { type: "text/html" }), `${slug(brand)}-brand-book.html`);
    toast(`One file, ${kb(text.length)}.`);
  });

async function logoFiles() {
  const files = kitFiles();
  for (const f of files) {
    const a = h("a", { href: f.url, download: f.name });
    document.body.append(a);
    a.click();
    a.remove();
    await new Promise((r) => setTimeout(r, 250));
  }
  toast(`${files.length} logo files.`);
}
const copyKit = () => navigator.clipboard?.writeText(kitJson(macaron.brand)).then(() => toast("The kit is copied."), () => toast("Could not copy.", { tone: "crit" }));

// ---------------------------------------------------------------- going to what fixes a page

/** The window or place that fixes a page: the book's own page window for the words it takes, else the kit's. */
export function fixPage(id) {
  const s = pageStatus(macaron.brand.body).find((p) => p.id === id);
  if (!s) return;
  if (["cover", "story", "imagery"].includes(id)) {
    book.edit = id;
    return openWin("bookpage");
  }
  if (id === "examples") return (closeAll(), setSpace("create"), openWin("posts"));
  openWin(s.fix.win);
}
export function showPage(id) {
  const i = PAGES.findIndex((p) => p.id === id);
  if (i < 0) return;
  book.page = i;
  redraw();
}
const step = (d) => ((book.page = (book.page + d + PAGES.length) % PAGES.length), redraw());

/** The words of a page of the book, set (the brand saves it). */
function setBookText(id, text) {
  const body = macaron.brand.body;
  ((body.book ??= { pages: {} }).pages ??= {})[id] = String(text).slice(0, 900);
  save();
  redraw();
}

// ---------------------------------------------------------------- the pages on screen

/** A small canvas that shows a page, drawn from the page's full one when it is there. */
function pageCanvas(id, width = 800) {
  const c = h("canvas.bk-canvas", { width, height: Math.round((width * PAGE_H) / PAGE_W), dataset: { page: id } });
  return c;
}
function paint(canvas, id) {
  const full = drawnPage(id, macaron.brand);
  if (!full) return false;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(full, 0, 0, canvas.width, canvas.height);
  return true;
}

// ---------------------------------------------------------------- the workspace

export function bookSpace() {
  const el = h("div.mc-grid.is-book");
  const canvases = PAGES.map((p) => pageCanvas(p.id));
  const sheets = PAGES.map((p, i) => h("button.bk-pg", { type: "button", "aria-label": `Page ${i + 1}: ${p.name}`, title: p.name, on: { click: () => (book.page === i ? openWin("bookview") : ((book.page = i), redraw())) } }, canvases[i]));
  const fan = h("div.bk-fan", {}, ...sheets);
  const list = h("nav.bk-list", { "aria-label": "Pages" });
  const counter = h("span.bk-count");
  const cap = h("div.bk-cap");
  const pager = h("div.bk-pager", {},
    h("button.mc-iconkey", { type: "button", title: "Previous page", "aria-label": "Previous page", on: { click: () => step(-1) } }, mcicon("chevLeft")),
    counter,
    h("button.mc-iconkey", { type: "button", title: "Next page", "aria-label": "Next page", on: { click: () => step(1) } }, mcicon("chev")),
    h("span.spacer"),
    h("button.mc-iconkey", { type: "button", title: "Open the book", "aria-label": "Open the book", on: { click: () => openWin("bookview") } }, mcicon("expand")));
  const view = bento("is-bookview", "Brand book preview", () => openWin("bookview"),
    h("p.mc-hint", {}, "A complete brand guide, built from your kit."),
    h("div.bk-stage", {}, list, h("div.bk-fanbox", {}, fan, cap, pager)));
  const auditBox = h("div.bk-audit");
  const handoffBox = h("div.bk-handoff");
  const shareBox = h("div.bk-share");
  el.append(view,
    bento("is-audit", "Brand guard audit", () => openWin("bookaudit"), auditBox),
    bento("is-handoff", "Handoff package", () => openWin("exportkit"), handoffBox),
    bento("is-share", "Share", null, shareBox));

  let seen = "";
  let token = 0;
  let timer = 0;

  function drawList(status) {
    fill(list, ...status.map((p, i) => h(`button.bk-item${i === book.page ? ".is-on" : ""}`, { type: "button", title: p.ok ? p.name : `${p.name}: ${p.reason}`, dataset: { page: p.id, thin: p.ok ? "" : "1" }, on: { click: () => ((book.page = i), redraw()) } },
      h("span.bk-item-n", {}, two(p.n)),
      h("span.bk-item-name", {}, p.name),
      p.ok ? h("span.bk-ok", {}, icon("check")) : h("span.bk-thin", { title: p.reason }))));
  }
  function place() {
    sheets.forEach((s, i) => {
      const d = i - book.page;
      s.style.setProperty("--d", String(d));
      s.dataset.at = d < 0 ? "gone" : d === 0 ? "front" : d <= 4 ? "back" : "far";
      s.tabIndex = d >= 0 && d <= 4 ? 0 : -1;
    });
    counter.textContent = `${two(book.page + 1)} / ${two(PAGES.length)}`;
  }
  function drawCap(status) {
    const here = status[book.page];
    fill(cap, h("b", {}, here.label), h("span", { dataset: { tone: here.ok ? "ok" : "warn" } }, here.ok ? "Complete" : here.reason));
  }
  function drawAudit(b) {
    const { score, items } = auditOf(b);
    const shown = items.slice(0, 3);
    fill(auditBox,
      h("div.bk-score", {}, h("div.mc-ring.bk-ring", { style: { "--p": String(score ?? 0) }, role: "img", "aria-label": score === null ? "Nothing to measure yet" : `${score} percent on brand` }, h("b", {}, score === null ? "–" : `${score}%`), h("span", {}, score === null ? "nothing yet" : "on brand"))),
      h("div.bk-flags", {}, ...(shown.length ? shown.map((it) => h("button.bk-flag", { type: "button", dataset: { level: it.level }, title: `${it.title}: ${it.sub}`, on: { click: (e) => (e.stopPropagation(), it.go()) } },
        h("span.bk-flag-pic", {}, flagPicture(b, it)),
        h("span.bk-flag-text", {}, h("b", {}, it.title), h("em", {}, it.sub)),
        h("span.lamp", { dataset: { tone: it.level === "bad" ? "crit" : "warn" } }),
        h("span.bk-go", {}, mcicon("chev")))) : [h("p.bk-clear", {}, h("span.bk-ok", {}, icon("check")), "Nothing is flagged: every post sits inside the brand.")])),
      items.length > shown.length ? h("span.bk-more", {}, `+${items.length - shown.length} more`) : null);
  }
  function drawHandoff(b) {
    const kit = kitOf(b.body);
    const files = kitFiles();
    const busy = book.busy;
    const row = (glyph, name, meta, act, title) => h("button.bk-row", { type: "button", title, "data-keep": "", disabled: !!busy, on: { click: (e) => (e.stopPropagation(), act()) } },
      h("span.bk-row-glyph", {}, glyph), h("span.bk-row-name", {}, name), h("span.bk-row-meta", {}, meta), h("span.bk-row-dl", {}, icon("download")));
    fill(handoffBox,
      row(mcicon("doc"), "Brand book PDF", busy?.kind === "pdf" ? `Page ${busy.done} / ${PAGES.length}` : book.sizes.pdf ? `${PAGES.length} pages · ${kb(book.sizes.pdf)}` : `${PAGES.length} pages`, exportPdf, "Download the book as a PDF"),
      row(h("b", {}, "{ }"), "Colours and type (CSS)", kb(kitCss(kit).length), () => (download(new Blob([kitCss(kit)], { type: "text/css" }), `${slug(b)}-colours.css`), toast("The colours and type, as CSS.")), "Download the palette and fonts as CSS variables"),
      row(mcicon("picture"), "Logo files", files.length ? `${files.length} files` : "none yet", () => (files.length ? logoFiles() : toast("No logo files in the kit yet.")), "Download every logo file as it came in"),
      h("button.bk-export", { type: "button", "data-keep": "", disabled: !!busy, on: { click: (e) => (e.stopPropagation(), exportPdf()) } }, icon("download"), busy?.kind === "pdf" ? `Making the pages · ${busy.done} / ${PAGES.length}` : "Export the book"));
  }
  function drawShare() {
    const busy = book.busy;
    fill(shareBox,
      h("button.bk-row", { type: "button", disabled: !!busy, title: "Download the whole book as one HTML file, pictures inside, to send as it is", on: { click: exportHtml } },
        h("span.bk-row-glyph", {}, mcicon("export")), h("span.bk-row-name", {}, "The book as one HTML file"), h("span.bk-row-meta", {}, busy?.kind === "html" ? `Page ${busy.done} / ${PAGES.length}` : book.sizes.html ? kb(book.sizes.html) : "opens anywhere"), h("span.bk-row-dl", {}, icon("download"))),
      h("button.bk-row", { type: "button", title: "Copy the palette, type, voice, rules and logo list as JSON", on: { click: copyKit } },
        h("span.bk-row-glyph", {}, h("b", {}, "{ }")), h("span.bk-row-name", {}, "Copy the kit as JSON"), h("span.bk-row-meta", {}, "to the clipboard"), h("span.bk-row-dl", {}, sprite("copy"))),
      h("p.mc-hint", {}, "This app keeps everything on your machine, so there is no link to share: send the file."));
  }

  /** The pages are drawn (or taken from where they were kept) one after another; the ones in view first. */
  async function refresh(brand) {
    const mine = ++token;
    const order = [book.page, ...PAGES.map((_, i) => i).filter((i) => i !== book.page)];
    for (const i of order) {
      if (mine !== token || macaron.brand !== brand) return;
      await renderPage(PAGES[i].id, brand);
      if (mine !== token) return;
      paint(canvases[i], PAGES[i].id);
    }
    // the viewer shows the same pages: it is drawn again when they are in
    changed("macaron-book");
  }

  function update() {
    const b = macaron.brand;
    if (!b) return;
    const status = statusNow();
    drawList(status);
    drawCap(status);
    place();
    drawAudit(b);
    drawHandoff(b);
    drawShare();
    // what is already drawn is shown at once; the rest follows (a typed word is waited for a moment)
    PAGES.forEach((p, i) => paint(canvases[i], p.id));
    const sig = `${b.id}:${bookSig(b.body)}`;
    if (sig !== seen || !PAGES.every((p) => drawnPage(p.id, b))) {
      seen = sig;
      clearTimeout(timer);
      timer = setTimeout(() => refresh(b), 120);
    }
  }
  const sig = () => JSON.stringify([macaron.brand?.id, macaron.brand ? bookSig(macaron.brand.body) : "", book.page, book.busy, book.sizes, macaron.brand?.body.designs.map((d) => d.updatedAt)]);
  return { el, update, sig };
}

/** What a flagged item shows: the post, the logo file or a glyph. */
function flagPicture(b, it) {
  if (it.design) {
    const d = b.body.designs.find((x) => x.id === it.design);
    if (d) return thumb(d, { width: 120 });
  }
  if (it.logo) return h("img", { src: it.logo, alt: "", draggable: false });
  return h("span.bk-glyph", {}, it.glyph === "logo" ? mcicon("logo") : it.glyph ?? "!");
}

// ---------------------------------------------------------------- the windows

/** The viewer: a strip of the pages, the page open as big as the window lets it be, the way to the next, to fixing it, to the PDF. */
function viewWin() {
  const strip = h("nav.bv-strip", { "aria-label": "Pages" });
  const stripCanvases = PAGES.map((p) => pageCanvas(p.id, 240));
  const big = h("canvas.bv-page", { width: PAGE_W, height: PAGE_H });
  const name = h("b.bv-name");
  const note = h("span.bv-note");
  const edit = h("button.mc-primary.is-quiet.bv-edit", { type: "button", title: "Fix or write this page", on: { click: () => fixPage(PAGES[book.page].id) } }, mcicon("pencil"), h("span", {}, "Edit this page"));
  const bar = h("div.bv-bar", {},
    h("button.mc-iconkey", { type: "button", title: "Previous page (←)", "aria-label": "Previous page", on: { click: () => step(-1) } }, mcicon("chevLeft")),
    h("button.mc-iconkey", { type: "button", title: "Next page (→)", "aria-label": "Next page", on: { click: () => step(1) } }, mcicon("chev")),
    h("div.bv-title", {}, name, note), h("span.spacer"), edit);
  const stage = h("div.bv-stage", {}, big);
  const el = h("div.mc-w.is-bookviewer", {}, strip, h("div.bv-main", {}, bar, stage));
  const keys = (e) => {
    if (macaron.win !== "bookview" || e.target.closest?.("input, textarea, select")) return;
    if (e.key === "ArrowRight") (e.preventDefault(), step(1));
    if (e.key === "ArrowLeft") (e.preventDefault(), step(-1));
  };
  document.addEventListener("keydown", keys);
  let token = 0;
  async function update() {
    const b = macaron.brand;
    if (!b) return;
    const status = statusNow();
    const here = status[book.page];
    fill(strip, ...status.map((p, i) => h(`button.bv-thumb${i === book.page ? ".is-on" : ""}`, { type: "button", title: p.ok ? p.name : `${p.name}: ${p.reason}`, dataset: { thin: p.ok ? "" : "1" }, on: { click: () => ((book.page = i), redraw()) } },
      stripCanvases[i], h("span.bv-thumb-n", {}, two(p.n)), p.ok ? null : h("span.bk-thin"))));
    stripCanvases.forEach((c, i) => paint(c, PAGES[i].id));
    name.textContent = `${two(here.n)}  ${here.name}`;
    note.textContent = here.ok ? "Complete" : here.reason;
    note.dataset.tone = here.ok ? "ok" : "warn";
    const mine = ++token;
    const full = await renderPage(here.id, b);
    if (mine !== token) return;
    big.getContext("2d").drawImage(full, 0, 0);
    stripCanvases.forEach((c, i) => paint(c, PAGES[i].id));
  }
  const sig = () => JSON.stringify([book.page, macaron.brand ? bookSig(macaron.brand.body) : "", book.busy]);
  const foot = [];
  const status = h("span.bv-status");
  const pdf = h("button.mc-primary", { type: "button", on: { click: exportPdf } }, icon("download"), h("span", {}, "Export PDF"));
  const html = h("button.mc-iconkey.bv-html", { type: "button", title: "The whole book as one HTML file", "aria-label": "The whole book as one HTML file", on: { click: exportHtml } }, mcicon("export"));
  foot.push(status, h("span.spacer"), html, pdf);
  const part = { el, update, sig, foot, tick: () => {
    pdf.disabled = html.disabled = !!book.busy;
    pdf.querySelector("span").textContent = book.busy?.kind === "pdf" ? `Making the pages · ${book.busy.done} / ${PAGES.length}` : "Export PDF";
    status.textContent = book.sizes.pdf ? `Last PDF: ${kb(book.sizes.pdf)}` : "";
  } };
  const wrapped = part.update;
  part.update = async () => (part.tick(), wrapped());
  return part;
}
defineWindow("bookview", { eyebrow: "Brand book", title: () => pageById(PAGES[book.page].id).label, sub: () => macaron.brand?.name ?? "", size: "full", advanced: false, make: viewWin, foot: (part) => part.foot });

/** The words a page of the book takes, and the way to what else it is built from. */
function pageWin() {
  const el = h("div.mc-w.is-bookpage");
  const typing = () => el.contains(document.activeElement) && document.activeElement.matches("input, textarea");
  function update() {
    const b = macaron.brand;
    if (!b) return;
    if (typing()) return false;
    const id = book.edit;
    const page = pageById(id);
    const kit = kitOf(b.body);
    const st = statusNow().find((p) => p.id === id);
    const thin = st && !st.ok ? h("p.bp-thin", {}, h("span.bk-thin"), st.reason) : null;
    const go = (text, win, space) => h("button.mc-add-prompt", { type: "button", on: { click: () => (space ? (closeAll(), setSpace(space), openWin(win)) : openWin(win)) } }, icon("plus"), text);
    if (id === "cover") {
      fill(el,
        h("section.mc-sec", {}, h("span.label", {}, "The cover's line"),
          h("input.field.mc-text.mc-statement", { value: kit.tagline ?? "", maxlength: 80, placeholder: "One short line", "aria-label": "Tagline", on: { input: (e) => (setKit("tagline", e.target.value.slice(0, 80)), redraw()) } }),
          h("p.mc-hint", {}, "It sits under the wordmark and in the foot of every page."), thin),
        draftKey("Brioche can write one", "A line that sounds like the brand", "Write the brand's tagline: one short line in the brand's voice, for the cover of the brand book."));
    } else if (id === "story") {
      fill(el,
        h("section.mc-sec", {}, h("span.label", {}, "The story, in your words"),
          h("textarea.field.mc-text.mc-statement", { rows: 4, value: bookText(b.body, "story"), placeholder: "Where the brand comes from, in a few lines", "aria-label": "The story", on: { input: (e) => setBookText("story", e.target.value) } }),
          h("p.mc-hint", {}, "The page already carries the brief's idea, its goals and the direction picked; this is what you add to them."), thin),
        h("section.mc-sec", {}, h("span.label", {}, "What the page is built from"), go("The brief: the idea and the goals", "brief", "idea"), go("The directions", "directions", "idea")),
        draftKey("Brioche can write it", "From the brief and the voice", "Write the story page of the brand book: three or four short lines on where the brand comes from, in the brand's voice."));
    } else {
      fill(el,
        h("section.mc-sec", {}, h("span.label", {}, "A note on the pictures"),
          h("textarea.field.mc-text.mc-statement", { rows: 3, value: bookText(b.body, "imagery"), placeholder: "What the pictures should look and feel like", "aria-label": "Imagery notes", on: { input: (e) => setBookText("imagery", e.target.value) } }),
          h("p.mc-hint", {}, "A line under the pictures. The pictures themselves come from the moodboard, the product and the Studio."), thin),
        h("section.mc-sec", {}, h("span.label", {}, "Where the pictures come from"), go("The moodboard", "mood", "idea"), go("The product and the Studio", "product", "studio")));
    }
    void page;
  }
  const sig = () => JSON.stringify([book.edit, macaron.brand?.body.book, macaron.brand?.body.kit.tagline, macaron.brand ? statusNow().map((p) => p.ok) : 0]);
  return { el, update, sig };
}
defineWindow("bookpage", { eyebrow: "Brand book", title: () => `The ${pageById(book.edit).name.toLowerCase()} page`, sub: () => macaron.brand?.name ?? "", size: "m", advanced: false, make: pageWin, foot: () => [h("span.spacer"), h("button.mc-primary", { type: "button", on: { click: closeWin } }, "Done")] });

/** Everything the brand guard finds, with the post or the file each is about. */
function auditWin() {
  const el = h("div.mc-w.is-bookaudit");
  function update() {
    const b = macaron.brand;
    if (!b) return;
    const { score, items } = auditOf(b);
    fill(el,
      h("div.ba-top", {}, h("div.mc-ring.bk-ring", { style: { "--p": String(score ?? 0) }, role: "img", "aria-label": score === null ? "Nothing to measure yet" : `${score} percent on brand` }, h("b", {}, score === null ? "–" : `${score}%`), h("span", {}, score === null ? "nothing yet" : "on brand")),
        h("p.ba-note", {}, items.length ? `${items.length} ${items.length === 1 ? "thing" : "things"} to look at. Each one goes to where it is fixed.` : "Nothing is flagged: every post sits inside the brand.")),
      h("div.ba-list", {}, ...items.map((it) => h("button.bk-flag.is-wide", { type: "button", dataset: { level: it.level }, on: { click: () => (closeAll(), it.go()) } },
        h("span.bk-flag-pic", {}, flagPicture(b, it)),
        h("span.bk-flag-text", {}, h("b", {}, it.title), h("em", {}, it.sub)),
        h("span.lamp", { dataset: { tone: it.level === "bad" ? "crit" : "warn" } }),
        h("span.bk-go", {}, mcicon("chev"))))));
  }
  return { el, update, sig: () => JSON.stringify([macaron.brand ? bookSig(macaron.brand.body) : "", macaron.brand?.body.designs.map((d) => d.updatedAt)]) };
}
defineWindow("bookaudit", { eyebrow: "Brand book", title: "Brand guard audit", sub: () => macaron.brand?.name ?? "", size: "m", advanced: false, make: auditWin });

export { TEXT_PAGES };
