// Mixer's assistant: Praline, the cat who runs the trend shelf. This module writes her brief, the tool she
// answers through, what she is told each time (the shelf, the crew, the user's stars, the trend open and who
// plays it, the saved mixes), and reads her answer, keeping only the five things she can do in Mixer. She
// knows Mixer and nothing else. "Make it" costs credits, so her answer only asks for it: the page asks the
// user, with the price, before anything is made.

export const MIXER_OPS = ["pick_trend", "give_role", "swap_role", "open_mix", "make_it"] as const;

/** How Praline answers: the tool she is made to call, so her answer is data and never prose to be guessed at. */
export const MIXER_TOOL = {
  name: "mixer_answer",
  description: "Answer the user: one or two short sentences, and the actions to take in Mixer (none when they only ask a question).",
  input_schema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "One or two short sentences, in Praline's voice: what you did, or the answer." },
      actions: {
        type: "array",
        description: "What to do, in order. Each has an op and its fields, as the brief lists them.",
        items: {
          type: "object",
          properties: {
            op: { type: "string", enum: [...MIXER_OPS] },
            trend: { type: "string", description: "A trend's id, from the shelf below." },
            role: { type: "string", description: "A role of the trend, as the shelf shows it: Lead, Partner..." },
            crew: { type: "string", description: "A crew member's id." },
            star: { type: "string", description: "The name of one of the user's stars." },
            mix: { type: "string", description: "A saved mix's id." },
          },
          required: ["op"],
        },
      },
    },
    required: ["reply", "actions"],
  },
};

export const MIXER_BRIEF = `You are Praline, the cream-and-caramel cat with a gold bell who runs Comfyture's Mixer: viral trends, made yours. You are quick, upbeat and a little bossy; you speak in one or two short sentences, in the user's language. You answer through the mixer_answer tool: a reply and the actions to take.

Mixer has a shelf of trends: short vertical videos, each with a length, a heat from 1 to 5 and roles to cast (a Lead, a Partner...). The crew plays them by default; any role can go to another of the crew or to one of the user's stars (a photo of their own). Make it draws the trend's first frame with the cast, rolls its takes, makes a track and cuts it all together. It costs credits and takes a few minutes.

Actions (op and its fields):
- pick_trend {trend}: open a trend from the shelf, by its id.
- give_role {role, crew}: that crew member plays the role in the trend that is open (crew is an id from the crew). Or {role, star}: the star with that name plays it.
- swap_role {role}: the next of the crew plays that role.
- open_mix {mix}: open one of the saved mixes, by its id.
- make_it {}: make the trend that is open, with the cast it has. The app asks the user to confirm the price first, with a key under your answer, so say it is ready to make, never that it has started; if they say yes in words, point them to that key.

Rules: use only the ids, roles and names shown below. To choose a trend by what the user says, match its name, its kind or its heat ("the hottest" is the highest heat; on a tie, the first). Change only what is asked, and ask for make_it only when the user says to make or mix it. When a remix is open (an edit the user dropped in), it has its own key that is not yours: pick_trend takes them back to the trends. When the user only asks a question or for advice, answer it and take no action. If a role or a name does not exist, say so and offer what does. Never promise what you did not do. Someone new ("how do I start?", "what is this for?"): two short sentences naming where to begin and the key to press, and say that Show me around, above the bar, walks them through an example for free.`;

interface Summary {
  shelf?: { id: string; name: string; kind?: string; seconds?: number; heat?: number; roles?: { role: string; crew?: string }[] }[];
  crew?: { id: string; name: string; role?: string; kind?: string }[];
  stars?: string[];
  open?: { trend: string; cast?: { role: string; who: string }[]; role?: string | null; cost?: number | null } | null;
  making?: boolean;
  remixing?: boolean;
  mixes?: { id: string; name: string }[];
}
export interface Turn { role: string; text: string; did?: string[] }

const cut = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const list = <T>(v: unknown, n: number): T[] => (Array.isArray(v) ? (v.slice(0, n) as T[]) : []);
// the page's lists of things (trends, crew, mixes) are read as objects, whatever was sent
const things = <T>(v: unknown, n: number): T[] => list<T>(v, n).filter((x) => x && typeof x === "object");

/** What Praline is told each time: the shelf, the crew, the stars, the trend open and its cast, the mixes, the talk so far. */
export function mixerPrompt(s: Summary, turns: Turn[]) {
  const lines: string[] = [];
  lines.push("THE SHELF (id · name · kind · length · heat out of 5 · roles, each with its default player's id):");
  for (const t of things<NonNullable<Summary["shelf"]>[number]>(s.shelf, 40)) {
    lines.push(`- ${cut(t.id, 40)} · ${cut(t.name, 40)} · ${cut(t.kind, 20)} · ${Number(t.seconds) || "?"} s · heat ${Number(t.heat) || "?"} · ${things<{ role: string; crew?: string }>(t.roles, 6).map((r) => `${cut(r.role, 20)} (${cut(r.crew, 20)})`).join(", ")}`);
  }
  lines.push("", "THE CREW (id · name · what they are):");
  for (const c of things<NonNullable<Summary["crew"]>[number]>(s.crew, 20)) lines.push(`- ${cut(c.id, 20)} · ${cut(c.name, 20)} · ${cut(c.role, 40)}${c.kind === "person" ? " (a person)" : ""}`);
  lines.push("", `THE USER'S STARS (their own photos, by name): ${list<string>(s.stars, 30).map((n) => cut(n, 30)).join(", ") || "none yet"}`);
  lines.push("");
  if (s.remixing) lines.push("A REMIX IS OPEN: an edit the user dropped in, with its own Mix it key. No trend is open until one is picked.");
  else if (s.open?.trend) {
    const o = s.open;
    lines.push(`THE TREND OPEN: ${cut(o.trend, 40)}. Cast: ${things<{ role: string; who: string }>(o.cast, 8).map((c) => `${cut(c.role, 20)} = ${cut(c.who, 30)}`).join("; ") || "none"}.${o.role ? ` Picked on screen: ${cut(o.role, 20)}.` : ""} ${typeof o.cost === "number" ? `Make it costs about ${Math.round(o.cost)} credits.` : "Make it runs on the user's own machine."}`);
  } else lines.push("NO TREND IS OPEN.");
  lines.push(s.making ? "A trend is being made right now: Make it has to wait until it is done." : "Nothing is being made now.");
  lines.push("", `SAVED MIXES (newest first; id · name): ${things<{ id: string; name: string }>(s.mixes, 20).map((m) => `${cut(m.id, 60)} · ${cut(m.name, 50)}`).join("; ") || "none"}`);
  lines.push("", "THE CONVERSATION");
  for (const t of turns.slice(-8)) lines.push(`${t.role === "user" ? "User" : "Praline"}: ${cut(t.text, 600)}${t.did?.length ? ` [the app did: ${t.did.join(", ")}]` : ""}`);
  return lines.join("\n");
}

/**
 * Praline's answer, read whole and checked against what the page told her: only her five actions, each with
 * only the ids, roles and names that exist, and make_it once, last. Anything else is dropped.
 */
export function readMixerAnswer(reply: string, s: Summary = {}) {
  const from = reply.indexOf("{");
  const to = reply.lastIndexOf("}");
  let raw: any;
  try {
    raw = JSON.parse(reply.slice(from, to + 1));
  } catch {
    return { reply: reply.replace(/[{}"]/g, "").trim().slice(0, 400) || "I didn't catch that. Say it again?", actions: [] as any[] };
  }
  const shelf = new Map(things<NonNullable<Summary["shelf"]>[number]>(s.shelf, 40).map((t) => [t.id, t]));
  const crew = new Set(things<{ id: string }>(s.crew, 20).map((c) => c.id));
  const stars = new Map(list<string>(s.stars, 30).map((n) => [cut(n, 30).toLowerCase(), cut(n, 30)]));
  const mixes = new Set(things<{ id: string }>(s.mixes, 20).map((m) => m.id));
  // the trend a role is given in: the one open, until an action opens another
  let trend: string | null = !s.remixing && s.open?.trend && shelf.has(s.open.trend) ? s.open.trend : null;
  const roleOf = (v: unknown) => {
    const want = cut(v, 24).toLowerCase();
    return things<{ role: string }>(shelf.get(trend ?? "")?.roles, 6).map((r) => r.role).find((r) => cut(r, 24).toLowerCase() === want);
  };
  const actions: any[] = [];
  let make = false;
  for (const a of list<any>(raw.actions, 40)) {
    // a few actions at most: what is dropped does not count
    if (actions.length >= 8) break;
    switch (a?.op) {
      case "pick_trend":
        if (typeof a.trend === "string" && shelf.has(a.trend)) {
          actions.push({ op: "pick_trend", trend: a.trend });
          trend = a.trend;
        }
        break;
      case "give_role": {
        const role = roleOf(a.role);
        const star = typeof a.star === "string" ? stars.get(cut(a.star, 30).toLowerCase()) : undefined;
        if (role && typeof a.crew === "string" && crew.has(a.crew)) actions.push({ op: "give_role", role, crew: a.crew });
        else if (role && star) actions.push({ op: "give_role", role, star });
        break;
      }
      case "swap_role": {
        const role = roleOf(a.role);
        if (role) actions.push({ op: "swap_role", role });
        break;
      }
      case "open_mix":
        if (typeof a.mix === "string" && mixes.has(a.mix)) {
          actions.push({ op: "open_mix", mix: a.mix });
          trend = null;
        }
        break;
      case "make_it":
        make = true;
        break;
    }
  }
  // there is something to make once a trend is open or has been picked
  if (make && (trend || actions.some((x) => x.op === "open_mix"))) actions.push({ op: "make_it" });
  return { reply: cut(raw.reply, 500), actions };
}
