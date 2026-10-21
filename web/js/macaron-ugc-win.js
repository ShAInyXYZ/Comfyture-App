// The UGC story window (mockup: docs/brand/products/macaron-v4/macaron-v4-ugc.png). Three calm columns: the creator and the hook on
// the left, the story as a row of vertical beats in the middle, the beat picked on the right, big, with its line, its camera and
// its setting. Brioche can write the script; "Make the story" is at the foot with its price and asks twice before it spends.
import { h, icon } from "./dom.js";
import { view } from "./viewer.js";
import { macaron } from "./macaron.js";
import { defineWindow } from "./macaron-win.js";
import { draftKey } from "./macaron-tools.js";
import { mcicon, fill, arming, isArmed, armedNow } from "./macaron-ui.js";
import { PERSONAS, BEATS, CAMERAS, SETTINGS, beatKind, personaOf, storyLength } from "./macaron-ugc-data.js";
import { ugcUi, storiesOf, storyNow, beatNow, pickStory, pickBeat, startStory, setStory, setBeat, removeStory, makeStory, makeBeat, making, toMake, costOf } from "./macaron-ugc.js";
import { changed } from "./store.js";

const clock = (s) => `0:${String(Math.round(s)).padStart(2, "0")}`;
const typingIn = (el) => el.contains(document.activeElement) && document.activeElement.matches("input, textarea");
const ASK = "Write the script for this UGC story: a hook for the first two seconds, then one idea in each beat, spoken lines that sound natural in the creator's mouth, in the brand's voice. Never claim what the product cannot do. Use write_ugc.";

function ugcWin() {
  const el = h("div.mc-w.ug");
  // what is at the foot is made once (the window keeps it) and told what to say each time the window is drawn
  const costLine = h("div.ug-cost", {});
  const makeKey = h("button.mc-primary", { type: "button" });
  const draft = draftKey("Brioche can write the script", "I'll tailor the lines to your brand and creator.", ASK);
  const foot = [draft, h("span.spacer"), costLine, makeKey];
  let footState = "";

  const persona = (story, p) => h(`button.ug-persona${p.id === story.persona ? ".is-on" : ""}`, { type: "button", "aria-pressed": String(p.id === story.persona), title: `${p.name}, ${p.vibe.toLowerCase()}`, on: { click: () => setStory(story.id, { persona: p.id }) } },
    h("img", { src: p.portrait, alt: "", draggable: false }),
    h("span.ug-persona-text", {}, h("b", {}, p.name), h("em", {}, p.vibe)),
    h("span.ug-tick", {}, p.id === story.persona ? icon("check") : null));

  function beatCard(story, bt, i) {
    const on = bt.id === beatNow(story)?.id;
    const k = beatKind(bt.kind);
    const busy = making(`${story.id}:${bt.id}`) || bt.take?.status === "rolling";
    const pic = bt.picture?.url ?? personaOf(story.persona).portrait;
    return h(`button.ug-beat${on ? ".is-on" : ""}${busy ? ".is-busy" : ""}${bt.picture ? "" : ".is-draft"}`, { type: "button", "aria-pressed": String(on), title: `${k.name}: ${k.what}`, dataset: { beat: bt.id }, on: { click: () => pickBeat(bt.id) } },
      h("span.ug-beat-head", {}, h("i", {}, String(i + 1)), h("span", {}, k.name.toUpperCase())),
      h("span.ug-beat-pic", {}, h("img", { src: pic, alt: "", draggable: false, loading: "lazy" }),
        busy ? h("span.ug-busy", {}, h("span.lamp", { dataset: { tone: "busy" } })) : bt.take?.status === "done" ? h("span.ug-play", {}, icon("play")) : null,
        h("span.ug-time", {}, clock(bt.seconds))),
      h("span.ug-line", { dataset: { line: bt.id } }, `“${bt.line}”`));
  }

  function shot(story, bt) {
    const k = beatKind(bt.kind);
    const i = story.beats.indexOf(bt) + 1;
    const pic = bt.picture?.url;
    const busy = making(`${story.id}:${bt.id}`);
    const redoKey = `redo:${bt.id}`;
    const price = costOf(story, bt);
    const takePrice = costOf(story, { seconds: bt.seconds, take: true }, { pic: 0 });
    return h("aside.ug-shot", {},
      h("div.ug-shot-head", {}, h("span.label", {}, `Shot ${i} / ${k.name.toUpperCase()}`),
        bt.take?.status === "done" ? h("button.mc-iconkey", { type: "button", title: "Play this take", "aria-label": "Play this take", on: { click: () => view(bt.take.video, "video") } }, icon("play")) : null),
      h("button.ug-shot-pic", { type: "button", title: pic ? "See it full size" : "Not made yet", disabled: !pic, on: { click: () => pic && view(pic) } },
        h("img", { src: pic ?? personaOf(story.persona).portrait, alt: "", draggable: false }),
        pic ? null : h("span.ug-shot-empty", {}, mcicon("picture"), h("em", {}, "Made when you make the story"))),
      h("div.mc-sec.ug-sec", {}, h("span.label", {}, "What is said"),
        h("textarea.field.mc-text.ug-said", { rows: 2, value: bt.line, maxlength: 140, "aria-label": "The line said in this shot", on: { input: (e) => { setBeat(story.id, bt.id, { line: e.target.value.slice(0, 140) }); sync(story, bt, e.target.value); } } })),
      h("div.mc-sec.ug-sec", {}, h("span.label", {}, "Camera"),
        h("div.mc-fchips", {}, ...CAMERAS.map((c) => h("button.mc-fchip", { type: "button", title: c.words, "aria-pressed": String(bt.camera === c.id), on: { click: () => setBeat(story.id, bt.id, { camera: c.id }) } }, c.name)))),
      h("div.mc-sec.ug-sec", {}, h("span.label", {}, "Setting"),
        h("div.mc-fchips", {}, ...SETTINGS.map((c) => h("button.mc-fchip", { type: "button", title: c.words, "aria-pressed": String(bt.setting === c.id), on: { click: () => setBeat(story.id, bt.id, { setting: c.id }) } }, c.name)))),
      adv() ? h("div.mc-sec.ug-sec", {}, h("span.label", {}, "How long"),
        h("div.ug-step", {}, h("button", { type: "button", "aria-label": "One second less", disabled: bt.seconds <= 3, on: { click: () => setBeat(story.id, bt.id, { seconds: bt.seconds - 1 }) } }, "−"), h("span", {}, `${bt.seconds} s`), h("button", { type: "button", "aria-label": "One second more", disabled: bt.seconds >= 8, on: { click: () => setBeat(story.id, bt.id, { seconds: bt.seconds + 1 }) } }, "+"))) : null,
      bt.error ? h("p.ug-error", { role: "alert" }, bt.error) : null,
      // a take that failed is tried again from the picture it has (no new picture to pay for)
      bt.picture && bt.take?.status === "failed"
        ? h(`button.ug-redo${isArmed(`${redoKey}:take`) ? ".is-armed" : ""}`, { type: "button", disabled: !!making(story.id) || busy, title: `Try the take again from this picture, ≈ ${takePrice} cr`, on: { click: () => arming(`${redoKey}:take`, () => changed("macaron"), () => makeBeat(story.id, bt.id, { picture: false })) } },
          icon("play"), isArmed(`${redoKey}:take`) ? `Spend ≈ ${takePrice} cr?` : "Try the take again", h("em", {}, `≈ ${takePrice} cr`))
        : null,
      h(`button.ug-redo${isArmed(redoKey) ? ".is-armed" : ""}`, { type: "button", disabled: !!making(story.id) || busy, title: `Make this shot again: a new picture and a take, ≈ ${price} cr`, on: { click: () => arming(redoKey, () => changed("macaron"), () => makeBeat(story.id, bt.id)) } },
        mcicon("swap"), isArmed(redoKey) ? `Spend ≈ ${price} cr?` : busy ? "Making it" : bt.picture ? "Redo this shot" : "Make this shot", h("em", {}, `≈ ${price} cr`)));
  }

  // the line under a beat follows what is typed, without the window being drawn again under the cursor
  function sync(story, bt, value) {
    for (const n of el.querySelectorAll(`[data-line="${bt.id}"]`)) n.textContent = `“${value}”`;
    if (bt.kind === "hook") {
      const hook = el.querySelector(".ug-hook");
      if (hook && hook !== document.activeElement) hook.value = value;
    }
  }
  const adv = () => !!macaron.adv?.ugc;

  function update() {
    const b = macaron.brand;
    if (!b) return;
    if (typingIn(el)) return false;
    const story = storyNow(b);
    if (!story) {
      // no story yet: a calm prompt to start one, a creator at a time
      footState = "";
      costLine.replaceChildren();
      makeKey.disabled = true;
      makeKey.replaceChildren(icon("play"), "Make the story");
      return fill(el, h("div.ug-empty", {},
        h("b", {}, "A story told by a creator"),
        h("p", {}, "Five short vertical shots: a hook, the product, the moment of trying, the reaction and one thing to do next."),
        h("div.ug-personas.is-row", {}, ...PERSONAS.map((p) => h("button.ug-persona", { type: "button", on: { click: () => startStory(p.id) } }, h("img", { src: p.portrait, alt: "", draggable: false }), h("span.ug-persona-text", {}, h("b", {}, p.name), h("em", {}, p.vibe)))))));
    }
    const bt = beatNow(story);
    const all = storiesOf(b);
    const armedStory = `ugcdel:${story.id}`;
    fill(el,
      h("section.ug-creator", {},
        h("div.mc-sec.ug-sec", {}, h("div.ug-title", {}, h("span.label", {}, "The creator"), h("em", {}, "Pick a persona")),
          h("div.ug-personas", {}, ...PERSONAS.map((p) => persona(story, p)))),
        h("div.mc-sec.ug-sec", {}, h("div.ug-title", {}, h("span.label", {}, "The hook"), h("em", {}, "Edit your opening line")),
          h("textarea.field.mc-statement.ug-hook", { rows: 3, value: story.hook, maxlength: 120, placeholder: "The first thing they say", "aria-label": "The hook, said in the first two seconds", on: { input: (e) => { setStory(story.id, { hook: e.target.value.slice(0, 120) }); const first = story.beats.find((x) => x.kind === "hook"); if (first) sync(story, first, e.target.value); e.target.parentNode.querySelector(".ug-count").textContent = `${e.target.value.length} / 120`; } } }),
          h("span.ug-count", {}, `${story.hook.length} / 120`))),
      h("section.ug-story", {},
        h("div.ug-story-head", {},
          h("div.ug-title", {}, h("span.label", {}, "The story"), h("em", {}, `${story.beats.length} beats for a natural and engaging UGC · ${storyLength(story)} s`)),
          h("div.ug-story-keys", {},
            all.length > 1 ? h("div.mc-fchips", { role: "group", "aria-label": "Stories" }, ...all.map((s) => h("button.mc-fchip", { type: "button", "aria-pressed": String(s.id === story.id), title: s.name, on: { click: () => pickStory(s.id) } }, personaOf(s.persona).name))) : null,
            h("button.mc-iconkey", { type: "button", title: "A new story", "aria-label": "A new story", on: { click: () => startStory(story.persona) } }, icon("plus")),
            all.length > 0 && adv() ? h(`button.mc-iconkey.is-danger${isArmed(armedStory) ? ".is-armed" : ""}`, { type: "button", title: isArmed(armedStory) ? "Click again to delete this story" : "Delete this story", "aria-label": "Delete this story", on: { click: () => arming(armedStory, () => changed("macaron"), () => removeStory(story.id)) } }, icon("trash")) : null)),
        h("div.ug-beats", {}, ...story.beats.map((x, i) => beatCard(story, x, i)))),
      bt ? shot(story, bt) : null);
    foots(story);
  }

  /** The foot: the price of what is still to make, and the key (it asks twice before it spends). */
  function foots(story) {
    const { left, credits } = toMake(story);
    const busy = making(story.id);
    const key = `ugcmake:${story.id}`;
    const nothing = !left.length;
    const state = JSON.stringify([story.id, left.length, credits, busy, isArmed(key), macaron.chat.busy]);
    if (state === footState) return;
    footState = state;
    costLine.replaceChildren(h("b", {}, nothing ? `${story.beats.length} shots made` : `${left.length} ${left.length === 1 ? "shot" : "shots"} ≈ ${credits} cr`), h("em", {}, "Using LTX-2.5 via Comfy Cloud"));
    makeKey.disabled = busy || nothing;
    makeKey.title = nothing ? "Every shot has its take" : "Make a picture and a take for each shot that has none";
    makeKey.replaceChildren(icon("play"), busy ? "Making the story" : isArmed(key) ? `Spend ≈ ${credits} cr?` : "Make the story");
    makeKey.classList.toggle("is-armed", isArmed(key));
    makeKey.onclick = () => arming(key, () => changed("macaron"), () => makeStory(story.id));
    draft.disabled = !!macaron.chat.busy;
  }

  const sig = () => JSON.stringify([macaron.brand?.body.ugc, ugcUi, macaron.adv?.ugc, macaron.chat.busy, [...macaron.busy].filter((k) => k.startsWith("ugc")), armedNow()]);
  return { el, update, sig, foot };
}

defineWindow("ugc", { title: "UGC story", eyebrow: "Studio", sub: () => macaron.brand?.name ?? "", size: "xl", advanced: true, make: ugcWin, foot: (part) => part.foot });
