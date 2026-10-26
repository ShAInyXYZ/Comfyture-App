// The passes of Spice's example scenario, Truffle's Jam Heist: the suite's tools run for real on the five plates through a server of the
// new Spice (api/spice/run), each pass on the one before, and kept in the manifest (OUT/heist.json). Called by scripts/spice-example.mjs
// passes. Resumable: a pass whose clip is in the manifest is not made again. Every run spends credits.
import { writeFileSync } from "node:fs";

/** The chain of each shot: the tool, its words (and settings), in the order they are run; each on the clip the one before made. */
export const CHAINS = {
  sh010: [
    // (Obscura removes from the foreground: on this plate it took the jar; the van and the sign are background, so a region each is redrawn.
    //  The sign's region reaches the ground: a pole left standing under the box was continued, sign and all, on the first try)
    { tool: "inpaint", region: { x: 0, y: 0.25, w: 0.265, h: 0.48 }, words: "A small market stall with a cream and rust striped awning, wooden crates and baskets of apples and flowers on the cobbles, a warm stone house with green shutters behind, golden afternoon light.", note: "The van, painted out" },
    { tool: "day-to-night", scene: "a small grey raccoon tiptoes across a cobbled market yard hugging a jar of red jam, market stalls with striped awnings, strings of small bulbs, warm stone houses", words: "", strength: 1.3, note: "Day to night" },
    // (the road sign stays: Inpaint drew it back into its region three times, and Obscura, which removes from the foreground, took the raccoon instead)
    // (the green pad of In-outpainting: the black pad of Outpaint was kept as black bars at this shape)
    { tool: "in-outpainting", aspect: 2.39, scene: "a small grey raccoon tiptoes across a cobbled market yard at night hugging a jar of red jam, market stalls with striped awnings, strings of glowing bulbs, warm stone houses", note: "Widened to scope" },
    { tool: "sound", words: "soft padding footsteps on cobbles, a light breeze in cloth awnings, crickets, a distant bell", note: "Its sound" },
  ],
  sh020: [
    { tool: "water", scene: "a small bright-green frog sits on a wooden crate beside a jam stall in a cobbled market yard, keeping watch with a hand over its eyes, striped awnings and a string of bulbs behind", words: "heavy rain pours down over the market yard, streaks of rain on the crate and the stall, the cobbles wet and shining", note: "Rain" },
    { tool: "crossview", words: "crossview. new camera angle: slightly left, same height, closer", note: "A new angle" },
    { tool: "cutout", words: "the green frog", note: "Pickle cut out" },
  ],
  sh030: [
    { tool: "refocus", scene: "a close-up of a grey raccoon hugging a big jar of red jam under his chin in a sunlit market yard", note: "Back in focus" },
    { tool: "upscale", height: 1080, note: "Upscaled to 1080" },
    { tool: "sound", words: "a soft contented chuckle, the creak of a jar lid, a quiet market yard, birds", note: "Its sound" },
  ],
  sh040: [
    { tool: "restoration", scene: "an old black-and-white newsreel of a raccoon in a flat cap running across a cobbled market yard with a jar", note: "Restored" },
    { tool: "colorization", scene: "a grey raccoon with a dark eye mask and a dark flat cap running across a cobbled market yard hugging a jar of red jam, warm cream stone houses, cream and rust striped awnings, golden afternoon light", words: "a grey raccoon with a dark eye mask and a dark flat cap, red jam in the jar, warm cream stone houses, striped cream and rust awnings, golden afternoon light", note: "Colourised" },
    { tool: "upscale", height: 1080, note: "Upscaled to 1080" },
  ],
  sh050: [
    { tool: "union-pose", words: "a grey raccoon and a small bright-green frog dance side by side on a wooden market stall counter at night, snow falling softly, strings of warm bulbs glowing, a jar of red jam between them", note: "Redrawn under its pose: snow" },
    { tool: "restyle", words: "a claymation stop-motion film, hand-made clay figures, a miniature set, soft studio light", note: "Restyled as claymation" },
    { tool: "sound", words: "a playful accordion tune, two happy little laughs, bulbs clinking in the breeze", note: "Its sound" },
  ],
};

export async function passes({ SERVER, OUT, manifest, save, api, post, balance, SHOTS }) {
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
  const stop = Number(process.env.STOP_AT ?? 450);
  const start = await balance();
  console.log(`balance ${start}; stops once ${stop} credits are spent`);
  for (const s of SHOTS) {
    if (only && !only.has(s.id)) continue;
    const m = manifest.shots[s.id];
    if (!m?.plate) throw new Error(`${s.id} has no plate yet: run the shots step first`);
    m.passes ??= [];
    let input = m.plate;
    const chains = (await import(`./spice-example-passes.mjs?t=${Date.now()}`)).CHAINS;
    for (const [i, step] of (chains[s.id] ?? []).entries()) {
      const had = m.passes[i];
      if (had?.media) {
        input = had.media;
        continue;
      }
      const before = await balance();
      if (start !== null && before !== null && start - before >= stop) throw new Error(`stopped: ${start - before} credits spent`);
      const body = { video: input.file, tool: step.tool, words: step.words ?? "", scene: step.scene ?? "", size: "standard", ...(step.aspect ? { aspect: step.aspect } : {}), ...(step.height ? { height: step.height } : {}), ...(step.region ? { region: step.region } : {}), ...(step.strength ? { strength: step.strength } : {}) };
      console.log(`${s.id} pass ${i + 1}: ${step.tool} on ${input.file} (balance ${before})`);
      // (a run that Cloud drops on the way, a timeout on the upload or the submit, is sent once more)
      let made;
      let started;
      for (let attempt = 1; ; attempt++) {
        try {
          started = await post("/api/spice/run", body);
          made = started.template ? await waitTemplate(api, started.id) : await waitJob(SERVER, started.id);
          break;
        } catch (e) {
          if (attempt < 2 && /timeout|aborted|ECONNRESET|fetch failed/i.test(String(e.message))) {
            console.log(`  ${e.message}: once more`);
            continue;
          }
          // a tool that cannot run on this clip is noted and the chain goes on without it
          console.log(`  ${step.tool} skipped: ${e.message}`);
          m.passes[i] = { tool: step.tool, skipped: e.message };
          await save();
          break;
        }
      }
      if (!made) continue;
      const after = await balance();
      m.passes[i] = { tool: step.tool, words: step.words ?? "", scene: step.scene ?? "", params: { size: "standard", ...(step.aspect ? { aspect: step.aspect } : {}), ...(step.height ? { height: step.height } : {}), ...(step.region ? { region: step.region } : {}), ...(step.strength ? { strength: step.strength } : {}) }, note: step.note, input, media: made.media, ...(made.extra ? { extra: made.extra } : {}), credits: before !== null && after !== null ? Math.round((before - after) * 100) / 100 : null, job: started.id };
      await save();
      input = made.media;
      console.log(`  made ${made.media.file} ${made.media.width}x${made.media.height} ${made.media.seconds}s, ${m.passes[i].credits ?? "?"} credits`);
    }
  }
  writeFileSync(`${OUT}/passes-done.txt`, new Date().toISOString());
}

/** A template job of the runner, polled to its end. */
async function waitTemplate(api, id) {
  for (let i = 0; i < 1800; i++) {
    const j = await api(`/api/utensils/templates/job/${id}`);
    if (j.status === "done") {
      const v = (j.outputs ?? []).find((o) => o.kind === "video");
      if (!v) throw new Error("the template made no clip");
      return { media: { file: v.file, url: v.url, width: v.width, height: v.height, seconds: v.seconds } };
    }
    if (j.status === "failed" || j.status === "canceled") throw new Error(`template ${j.status}: ${j.error ?? ""}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("the template took too long");
}

/** An engine job, followed on the event stream to its end. */
async function waitJob(SERVER, id) {
  const sse = await fetch(`${SERVER}/api/events`);
  const reader = sse.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let done = null;
  const t0 = Date.now();
  try {
    while (!done) {
      const { value, done: end } = await reader.read();
      if (end) break;
      buf += dec.decode(value);
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = chunk.split("\n").find((l) => l.startsWith("data:"))?.slice(5);
        if (!data) continue;
        try {
          const j = JSON.parse(data);
          if (j.id === id && ["done", "failed", "canceled"].includes(j.status)) done = j;
        } catch {}
      }
      if (Date.now() - t0 > 30 * 60_000) throw new Error("gave up after 30 minutes");
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  if (!done || done.status !== "done") throw new Error(`${done?.status ?? "no answer"}: ${done?.error ?? ""}`);
  const v = done.video;
  return { media: { file: v.file, url: v.url, width: v.width, height: v.height, seconds: v.duration }, ...(v.extra ? { extra: v.extra } : {}) };
}
