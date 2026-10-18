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
 * A select: a trigger showing the value, and a floating menu of options, each with a second line
 * and optional tags. Arrows move, Enter picks, Escape or a click elsewhere closes.
 * items: [{ value, label, desc?, extra?: Node }]
 */
/**
 * A select: a trigger showing the chosen item, and a menu of the items. An item may carry a group
 * (a header with its glyph starts each group) and a meta (a short value at the row's end); a note
 * closes the menu; width "fit" makes the menu only as wide as its rows.
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
  const close = () => {
    if (!menu) return;
    menu.remove();
    menu = null;
    trigger.dataset.state = "closed";
    document.removeEventListener("pointerdown", outside, true);
    onClose?.();
  };
  const outside = (e) => !menu?.contains(e.target) && !trigger.contains(e.target) && close();
  const highlight = (i) => {
    at = (i + items.length) % items.length;
    const rows = menu.querySelectorAll(".sel-item");
    rows.forEach((n, k) => n.toggleAttribute("data-highlighted", k === at));
    rows[at]?.scrollIntoView({ block: "nearest" });
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
    let group = null;
    items.forEach((item, i) => {
      if (item.group && item.group !== group) {
        group = item.group;
        const head = document.createElement("div");
        head.className = "sel-group";
        head.setAttribute("role", "presentation");
        if (item.groupIcon) head.append(item.groupIcon());
        head.append(document.createTextNode(item.group));
        menu.append(head);
      }
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
      menu.append(row);
    });
    if (note) {
      const n = document.createElement("p");
      n.className = "sel-note";
      n.textContent = note;
      menu.append(n);
    }
    document.body.append(menu);
    const box = trigger.getBoundingClientRect();
    const below = innerHeight - box.bottom;
    // wide enough for the second lines (or, fitted, for its rows), and never past the window's edge
    const width = Math.min(innerWidth - 16, Math.max(box.width, fit ? Math.ceil(menu.scrollWidth) + 2 : 432));
    Object.assign(menu.style, { left: `${Math.max(8, Math.min(box.left, innerWidth - width - 8))}px`, width: `${width}px` });
    const up = below < menu.offsetHeight + 12 && box.top > below;
    if (up) menu.style.bottom = `${innerHeight - box.top + 6}px`;
    else menu.style.top = `${box.bottom + 6}px`;
    // a list taller than the room on its side scrolls inside it, never past the window's edge
    const room = (up ? box.top : below) - 14;
    if (menu.offsetHeight > room) menu.style.maxHeight = `${room}px`;
    trigger.dataset.state = "open";
    highlight(Math.max(0, items.findIndex((i) => i.value === value)));
    document.addEventListener("pointerdown", outside, true);
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
      highlight(at + (e.key === "ArrowDown" ? 1 : -1));
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
