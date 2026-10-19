// Prompts where each @name is a pill: a reference, a control map, or someone's sheet. The words
// underneath stay plain ("@mia sips her coffee"), so whatever reads a prompt reads it as before;
// hovering a pill shows what it stands for. A sheet's words and pictures go to the model when the
// prompt is sent (expandTags), so the prompt you read stays short.
import { h } from "./dom.js";
import { peekPills } from "./peek.js";

const NAME = /[a-z0-9-]/i;
const TAGS = /@([a-z0-9][a-z0-9-]*)/gi;

/** A pill for @name: its face (a picture or a colour) and its name. */
export function pill(name, info) {
  return h("span.pill", { contentEditable: "false", dataset: { name } },
    info?.url ? h("img", { src: info.url, alt: "", draggable: false }) : info?.color ? h("i", { style: { background: info.color } }) : null,
    `@${name}`);
}

/** Words with their known @names as pills, to read; the pills peek on hover. */
export function pillText(tag, text, lookup) {
  const el = h(tag, {}, ...pieces(text, lookup));
  peekPills(el, lookup);
  return el;
}

/** The text cut into plain runs and pills (only names lookup knows, and only whole ones). */
function pieces(text, lookup, caret = -1) {
  const out = [];
  let at = 0;
  for (const m of text.matchAll(TAGS)) {
    const end = m.index + m[0].length;
    const info = lookup(m[1].toLowerCase());
    // a name still being typed (the caret at its end, nothing after it) waits to be whole
    const typing = caret === end && end === text.length;
    if (!info || NAME.test(text[end] ?? "") || typing) continue;
    if (m.index > at) out.push(document.createTextNode(text.slice(at, m.index)));
    out.push(pill(m[1].toLowerCase(), info));
    at = end;
  }
  if (at < text.length) out.push(document.createTextNode(text.slice(at)));
  return out;
}

/** What a field's nodes say as plain text: pills as @name. */
function serialize(node) {
  let s = "";
  for (const n of node.childNodes) {
    if (n.nodeType === Node.TEXT_NODE) s += n.nodeValue;
    else if (n.classList?.contains("pill")) s += `@${n.dataset.name}`;
    else if (n.nodeName === "BR") s += "\n";
    else {
      if ((n.nodeName === "DIV" || n.nodeName === "P") && s && !s.endsWith("\n")) s += "\n";
      s += serialize(n);
    }
  }
  return s.replace(/ /g, " ");
}

/**
 * A prompt field with pills. It answers like a textarea (value, selectionStart,
 * setSelectionRange, focus, addEventListener…), so the composers keep their code; .el is the
 * element to put on the page. lookup(name) says what a name is, or nothing; peek: false leaves out
 * the card a hovered pill shows.
 */
export function pillField({ placeholder = "", label = "", lookup = () => null, className = "", peek = true } = {}) {
  const el = h(`div.pill-field${className ? `.${className.split(" ").join(".")}` : ""}`, {
    contentEditable: "true", role: "textbox", "aria-multiline": "true", "aria-label": label, spellcheck: true, dataset: { placeholder },
  });
  const plainOffset = (node, offset) => {
    const r = document.createRange();
    r.setStart(el, 0);
    r.setEnd(node, offset);
    const holder = document.createElement("div");
    holder.append(r.cloneContents());
    return serialize(holder).length;
  };
  const caret = () => {
    const sel = getSelection();
    if (!sel.rangeCount || !el.contains(sel.focusNode)) return -1;
    return plainOffset(sel.focusNode, sel.focusOffset);
  };
  const placeCaret = (n) => {
    const sel = getSelection();
    const r = document.createRange();
    let left = n;
    for (const node of el.childNodes) {
      const len = node.nodeType === Node.TEXT_NODE ? node.nodeValue.length : serialize({ childNodes: [node] }).length;
      if (node.nodeType === Node.TEXT_NODE && left <= len) {
        r.setStart(node, left);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
        return;
      }
      if (node.nodeType !== Node.TEXT_NODE && left < len) {
        r.setStartAfter(node);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
        return;
      }
      left -= len;
    }
    r.selectNodeContents(el);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
  };
  // the pills the words call for, against those on the page: drawn again only when they differ
  const shape = (nodes) => nodes.map((n) => (n.classList?.contains("pill") ? `[@${n.dataset.name}]` : "·")).join("").replace(/·+/g, "·");
  const draw = (text, at = caret()) => {
    const want = pieces(text, lookup, at);
    if (shape(want) === shape([...el.childNodes]) && serialize(el) === text) return;
    const focused = document.activeElement === el;
    el.replaceChildren(...want);
    if (focused && at >= 0) placeCaret(at);
  };
  el.addEventListener("input", (e) => {
    if (e.isComposing) return;
    const text = serialize(el);
    if (!text) return el.replaceChildren();
    draw(text);
  });
  // new lines and pastes are plain text: no <div>s, no styles
  el.addEventListener("beforeinput", (e) => {
    if (e.inputType === "insertParagraph" || e.inputType === "insertLineBreak") {
      e.preventDefault();
      document.execCommand("insertText", false, "\n");
    } else if (e.inputType === "insertFromPaste" || e.inputType === "insertFromDrop") {
      const text = e.dataTransfer?.getData("text/plain");
      e.preventDefault();
      if (text) document.execCommand("insertText", false, text);
    } else if (e.inputType.startsWith("format")) e.preventDefault();
  });
  // a pill typed out whole becomes one when the caret leaves it
  el.addEventListener("blur", () => draw(serialize(el), -1));
  // (a field whose pills point at pictures already on screen goes without the hover card)
  if (peek) peekPills(el, lookup);
  const api = {
    el,
    get value() {
      return serialize(el);
    },
    set value(v) {
      const text = String(v ?? "");
      el.replaceChildren(...pieces(text, lookup));
      if (document.activeElement === el) placeCaret(text.length);
    },
    get selectionStart() {
      const c = caret();
      return c < 0 ? serialize(el).length : c;
    },
    get selectionEnd() {
      return api.selectionStart;
    },
    setSelectionRange(a) {
      draw(serialize(el), -1);
      placeCaret(a);
    },
    set placeholder(v) {
      el.dataset.placeholder = v;
    },
    get placeholder() {
      return el.dataset.placeholder;
    },
    /** Draws the pills again, when what the names stand for has changed. */
    refresh: () => draw(serialize(el), caret()),
    focus: (o) => el.focus(o),
    blur: () => el.blur(),
    addEventListener: (...a) => el.addEventListener(...a),
    dispatchEvent: (e) => el.dispatchEvent(e),
    get style() {
      return el.style;
    },
    get scrollHeight() {
      return el.scrollHeight;
    },
  };
  return api;
}

/**
 * What the model reads: each sheet's pill, the first time, carries its words and its pictures
 * ("Mia (who looks exactly like @mia: a woman in her late twenties…)"), then its name alone.
 * cast: [{ tag, name, person, words, pictures: [@names] }]. Other @names stay as they are.
 */
export function expandTags(text, cast = []) {
  const by = new Map(cast.map((c) => [c.tag, c]));
  const seen = new Set();
  return text.replace(TAGS, (all, raw, at, whole) => {
    const c = by.get(raw.toLowerCase());
    if (!c || NAME.test(whole[at + all.length] ?? "")) return all;
    if (seen.has(c.tag)) return c.name;
    seen.add(c.tag);
    const pics = (c.pictures ?? []).map((n) => `@${n}`).join(" and ");
    const inner = [pics ? (c.person ? `who looks exactly like ${pics}` : `exactly as in ${pics}`) : "", c.words].filter(Boolean).join(": ");
    return inner ? `${c.name} (${inner})` : c.name;
  });
}
