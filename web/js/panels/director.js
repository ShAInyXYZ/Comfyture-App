import { h, icon, sprite } from "../dom.js";
import { state, setDirector, planFilm, makeFilm, rollMissing, openPlanAsTabs, switchTab, askStage } from "../store.js";
import { CAMERA_LABELS } from "../script.js";
import { go } from "../router.js";
import { stageReady } from "../control/link.js";

const STEP = { waiting: ["Waiting", null], frame: ["Drawing the first frame", "busy"], shot: ["Rolling", "busy"], done: ["Done", "ok"], failed: ["Failed", "crit"] };
const STEPS = [
  ["Plan", "Gemma 4 writes the shot list from your sentence."],
  ["First frames", "Qwen Image 2.1 draws each shot's opening picture."],
  ["Shots", "LTX-2.5 rolls every shot, with its sound."],
  ["Film", "The takes are cut together in order."],
];

function option(label, ...control) {
  return h("div.dir-option", {}, h("span.row-label", {}, label), h("div.dir-control", {}, ...control));
}

function segment(label, options, value, onPick, disabled) {
  return option(label, h("div.segment", { role: "group", "aria-label": label },
    options.map((v) => h("button", { type: "button", disabled, "aria-pressed": String(v === value), on: { click: () => onPick(v) } }, String(v)))));
}

function brief(dir, busy) {
  const photo = state.draft.start;
  return h("section.card.dir-brief", {},
    h("div.card-head", {}, h("span.card-label", {}, "Brief"), h("span.card-hint", {}, "one sentence is enough")),
    h("textarea.field.dir-idea", {
      rows: 5,
      value: dir.idea,
      disabled: busy,
      "aria-label": "What the film is about",
      placeholder: "A lighthouse keeper finds a glowing jellyfish after a storm and carries it back to the sea at night.",
      on: { input: (e) => (state.director.idea = e.target.value) },
    }),
    h("div.dir-options", {},
      segment("Shots", [3, 4, 5, 6], dir.shots, (v) => setDirector({ shots: v }), busy),
      segment("Seconds", [4, 5, 6], dir.seconds, (v) => setDirector({ seconds: v }), busy),
      segment("Frame", ["16:9", "9:16", "1:1"], dir.aspect, (v) => setDirector({ aspect: v }), busy),
      photo
        ? option("Start", h("button.key", {
            type: "button",
            disabled: busy,
            "aria-pressed": String(dir.fromPhoto),
            title: "Shot 1 starts on the open tab's start photo, and the plan follows from it",
            on: { click: () => setDirector({ fromPhoto: !dir.fromPhoto }) },
          }, h("img.dir-photo", { src: photo.url, alt: "", draggable: false }), "From my photo"))
        : null,
    ),
    h("button.key.is-primary.dir-plan-key", { type: "button", disabled: busy, on: { click: planFilm } },
      icon("sparkle"), dir.phase === "planning" ? "Planning…" : dir.plan ? "Plan again" : "Plan the shots"),
    h("ol.dir-steps", {}, STEPS.map(([name, text], i) =>
      h("li", {}, h("span.card-num", {}, String(i + 1)), h("div", {}, h("b", {}, name), h("span", {}, text))))),
  );
}

function shotCard(plan, shot, i, dir) {
  const st = dir.shotsState[i] ?? { step: "waiting" };
  const making = dir.phase === "making" || dir.phase === "cutting";
  const locked = making || dir.phase === "done";
  const started = making || dir.phase === "partial" || dir.phase === "done";
  const run = st.run ? state.runs.find((r) => r.id === st.run) : null;
  const field = (key, rows, label) =>
    h("label.dir-field", {},
      h("span.row-label", {}, label),
      h("textarea.field", { rows, value: shot[key], disabled: locked, on: { input: (e) => (shot[key] = e.target.value) } }));
  const picture = run?.status === "done"
    ? h("video", { src: run.video, muted: true, loop: true, autoplay: true, playsInline: true })
    : st.photo
    ? h("img", { src: st.photo.url, alt: "", draggable: false })
    : i === 0 && dir.start
    ? h("img", { src: dir.start.url, alt: "", draggable: false })
    : h("span.dir-thumb-empty", {}, icon("image"));
  const [label, tone] = STEP[st.step] ?? STEP.waiting;
  const tab = state.director.tabs?.[i];
  return h("article.dir-shot", {},
    h("div.dir-thumb", { className: tone === "busy" ? "is-busy" : "", title: tab ? "Open this shot in Shot" : "", on: { click: () => {
      if (tab && state.tabs.some((t) => t.id === tab)) {
        switchTab(tab);
        go("shot");
      }
    } } }, picture),
    h("div.dir-shot-head", {},
      h("span.card-num", {}, String(i + 1)),
      h("input.field.is-line", { value: shot.name, "aria-label": "Shot name", disabled: locked, on: { input: (e) => (shot.name = e.target.value) } }),
    ),
    field("frame", 3, "First frame"),
    field("action", 3, "What happens"),
    h("div.dir-shot-foot", {},
      h("select.chip-select", { disabled: locked, "aria-label": "Camera", on: { change: (e) => (shot.camera = e.target.value) } },
        Object.entries(CAMERA_LABELS).map(([v, l]) => h("option", { value: v, selected: v === shot.camera }, l))),
      h("select.chip-select", { disabled: locked, "aria-label": "Seconds", on: { change: (e) => (shot.seconds = Number(e.target.value)) } },
        [3, 4, 5, 6, 7, 8].map((n) => h("option", { value: n, selected: n === shot.seconds }, `${n} s`))),
      started ? h("span.dir-step", { title: st.error ?? "" }, h("span.lamp", { dataset: tone ? { tone } : {} }), label) : null,
      h("span.spacer"),
      h("button.key.is-sm.is-icon", { type: "button", title: "Stage it — block this shot on the Stage, for its references", "aria-label": `Stage shot ${i + 1}`, on: { click: () => stageShot(plan, shot, i) } }, sprite("section-stage")),
    ),
    st.error ? h("p.dir-shot-error", {}, st.error) : null,
  );
}

/** Blocks a planned shot on the Stage, as a stage of its own: the assistant stages what happens, from its camera. */
async function stageShot(plan, shot, i) {
  go("stage");
  const camera = CAMERA_LABELS[shot.camera] ? `, camera ${CAMERA_LABELS[shot.camera].toLowerCase()}` : "";
  const { projects } = await stageReady;
  await projects?.newProject(`${plan.title ? `${plan.title} — ` : ""}Shot ${i + 1}`.slice(0, 60)).catch(() => null);
  askStage(`New scene: ${shot.action}${camera}. ${plan.cast ? `Cast: ${plan.cast}. ` : ""}Frame ${state.director.aspect ?? "16:9"}, ${shot.seconds} seconds.`);
}

function result(dir) {
  const plan = dir.plan;
  if (!plan) {
    return h("section.card.dir-empty", {},
      h("span.card-label", {}, "The plan"),
      h("p", {}, "Write the brief and plan the shots. You can change anything in the plan before a single frame is drawn."),
    );
  }
  const making = dir.phase === "making" || dir.phase === "cutting";
  const done = dir.shotsState.filter((s) => s.step === "done").length;
  const make = dir.phase === "partial"
    ? h("button.roll.dir-make", { type: "button", on: { click: rollMissing } }, icon("remix"), "ROLL THE MISSING SHOTS")
    : h("button.roll.dir-make", { type: "button", disabled: making, on: { click: makeFilm } }, icon("film"), dir.phase === "done" ? "MAKE IT AGAIN" : "MAKE THE FILM");
  return h("section.card.dir-plan", {},
    h("div.dir-plan-head", {},
      h("input.title-input", { value: plan.title, "aria-label": "Film title", disabled: making, on: { input: (e) => (plan.title = e.target.value) } }),
      h("span.card-hint", {}, `${plan.shots.length} shots · ${plan.shots.reduce((t, s) => t + s.seconds, 0)} s`),
    ),
    h("div.dir-look", {},
      h("label.dir-field", {}, h("span.row-label", {}, "Look"), h("input.field.is-line", { value: plan.look, disabled: making, on: { input: (e) => (plan.look = e.target.value) } })),
      h("label.dir-field", {}, h("span.row-label", {}, "Cast"), h("input.field.is-line", { value: plan.cast, disabled: making, on: { input: (e) => (plan.cast = e.target.value) } })),
    ),
    dir.film
      ? h("div.dir-film", {},
          h("video", { src: dir.film.url, controls: true, playsInline: true }),
          h("div.dir-film-actions", {},
            h("a.key.is-primary", { href: `${dir.film.url}?download=comfyture-${plan.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.mp4` }, icon("download"), "Download"),
            h("a.key", { href: "#/library" }, icon("grid"), "In the Library")))
      : null,
    h("div.dir-shots", {}, plan.shots.map((s, i) => shotCard(plan, s, i, dir))),
    dir.error ? h("p.dir-error", {}, dir.error) : null,
    h("div.dir-actions", {},
      h("button.key", { type: "button", disabled: making, on: { click: () => (openPlanAsTabs(), go("shot")) } }, icon("open"), "Open as tabs in Shot"),
      h("span.spacer"),
      making ? h("span.dir-progress", {}, h("span.lamp", { dataset: { tone: "busy" } }), dir.phase === "cutting" ? "Cutting the film…" : `${done} of ${plan.shots.length} shots done`) : null,
      make,
    ),
  );
}

export function renderDirector(el) {
  const dir = state.director;
  const busy = ["planning", "making", "cutting"].includes(dir.phase);
  const keep = [...el.querySelectorAll("textarea, input")].find((n) => n === document.activeElement);
  const top = window.scrollY;
  el.replaceChildren(
    h("div.page-head", {}, h("h1", {}, "Story"), h("span.hint", {}, "An idea in, a film out: planned, drawn, rolled and cut on your ComfyUI.")),
    h("div.dir-page", {}, brief(dir, busy), result(dir)),
  );
  window.scrollTo({ top });
  if (keep?.classList.contains("dir-idea")) el.querySelector(".dir-idea")?.focus();
}
