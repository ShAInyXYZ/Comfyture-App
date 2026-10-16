// Full-screen viewer: images zoom with the wheel and pan by dragging,
// videos play with sound. Double-click resets, Escape closes.

let root;
let state;

function apply() {
  const media = root.querySelector(".viewer-media");
  media.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.zoom})`;
}

function close() {
  root.hidden = true;
  root.querySelector(".viewer-stage").replaceChildren();
  document.removeEventListener("keydown", onKey);
}

function onKey(e) {
  if (e.key === "Escape") close();
}

function build() {
  root = document.createElement("div");
  root.className = "viewer";
  root.hidden = true;
  root.innerHTML = `<div class="viewer-stage"></div><button class="viewer-close" aria-label="Close">×</button>`;
  document.body.append(root);
  const stage = root.querySelector(".viewer-stage");
  root.querySelector(".viewer-close").addEventListener("click", close);
  root.addEventListener("click", (e) => {
    if (e.target === root || e.target === stage) close();
  });
  stage.addEventListener("wheel", (e) => {
    if (!state.zoomable) return;
    e.preventDefault();
    const rect = stage.getBoundingClientRect();
    const cx = e.clientX - rect.left - rect.width / 2;
    const cy = e.clientY - rect.top - rect.height / 2;
    const next = Math.min(8, Math.max(1, state.zoom * Math.exp(-e.deltaY * 0.0015)));
    state.x = cx - ((cx - state.x) * next) / state.zoom;
    state.y = cy - ((cy - state.y) * next) / state.zoom;
    state.zoom = next;
    if (next === 1) state.x = state.y = 0;
    apply();
  }, { passive: false });
  stage.addEventListener("pointerdown", (e) => {
    if (!state.zoomable || state.zoom === 1 || e.button !== 0) return;
    const start = { px: e.clientX, py: e.clientY, x: state.x, y: state.y };
    stage.setPointerCapture(e.pointerId);
    stage.classList.add("dragging");
    const move = (m) => {
      state.x = start.x + m.clientX - start.px;
      state.y = start.y + m.clientY - start.py;
      apply();
    };
    const up = () => {
      stage.classList.remove("dragging");
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerup", up);
    };
    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerup", up);
  });
  stage.addEventListener("dblclick", () => {
    state.zoom = 1;
    state.x = state.y = 0;
    apply();
  });
}

export function view(src, kind = "image") {
  if (!root) build();
  state = { zoom: 1, x: 0, y: 0, zoomable: kind === "image" };
  const media = document.createElement(kind === "image" ? "img" : "video");
  media.className = "viewer-media";
  media.src = src;
  media.draggable = false;
  if (kind === "video") Object.assign(media, { controls: true, autoplay: true, loop: true, playsInline: true });
  root.querySelector(".viewer-stage").replaceChildren(media);
  root.hidden = false;
  document.addEventListener("keydown", onKey);
}
