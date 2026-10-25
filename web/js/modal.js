// A window that has the whole of the keyboard while it is open (the Oven, Jam's windows, Utensils' Library): what is behind it is put
// away (inert: Tab does not reach it, a screen reader does not read it), the focus goes in, and when the window closes the focus goes
// back to what had it, so a person at the keyboard is never left in the page behind a window, nor dropped at the top of the page.
//   modal(host, on, { focus }): call it each time the window is drawn; `host` is the layer the window is on (a child of the body),
//   `on` whether it is open, `focus()` what takes the focus when it opens (the layer or its window when left out).
const BEHIND = "header, .page, #assistant";
const held = new WeakMap();

/** Something to find again by if the element that had the focus has been drawn anew in the meantime. */
const mark = (el) => ({ cls: el.className, label: el.getAttribute?.("aria-label") ?? "", text: (el.textContent ?? "").trim().slice(0, 40) });
const same = (el, m) => el.className === m.cls && (el.getAttribute("aria-label") ?? "") === m.label && (el.textContent ?? "").trim().slice(0, 40) === m.text;

// where the focus last was outside a window: a page that draws itself as the window opens has already dropped it by then
let last = null;
document.addEventListener("focusin", (e) => e.target instanceof Element && !e.target.closest("[role=dialog]") && (last = { el: e.target, again: mark(e.target) }), true);

export function modal(host, on, { focus } = {}) {
  const was = held.get(host);
  if (on && !was) {
    const now = document.activeElement && document.activeElement !== document.body && !host.contains(document.activeElement) ? document.activeElement : null;
    const opener = now ?? last?.el ?? null;
    const behind = [...document.body.children].filter((n) => n !== host && !n.contains(host) && n.matches(BEHIND) && !n.inert);
    for (const n of behind) n.inert = true;
    held.set(host, { opener, again: now ? mark(now) : last?.again ?? null, behind });
    // (after the redraw that opened it has finished: a page that draws itself puts the focus back where it was)
    requestAnimationFrame(() => held.has(host) && !host.contains(document.activeElement) && (focus ? focus() : host.firstElementChild?.focus?.({ preventScroll: true })));
  } else if (!on && was) {
    held.delete(host);
    for (const n of was.behind) n.inert = false;
    // the focus was in the window (or the window took it with it): it goes back to the key that opened it, once the page behind has drawn
    // itself again (the key may be a new element by then: it is found by what it is)
    if (document.activeElement === document.body || host.contains(document.activeElement)) {
      const { opener, again } = was;
      requestAnimationFrame(() => {
        if (held.has(host) || !(document.activeElement === document.body || host.contains(document.activeElement))) return;
        const back = opener?.isConnected ? opener : again ? [...document.querySelectorAll("button, a[href], [tabindex]")].find((n) => same(n, again)) : null;
        back?.focus?.({ preventScroll: true });
      });
    }
  }
}
