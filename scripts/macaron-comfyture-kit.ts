// The brand kit of Comfyture, for Macaron's flagship project: what the approved identity says
// (docs/brand/approved/, web/brand/index.html), written as the kit Macaron holds. The logos are the
// supplied files in web/brand/, never redrawn.
export const A = "brand/macaron/comfyture";

const logo = (id: string, name: string, kind: string, tone: string, url: string, ground: string, note: string) => ({ id, name, kind, tone, url, ground, note });

export const kit = {
  tagline: "Shots worth keeping.",
  about: "Comfyture is an open-source creation desk for cinematic shots with sound: one photo in, a shot out; one sentence in, a short film out. The name is a pun on confiture, the French for jam and preserves: a jar keeps a shot until you are ready to open it.",
  logos: [
    logo("wordmark-yellow", "Wordmark · yellow", "wordmark", "yellow", "brand/wordmark.svg", "ink, plum", "The signature. Headers, covers, end cards."),
    logo("wordmark-ink", "Wordmark · ink", "wordmark", "ink", "brand/wordmark-ink.svg", "yellow, warm white", "For yellow and light grounds."),
    logo("wordmark-white", "Wordmark · warm white", "wordmark", "white", "brand/wordmark-white.svg", "plum, ink", "One-colour print on dark."),
    logo("wordmark-plum", "Wordmark · plum", "wordmark", "plum", "brand/wordmark-plum.svg", "warm white", "A quiet version on light grounds."),
    logo("mark-yellow", "Mark · yellow", "mark", "yellow", "brand/mark.svg", "ink, plum", "The C with its lid, for square and small places."),
    logo("mark-ink", "Mark · ink", "mark", "ink", "brand/mark-ink.svg", "yellow, warm white", "Ink mark on yellow."),
    logo("mark-white", "Mark · warm white", "mark", "white", "brand/mark-white.svg", "plum, ink", "One-colour mark on dark."),
    logo("mark-plum", "Mark · plum", "mark", "plum", "brand/mark-plum.svg", "warm white", "A quiet mark on light grounds."),
    logo("icon-yellow", "App icon · yellow tile", "icon", "yellow", "brand/icon.svg", "ink, plum, warm white", "Ink mark on a yellow tile: favicon, dock, store."),
    logo("icon-ink", "App icon · ink tile", "icon", "ink", "brand/icon-ink.svg", "yellow, warm white", "Yellow mark on an ink tile."),
    logo("icon-plum", "App icon · plum tile", "icon", "plum", "brand/icon-plum.svg", "warm white", "Yellow mark on a plum tile."),
  ],
  palette: [
    { id: "yellow", name: "Yellow", hex: "#F2FF59", role: "Signal", note: "The mark, every go and selected. In small, deliberate amounts." },
    { id: "ink", name: "Ink", hex: "#211927", role: "Ground", note: "Pages and covers, and the mark on yellow." },
    { id: "plum", name: "Plum", hex: "#49378B", role: "Second ground", note: "The jam: the alternative ground for the wordmark." },
    { id: "white", name: "Warm white", hex: "#F0EFED", role: "Text and light", note: "Light grounds and text on dark. Never pure white." },
  ],
  type: {
    display: { family: "Manrope", weight: 800, use: "Headlines: Manrope 800, tight", sample: "Direct a shot." },
    text: { family: "Manrope", weight: 500, use: "Reading: Manrope 400 to 600", sample: "One photo in, a shot with sound out." },
    mono: { family: "IBM Plex Mono", weight: 500, use: "Labels, numbers and ids: IBM Plex Mono", sample: "16:9 · 1280×720 · 24 FPS" },
  },
  voice: {
    summary: "Warm, plain and concrete. We say what a thing does, in short sentences, with at most one small jam pun.",
    words: ["warm", "plain", "playful", "concrete"],
    dos: [
      "Lead with what you can make: a shot, a film, a trend.",
      "Short sentences, one idea each.",
      "Name the room: Story, Stage, Shot, Cut, Library.",
      "One small jam or kitchen pun, never two.",
      "Say open source and your own GPU or Comfy Cloud, plainly.",
    ],
    donts: [
      "No hype words: revolutionary, game-changing, unleash.",
      "No exclamation marks, no emoji in headlines.",
      "Never promise studio results: show a real take.",
      "Never name or compare other products.",
    ],
    lines: [
      { say: "One photo in, a shot with sound out.", not: "Unleash the power of AI video!" },
      { say: "Direct a shot. Or a whole film.", not: "The revolutionary all-in-one video platform" },
      { say: "Keep the good take.", not: "Generate unlimited content at scale" },
    ],
  },
  sizes: { mark: 24, wordmark: 96 },
  rules: [
    { id: "r1", kind: "do", text: "Keep the lid on: use the supplied logo files; never redraw, retrace or recolour the logo." },
    { id: "r2", kind: "do", text: "Yellow on ink or plum. Ink on yellow or warm white." },
    { id: "r3", kind: "dont", text: "Never yellow on a light ground (1.1 : 1), never plum on ink for text or the mark." },
    { id: "r4", kind: "do", text: "Clear space on every side equals the height of the lid. Wordmark at least 96 px wide, mark 24 px tall." },
    { id: "r5", kind: "dont", text: "No shadows, glows or outlines on the logo. No stretching, rotating or busy pictures behind it." },
    { id: "r6", kind: "do", text: "Manrope 800 for headlines, Manrope 500 for reading, IBM Plex Mono for labels, numbers and ids." },
    { id: "r7", kind: "do", text: "Mostly ink and warm white; plum as a second ground; yellow in small, deliberate amounts (about a tenth)." },
    { id: "r8", kind: "do", text: "Keep type inside the story safe zone: clear of the top 13% and the bottom 18%." },
    { id: "r9", kind: "do", text: "Show real output: a take, a trend, a screen of the app. Generated pictures never carry the logo or the headline." },
  ],
};
