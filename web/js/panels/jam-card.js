// The card the track's and the words' workspaces are made of: a title in the display weight with a line of what it is for in
// mono under it, keys on its right, and a way to open it larger in a window. (The older bentos of jam-ui.js are the other
// workspaces'.) Its body is whatever the workspace puts in it.
import { h } from "../dom.js";
import { openWindow } from "../jam.js";
import { jicon } from "./jam-ui.js";

/** A card: `win` names the window its expand key opens (none: no key), `tools` are keys beside it. */
export function card({ id, title, sub = "", win = id, tools = [], cls = "" }, ...body) {
  return h(`section.jt-card.jt-c-${id}${cls ? `.${cls}` : ""}`, { dataset: { card: id } },
    h("header.jt-card-head", {},
      h("div.jt-card-title", {}, h("h3", { "aria-level": "2" }, title), sub ? h("p", {}, sub) : null),
      h("div.jt-card-tools", {}, ...tools,
        win ? h("button.jt-expand", { type: "button", title: `${title.charAt(0)}${title.slice(1).toLowerCase()} in a window`, "aria-label": `${title} in a window`, on: { click: () => openWindow(win) } }, jicon("expand")) : null)),
    h("div.jt-card-body", {}, ...body));
}

/** A pair of keys that say which of a few is on (a segmented control), each [value, label]. */
export function segs(options, value, onPick, { label, cls = "" } = {}) {
  return h(`div.jt-segs${cls ? `.${cls}` : ""}`, { role: "group", "aria-label": label },
    ...options.map(([v, text, title]) => h("button.jt-seg", { type: "button", title: title ?? "", "aria-pressed": String(value === v), on: { click: () => onPick(v) } }, text)));
}
