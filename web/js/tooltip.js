// Tooltips: any element with a title (or data-tooltip) gets one shared floating tip after 400 ms
// of hover, 100 ms on keyboard focus, and a long press on touch (which then does nothing else).
// One fact per tip: a label, and after " — " or a line break a hint in dim ink;
// data-tooltip-key="Ctrl Enter" shows the shortcut as keycaps; data-tooltip-side picks the side
// (top by default), and it flips when there is no room.

const GAP = 8, EDGE = 8, LONG_PRESS = 500;
const OPPOSITE = { top: "bottom", bottom: "top", left: "right", right: "left" };

function make(tag, className, text) {
  const el = document.createElement(tag);
  el.className = className;
  if (text) el.textContent = text;
  return el;
}

function fill(tip, el) {
  const raw = el.dataset.tooltip;
  const cut = raw.search(/\n| — /);
  const label = cut < 0 ? raw : raw.slice(0, cut);
  const hint = cut < 0 ? "" : raw.slice(cut).replace(/^\n| — /, "").trim();
  const text = make("span", "tip-text");
  text.append(make("span", "tip-label", label.trim()));
  if (hint) text.append(make("span", "tip-hint", hint));
  tip.replaceChildren(text);
  const keys = (el.dataset.tooltipKey || "").split(/\s+|\+/).filter(Boolean);
  if (keys.length) {
    const group = make("span", "tip-keys");
    group.append(...keys.map((k) => make("kbd", "kbd", k)));
    tip.append(group);
  }
}

function place(tip, el, pointerX) {
  const r = el.getBoundingClientRect();
  const b = tip.getBoundingClientRect();
  const room = { top: r.top, bottom: innerHeight - r.bottom, left: r.left, right: innerWidth - r.right };
  const need = { top: b.height, bottom: b.height, left: b.width, right: b.width };
  let side = OPPOSITE[el.dataset.tooltipSide] ? el.dataset.tooltipSide : "top";
  if (room[side] < need[side] + GAP + EDGE && room[OPPOSITE[side]] > room[side]) side = OPPOSITE[side];
  const clamp = (v, size, max) => Math.max(EDGE, Math.min(v, max - size - EDGE));
  let x, y;
  if (side === "top" || side === "bottom") {
    // over the pointer on a target wider than a tip could sensibly point at
    const centre = r.width > 240 && pointerX != null ? Math.max(r.left, Math.min(pointerX, r.right)) : r.left + r.width / 2;
    x = centre - b.width / 2;
    y = side === "top" ? r.top - b.height - GAP : r.bottom + GAP;
  } else {
    y = r.top + r.height / 2 - b.height / 2;
    x = side === "left" ? r.left - b.width - GAP : r.right + GAP;
  }
  tip.dataset.side = side;
  tip.style.left = `${Math.round(clamp(x, b.width, innerWidth))}px`;
  tip.style.top = `${Math.round(clamp(y, b.height, innerHeight))}px`;
}

/** A title becomes a tip: the browser's own tooltip would show the same words twice. */
function migrate(root) {
  if (root.nodeType !== 1) return;
  for (const el of [root, ...root.querySelectorAll("[title]")]) {
    if (el.hasAttribute("title") && !el.closest("svg") && el.tagName !== "IFRAME") {
      const text = el.getAttribute("title");
      el.removeAttribute("title");
      if (text) el.dataset.tooltip = text;
      else delete el.dataset.tooltip;
    }
  }
}

export function installTooltips() {
  if (document.getElementById("tip")) return;
  const tip = make("div", "tip");
  tip.id = "tip";
  tip.setAttribute("role", "tooltip");
  tip.popover = "manual";
  document.body.append(tip);
  let target = null, timer, pointerX = null;
  const describe = (el, on) => {
    const ids = new Set((el.getAttribute("aria-describedby") || "").split(" ").filter(Boolean));
    on ? ids.add(tip.id) : ids.delete(tip.id);
    ids.size ? el.setAttribute("aria-describedby", [...ids].join(" ")) : el.removeAttribute("aria-describedby");
  };
  const hide = () => {
    clearTimeout(timer);
    if (tip.matches(":popover-open")) tip.hidePopover();
    if (target) describe(target, false);
    target = null;
  };
  const show = (el, delay, x = null) => {
    hide();
    if (!el?.dataset.tooltip || el.matches(":disabled")) return;
    pointerX = x;
    timer = setTimeout(() => {
      if (!el.isConnected) return;
      target = el;
      fill(tip, el);
      describe(el, true);
      tip.showPopover();
      place(tip, el, pointerX);
    }, delay);
  };
  document.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse") return;
    const el = e.target.closest("[data-tooltip]");
    if (el && !el.contains(e.relatedTarget)) show(el, 400, e.clientX);
  });
  document.addEventListener("pointerout", (e) => {
    if (e.pointerType !== "mouse") return;
    const el = e.target.closest("[data-tooltip]");
    if (el && !el.contains(e.relatedTarget)) hide();
  });
  // a finger has no hover: a long press reads the tip, and that press does nothing else
  let press = null, lastTouch = 0;
  document.addEventListener("pointerdown", (e) => {
    clearTimeout(press?.timer);
    press = null;
    if (e.pointerType === "mouse") return;
    lastTouch = Date.now();
    const el = e.target.closest("[data-tooltip]");
    if (!el) return;
    press = { x: e.clientX, y: e.clientY, shown: false };
    press.timer = setTimeout(() => ((press.shown = true), show(el, 0, press.x)), LONG_PRESS);
  });
  document.addEventListener("pointermove", (e) => {
    if (press && !press.shown && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) {
      clearTimeout(press.timer);
      press = null;
    }
  });
  for (const type of ["pointerup", "pointercancel"]) document.addEventListener(type, () => press && !press.shown && (clearTimeout(press.timer), (press = null)));
  document.addEventListener("click", (e) => {
    if (press?.shown) {
      e.preventDefault();
      e.stopPropagation();
      press = null;
    }
  }, true);
  document.addEventListener("focusin", (e) => Date.now() - lastTouch > 800 && show(e.target.closest?.("[data-tooltip]"), 100));
  document.addEventListener("focusout", hide);
  document.addEventListener("pointerdown", hide, true);
  document.addEventListener("keydown", (e) => e.key === "Escape" && hide(), true);
  document.addEventListener("scroll", hide, true);
  // the panels redraw all the time: every title they add becomes a tip
  migrate(document.body);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "attributes") migrate(r.target);
      else r.addedNodes.forEach(migrate);
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["title"] });
}
