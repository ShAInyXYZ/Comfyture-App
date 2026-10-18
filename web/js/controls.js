// Hardware-style controls: a detented knob, a segmented selector and a switch.
// Each takes its options and current value and reports changes through onChange.

const SWEEP = 270;

/** A rotary knob with one lit tick per option. Drag, scroll or use the arrow keys. */
export function knob(el, { options, value, onChange, label }) {
  let index = Math.max(0, options.findIndex((o) => o.value === value));
  el.classList.add("knob");
  el.setAttribute("role", "slider");
  el.setAttribute("aria-label", label ?? "Knob");
  el.tabIndex = 0;
  const angle = (i) => (options.length === 1 ? 0 : -SWEEP / 2 + (SWEEP * i) / (options.length - 1));
  el.replaceChildren(
    ...options.map((_, i) => {
      const tick = document.createElement("i");
      tick.className = "knob-tick";
      tick.style.setProperty("--a", `${angle(i)}deg`);
      return tick;
    }),
    Object.assign(document.createElement("span"), { className: "knob-cap" }),
  );

  function paint() {
    el.querySelectorAll(".knob-tick").forEach((t, i) => t.classList.toggle("is-on", i === index));
    el.style.setProperty("--turn", `${angle(index)}deg`);
    el.setAttribute("aria-valuetext", options[index].label);
  }

  function step(to) {
    const next = Math.min(options.length - 1, Math.max(0, to));
    if (next === index) return;
    index = next;
    paint();
    onChange(options[index].value);
  }

  el.addEventListener("keydown", (e) => {
    if (["ArrowUp", "ArrowRight"].includes(e.key)) step(index + 1);
    else if (["ArrowDown", "ArrowLeft"].includes(e.key)) step(index - 1);
    else return;
    e.preventDefault();
  });
  el.addEventListener("wheel", (e) => {
    e.preventDefault();
    step(index + (e.deltaY < 0 ? 1 : -1));
  }, { passive: false });
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const startY = e.clientY;
    const startIndex = index;
    let moved = false;
    el.setPointerCapture(e.pointerId);
    el.classList.add("is-turning");
    const move = (m) => {
      const delta = Math.round((startY - m.clientY) / 18);
      if (delta) moved = true;
      step(startIndex + delta);
    };
    const up = () => {
      el.classList.remove("is-turning");
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      if (!moved) step(index === options.length - 1 ? 0 : index + 1);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  });

  paint();
  return {
    set(v) {
      const i = options.findIndex((o) => o.value === v);
      if (i >= 0) {
        index = i;
        paint();
      }
    },
  };
}

/** A row of mutually exclusive buttons. */
export function selector(el, { options, value, onChange }) {
  el.classList.add("selector");
  el.setAttribute("role", "group");
  el.replaceChildren(
    ...options.map((o) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = o.label;
      b.dataset.value = o.value;
      b.setAttribute("aria-pressed", String(o.value === value));
      b.addEventListener("click", () => {
        el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        onChange(o.value);
      });
      return b;
    }),
  );
}

/** An on/off switch. */
export function toggle(el, { value, onChange, label }) {
  el.classList.add("switch");
  el.setAttribute("role", "switch");
  el.setAttribute("aria-label", label);
  el.setAttribute("aria-checked", String(!!value));
  el.addEventListener("click", () => {
    const next = el.getAttribute("aria-checked") !== "true";
    el.setAttribute("aria-checked", String(next));
    onChange(next);
  });
}

/**
 * Places a floating panel by its trigger: under it, or over it when there is more room there, as wide
 * as asked (or centred on it), never past the window's edge. It is pinned by its top, and a panel
 * taller than its room scrolls.
 */
function float(panel, box, width, centre = false) {
  width = Math.min(innerWidth - 16, width);
  const left = centre ? box.left + (box.width - width) / 2 : box.left;
  Object.assign(panel.style, { left: `${Math.max(8, Math.min(left, innerWidth - width - 8))}px`, width: `${width}px` });
  const below = innerHeight - box.bottom;
  const up = below < panel.offsetHeight + 12 && box.top > below;
  const cap = parseFloat(getComputedStyle(panel).maxHeight) || Infinity;
  const room = Math.max(120, Math.min(cap, (up ? box.top : below) - 14));
  panel.style.maxHeight = `${room}px`;
  const top = up ? box.top - 6 - panel.offsetHeight : box.bottom + 6;
  panel.style.top = `${top}px`;
  return { room, cap, top };
}

/**
 * Keeps a floating panel by its trigger while the page under it scrolls, and closes it once the
 * trigger is out of sight. Returns what stops it.
 */
function stick(panel, trigger, close) {
  const from = trigger.getBoundingClientRect();
  let frame = 0;
  const follow = (e) => {
    if (panel.contains(e.target)) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const now = trigger.getBoundingClientRect();
      if (!trigger.isConnected || now.bottom < 0 || now.top > innerHeight) return close();
      panel.style.translate = `${now.left - from.left}px ${now.top - from.top}px`;
    });
  };
  document.addEventListener("scroll", follow, true);
  return () => (cancelAnimationFrame(frame), document.removeEventListener("scroll", follow, true));
}

/**
 * A select: a trigger showing the chosen item, and a floating menu of the items, each with a second
 * line, a meta (a short value at the row's end) and optional tags; a note closes the menu, and width
 * "fit" makes it only as wide as its rows. Items may carry a group (with a groupIcon and a groupMeta):
 * the menu then lists the groups with the chosen item's open, and another unfolds under the pointer
 * resting on its header, a tap, or the arrows reaching it. Arrows move, Enter picks, Escape or a
 * click elsewhere closes.
 */
export function dropdown({ items, value, onChange, label, onOpen, onClose, note, width: fit }) {
  const current = () => items.find((i) => i.value === value) ?? items[0];
  const chev = '<svg class="sel-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "sel-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-label", label);
  const face = (item) => {
    const text = document.createElement("span");
    text.className = "sel-text";
    const b = document.createElement("span");
    b.className = "sel-label";
    b.textContent = item.label;
    text.append(b);
    if (item.desc) {
      const d = document.createElement("span");
      d.className = "sel-desc";
      d.textContent = item.desc;
      text.append(d);
    }
    return text;
  };
  const draw = () => {
    trigger.replaceChildren(face(current()));
    trigger.insertAdjacentHTML("beforeend", chev);
  };
  draw();

  let menu = null;
  let at = 0;
  let rows = [];
  let groups = new Map();
  let resting = 0;
  let grow = "";
  let unstick = null;
  const close = () => {
    if (!menu) return;
    clearTimeout(resting);
    unstick();
    menu.remove();
    menu = null;
    trigger.dataset.state = "closed";
    document.removeEventListener("pointerdown", outside, true);
    onClose?.();
  };
  const outside = (e) => !menu?.contains(e.target) && !trigger.contains(e.target) && close();
  // A group unfolds below its header, and the header under the pointer must not move: the menu is
  // pinned by its top, the groups above stay as they are and those below fold. Without a pointer
  // (a tap, the arrows), only that group is open.
  const unfold = (name, only = false) => {
    if (grow) menu.style.maxHeight = grow;
    const names = [...groups.keys()];
    const k = names.indexOf(name);
    names.forEach((n, j) => {
      const g = groups.get(n);
      const on = n === name || (!only && j < k && g.fold.classList.contains("is-open"));
      g.head.setAttribute("aria-expanded", String(on));
      g.fold.classList.toggle("is-open", on);
    });
  };
  // a group's header (its glyph, its name, its meta) and its rows, folded away until it opens
  const section = (item) => {
    const sect = document.createElement("div");
    sect.className = "sel-sect";
    sect.setAttribute("role", "group");
    sect.setAttribute("aria-label", item.group);
    const head = document.createElement("button");
    head.type = "button";
    head.className = "sel-group";
    head.setAttribute("aria-expanded", "false");
    if (item.groupIcon) head.append(item.groupIcon());
    const name = document.createElement("span");
    name.textContent = item.group;
    head.append(name);
    if (item.groupMeta) {
      const m = document.createElement("span");
      m.className = "sel-meta";
      m.textContent = item.groupMeta;
      head.append(m);
    }
    if (items.some((x) => x.group === item.group && x.value === value)) head.toggleAttribute("data-current", true);
    const fold = document.createElement("div");
    fold.className = "sel-fold";
    const list = document.createElement("div");
    list.className = "sel-fold-in";
    fold.append(list);
    sect.append(head, fold);
    menu.append(sect);
    // resting on a header unfolds it; passing over it on the way to another does not
    head.addEventListener("pointerenter", (e) => {
      clearTimeout(resting);
      if (e.pointerType === "mouse") resting = setTimeout(() => menu && unfold(item.group), 90);
    });
    head.addEventListener("pointerleave", () => clearTimeout(resting));
    // the focus stays on the trigger, where the arrows are read
    head.addEventListener("mousedown", (e) => e.preventDefault());
    head.addEventListener("click", (e) => {
      clearTimeout(resting);
      unfold(item.group, !!e.pointerType && e.pointerType !== "mouse");
    });
    return { head, fold, list };
  };
  // the pointer only lights a row; the arrows (and the menu opening) bring it into view, its group unfolded
  const highlight = (i, how = "pointer") => {
    at = (i + items.length) % items.length;
    rows.forEach((n, k) => n.toggleAttribute("data-highlighted", k === at));
    if (how === "pointer") return;
    const row = rows[at];
    const fold = groups.get(items[at].group)?.fold;
    if (how === "keys" && fold && !fold.classList.contains("is-open")) {
      unfold(items[at].group, true);
      const done = (e) => e.target === fold && (fold.removeEventListener("transitionend", done), row.scrollIntoView({ block: "nearest" }));
      fold.addEventListener("transitionend", done);
    }
    row.scrollIntoView({ block: "nearest" });
  };
  const pick = (item) => {
    value = item.value;
    draw();
    trigger.focus();
    onChange(item.value);
    close();
  };
  const open = () => {
    onOpen?.();
    menu = document.createElement("div");
    menu.className = "sel-menu";
    menu.setAttribute("role", "listbox");
    if (fit) menu.classList.add("is-fit");
    rows = [];
    groups = new Map();
    grow = "";
    items.forEach((item, i) => {
      if (item.group && !groups.has(item.group)) groups.set(item.group, section(item));
      const row = document.createElement("button");
      row.type = "button";
      row.className = "sel-item";
      row.setAttribute("role", "option");
      if (item.value === value) row.toggleAttribute("data-selected", true);
      row.append(face(item));
      if (item.meta) {
        const m = document.createElement("span");
        m.className = "sel-meta";
        m.textContent = item.meta;
        row.append(m);
      }
      // the chosen one is lit in the accent; nothing else marks it
      if (item.extra) row.append(item.extra.cloneNode(true));
      row.addEventListener("pointerenter", () => highlight(i));
      row.addEventListener("click", () => pick(item));
      (item.group ? groups.get(item.group).list : menu).append(row);
      rows.push(row);
    });
    if (note) {
      const n = document.createElement("p");
      n.className = "sel-note";
      n.textContent = note;
      menu.append(n);
    }
    // the chosen item's group is open from the start, without unfolding
    if (current().group) unfold(current().group, true);
    document.body.append(menu);
    const box = trigger.getBoundingClientRect();
    // wide enough for the second lines (or, fitted, for its rows)
    const { room, cap, top } = float(menu, box, Math.max(box.width, fit ? Math.ceil(menu.scrollWidth) + 2 : 432));
    // an unfolding group grows it downward (over the trigger, when dropped up), so nothing above
    // the pointer moves; never past the window's edge
    if (groups.size) grow = `${Math.max(room, Math.min(cap, innerHeight - 8 - top))}px`;
    trigger.dataset.state = "open";
    highlight(Math.max(0, items.findIndex((i) => i.value === value)), "open");
    document.addEventListener("pointerdown", outside, true);
    unstick = stick(menu, trigger, close);
  };
  trigger.addEventListener("click", () => (menu ? close() : open()));
  trigger.addEventListener("keydown", (e) => {
    if (!menu && ["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      return open();
    }
    if (!menu) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      highlight(at + (e.key === "ArrowDown" ? 1 : -1), "keys");
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(items[at]);
    } else if (e.key === "Escape" || e.key === "Tab") {
      e.stopPropagation();
      close();
    }
  });
  return trigger;
}

/**
 * A select of pictures: a trigger showing the chosen one (its picture and its name), and a floating
 * panel of tiles in a grid, with a key for none at its head. Arrows move across the grid, Enter
 * picks, Escape or a click elsewhere closes. items: [{ value, label, image }]
 */
export function tilePicker({ items, value, onChange, label, none, columns = 4 }) {
  const picture = (src, cls) => {
    const img = document.createElement("img");
    img.className = cls;
    img.src = src;
    img.alt = "";
    img.draggable = false;
    img.decoding = "async";
    return img;
  };
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "sel-trigger tile-trigger";
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-label", label);
  const chosen = () => items.find((i) => i.value === value);
  const draw = () => {
    const name = document.createElement("span");
    name.className = "sel-label";
    name.textContent = chosen()?.label ?? none;
    trigger.replaceChildren(...(chosen()?.image ? [picture(chosen().image, "tile-thumb")] : []), name);
  };
  draw();

  let panel = null;
  let grid = null;
  let tiles = [];
  let at = -1;
  let unstick = null;
  const close = () => {
    if (!panel) return;
    unstick();
    panel.remove();
    panel = null;
    trigger.dataset.state = "closed";
    document.removeEventListener("pointerdown", outside, true);
  };
  const outside = (e) => !panel?.contains(e.target) && !trigger.contains(e.target) && close();
  const highlight = (i, keys = false) => {
    at = Math.max(0, Math.min(items.length - 1, i));
    tiles.forEach((t, k) => t.toggleAttribute("data-highlighted", k === at));
    if (keys) tiles[at].scrollIntoView({ block: "nearest" });
  };
  const pick = (v) => {
    value = v;
    draw();
    trigger.focus();
    onChange(v);
    close();
  };
  const open = () => {
    panel = document.createElement("div");
    panel.className = "tile-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", label);
    const head = document.createElement("div");
    head.className = "tile-head";
    const title = document.createElement("span");
    title.className = "tile-title";
    title.textContent = label;
    const nothing = document.createElement("button");
    nothing.type = "button";
    nothing.className = "tile-none";
    nothing.textContent = none;
    if (!chosen()) nothing.toggleAttribute("data-selected", true);
    nothing.addEventListener("click", () => pick(""));
    head.append(title, nothing);
    grid = document.createElement("div");
    grid.className = "tile-grid";
    grid.setAttribute("role", "listbox");
    grid.style.setProperty("--cols", columns);
    tiles = items.map((item, i) => {
      const t = document.createElement("button");
      t.type = "button";
      t.className = "tile";
      t.setAttribute("role", "option");
      t.setAttribute("aria-selected", String(item.value === value));
      if (item.value === value) t.toggleAttribute("data-selected", true);
      const name = document.createElement("span");
      name.className = "tile-name";
      name.textContent = item.label;
      t.append(picture(item.image, "tile-img"), name);
      t.addEventListener("pointerenter", () => highlight(i));
      t.addEventListener("click", () => pick(item.value));
      grid.append(t);
      return t;
    });
    panel.append(head, grid);
    // the keys stay with the trigger, where the arrows are read
    panel.addEventListener("mousedown", (e) => e.preventDefault());
    document.body.append(panel);
    float(panel, trigger.getBoundingClientRect(), panel.offsetWidth, true);
    trigger.dataset.state = "open";
    at = items.findIndex((i) => i.value === value);
    if (at >= 0) highlight(at, true);
    document.addEventListener("pointerdown", outside, true);
    unstick = stick(panel, trigger, close);
  };
  trigger.addEventListener("click", () => (panel ? close() : open()));
  trigger.addEventListener("keydown", (e) => {
    if (!panel && ["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      return open();
    }
    if (!panel) return;
    // as many to a row as the grid shows (fewer on a phone)
    const cols = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
    if (step) {
      e.preventDefault();
      highlight(at < 0 ? 0 : at + step, true);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (at >= 0) pick(items[at].value);
    } else if (e.key === "Escape" || e.key === "Tab") {
      e.stopPropagation();
      close();
    }
  });
  return trigger;
}
