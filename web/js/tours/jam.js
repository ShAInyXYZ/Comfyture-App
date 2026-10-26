// Jam's tour: Pickle shows a newcomer around, on the newest of the music videos Jam ships (examples/jam/), through the five workspaces
// in the order a video is made: the song, the track, the words, the band, the edit. What would cost credits is only named; the edit is
// played for free with the example's own cut (every shot of an example is made already).
import { changed } from "../store.js";
import { jam, loadJams, openJam, setWorkspace } from "../jam.js";
import { editor } from "../panels/editor.js";
import { simulate } from "../tour.js";

/**
 * The example the tour runs on: the newest of Jam's own (their ids begin "jam-", a person's own videos "jams-"), by when it was put
 * into the data folder; else the video open, else the first.
 */
async function onExample() {
  await loadJams();
  const newest = jam.list.filter((j) => j.id.startsWith("jam-")).reduce((a, j) => (!a || String(j.createdAt ?? "") > String(a.createdAt ?? "") ? j : a), null);
  const id = newest?.id ?? jam.jam?.id ?? jam.list[0]?.id;
  if (id && jam.jam?.id !== id) await openJam(id);
}

/**
 * Once Jam has stopped drawing (nothing redrawn for a moment, a few seconds at most). Every redraw makes the workspace's cards and the
 * panel anew, and a light lit before it would be left on an element that is gone (a workspace shown for the first time is drawn
 * again as what it fetched comes in: the band's dance, for one).
 */
function settled(quiet = 350, most = 3000) {
  const parts = [document.querySelector(".jm-grid"), document.querySelector(".jm-side-slot")].filter(Boolean);
  return new Promise((done) => {
    const finish = () => (clearTimeout(timer), clearTimeout(limit), watch.disconnect(), done());
    let timer = setTimeout(finish, quiet);
    const limit = setTimeout(finish, most);
    const watch = new MutationObserver(() => (clearTimeout(timer), (timer = setTimeout(finish, quiet))));
    for (const p of parts) watch.observe(p, { childList: true });
  });
}

/** A workspace open on the example, with the element a step lights drawn and in view (on a short screen the workspace scrolls). */
const on = (workspace, find) => async () => {
  await onExample();
  if (jam.workspace !== workspace) setWorkspace(workspace);
  const get = () => (typeof find === "function" ? find() : document.querySelector(find));
  for (let i = 0; find && i < 40 && !get()?.getClientRects().length; i++) await new Promise((r) => setTimeout(r, 75));
  await settled();
  // the bar says what fits the workspace now (its redraw, asked for while the page drew, can be lost when the tour has just started)
  changed("assistant");
  if (!find) return;
  const el = get();
  if (!el?.getClientRects().length) return;
  // from the top of the workspace, scrolled no further than it takes
  const grid = el.closest(".jm-grid");
  if (grid) grid.scrollTop = 0;
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
};
/** An element to light, or the part of it that fits when it is taller than the workspace's room (the words' cards, on a short screen). */
const fitting = (sel, part) => () => {
  const el = document.querySelector(sel);
  const room = document.querySelector(".jm-grid")?.clientHeight ?? Infinity;
  return el && el.getBoundingClientRect().height > room ? el.querySelector(part) ?? el : el;
};
const lyrics = fitting(".jt-c-lyrics", ".jw-row");
const preview = fitting(".jw-preview", ".cut-screen");
/** The cut played from its start, in the preview the workspace shows (once the editor is on the page). */
const playCut = () => document.querySelector(".jm-grid .cut-screen") && (editor.seek(0), editor.play());
/** The edit's Make the video key, shown while shots wait to be rolled. */
const makeKey = () => document.querySelector('.jm-b-foot [data-go="make"]');

export default {
  title: "Jam",
  steps: [
    {
      go: on("song"),
      title: "A song in, a music video out",
      text: "Hi, I'm **Pickle**. In Jam a song becomes a music video: its best part cut on the beat, the words on it as captions, the band performing it. We'll look at one of my examples: nothing is spent.",
    },
    {
      go: on("song", ".jm-tiles"),
      target: ".jm-tiles",
      place: "right",
      title: "Five workspaces",
      text: "A video is made in this order: **The song**, **The track**, **The words**, **The band**, **The edit**. A tick means a step is done, and **Jam status** under them says what's next. The name above opens your other jams.",
    },
    {
      go: on("song", ".sg-steps"),
      target: ".sg-steps",
      place: "right",
      title: "The song",
      text: "Say what it's about and pick a shape and a sound: **Pickle, set it up** fills in the rest, and **Make the song** sings it (on Comfy Cloud it costs credits, so it waits for your key). Or bring your own with **Import a song**. Under the player, the **Lyrics display** follows the words as a song plays.",
    },
    {
      go: on("track", ".jt-c-stems"),
      target: ".jt-c-stems",
      place: "right",
      title: "Stems",
      text: "The track is the song the video is cut to. **Split the stems** takes its part apart, vocals, drums, bass and the rest, to solo or mute, and hears the words on the way. It runs on Comfy, so it only starts when you press it.",
    },
    {
      go: on("track", ".jt-c-beat"),
      target: ".jt-c-beat",
      title: "The beat",
      text: "Every cut and every effect lands on these beats: the tempo, the time signature and the beats found. If they're off, **Tap tempo** along to the song.",
    },
    {
      go: on("track", ".jt-c-cut"),
      target: ".jt-c-cut",
      place: "left",
      title: "The cut",
      text: "How long the video runs, **15 s**, **30 s**, **60 s** or **Full**, and which part of the song: drag the handles, or **Trim to the chorus**. The shots are planned on this part.",
    },
    {
      go: on("words", lyrics),
      target: lyrics,
      place: "right",
      title: "Lyrics & timing",
      text: "Every line of the words with its time: click the time to hear it from there, type to fix a word, drag its dots to retime the words. No words yet? Type them, free, or **Hear the words** writes them down from the singing.",
    },
    {
      go: on("words", preview),
      target: preview,
      place: "left",
      title: "Captions",
      text: "Pick a style on the right, **Karaoke pop**, **Bold stack**, **Neon**…, then its size, place and colours: the preview shows the words on the video as they will be in the film.",
      show: { label: "Play it", run: playCut },
    },
    {
      go: on("band", ".jm-b-stage"),
      target: ".jm-b-stage",
      place: "bottom",
      title: "The band",
      text: "Who performs: the lead sings it (with **Lip-sync** on, their lips follow the vocals), and up to two performers stand beside them. Click one to swap them for another of the crew, or a photo of your own.",
    },
    {
      go: on("band", ".jm-b-look"),
      target: ".jm-b-look",
      place: "top",
      title: "The look",
      text: "Pick a **Look** for the scene; where nobody sings, the lead copies the **Dance reference** beside it. **Cast the band** rolls every shot not made yet: on Comfy Cloud it costs credits, so it asks twice.",
    },
    {
      go: on("edit", ".jm-b-timeline"),
      target: ".jm-b-timeline",
      place: "right",
      title: "The edit",
      text: "The shots cut on the beat, the words over them, the song under them. **Smart** cuts it for you; the keys beside it put beat effects (shake, zoom, flash, colour) and stickers on the frame. Click a shot to change it.",
    },
    {
      go: on("edit", ".jm-b-foot"),
      // the key that finishes the video: Make while shots wait to be rolled, else the free export (an example's shots are all made)
      target: () => makeKey() ?? document.querySelector('.jm-b-foot [data-go="export"]'),
      place: "top",
      title: "Make the video",
      get text() {
        return makeKey()
          ? "**Make the video** rolls the shots not made yet, then cuts them on the beat (on Comfy Cloud it costs credits, so it asks twice); **Export the video** renders the edit as it is, free. Here I play it for free."
          : "While shots still wait, **Make the video** sits here: it rolls them, then cuts them on the beat (on Comfy Cloud it costs credits, so it asks twice). This video's shots are all made, so **Export the video** just renders the edit, free.";
      },
      show: {
        label: "Make it, for free",
        run: async () => {
          await simulate(document.querySelector(".jm-b-monitor") ?? document.querySelector(".jm-grid"), { label: "Making the video", seconds: 2.6 });
          playCut();
        },
      },
    },
    {
      go: on("edit"),
      target: "#assistant .chat-bar",
      place: "top",
      title: "Your turn",
      text: "Change this example (it is yours now), or start your own with **New jam** in the menu of your jams. And ask me in my bar: \"cut on the beat\", \"zoom on the drop\", \"make the words bigger\".",
    },
  ],
};
