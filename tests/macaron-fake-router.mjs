// A stand-in for Comfy Router's picture models and for its Claude writer, for a test that must not spend credits.
// The server is started with it preloaded (NODE_OPTIONS=--import=<this file>): every call to
// api.comfy.org/v2/models/... for a picture is answered here with a small PNG and the header that says what it cost;
// a call to the Claude writer (Brioche's) is answered with a tool call as a model would make it, and the request
// it was sent (the brief, the tool, the prompt) is kept, one JSON line each, in the file MACARON_FAKE_LOG names;
// anything else on api.comfy.org is refused, and everything that is not api.comfy.org goes through as it was.
import { appendFileSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";

const real = globalThis.fetch;

function png(w, h, [r, g, b]) {
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), 8 + data.length);
    return out;
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0);
  head.writeUInt32BE(h, 4);
  head.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", head), chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))), chunk("IEND", Buffer.alloc(0))]);
}

/**
 * What a writer that is careless about the workspace would answer: the action of the open workspace that its tool
 * offers, and one of another workspace that it does not (the server and the page must leave that one alone).
 */
function writerAnswer(body) {
  const ops = body.tools?.[0]?.input_schema?.properties?.actions?.items?.properties?.op?.enum ?? [];
  // the Studio: a story and a shoot as the writer would propose them, and an action of another workspace that must be dropped
  if (ops.includes("propose_shoot")) return { reply: "A story and a shoot for you.", actions: [{ op: "write_ugc", persona: "leo", hook: "Okay, I finally tried it...", beats: [{ kind: "hook", line: "Okay, I finally tried it...", camera: "selfie" }, { kind: "taste", line: "Look at that. Just look at it.", seconds: 99 }], fresh: true }, { op: "propose_shoot", template: "splash", light: "flash", surface: "marble", background: "plum" }, { op: "add_motion_graphic", kind: "title", copy: { title: "Shots worth keeping", sub: "Stand-in" }, seconds: 3 }, { op: "set_status", status: "approved" }] };
  if (ops.includes("write_brief")) return { reply: "A direction for you.", actions: [{ op: "add_direction", name: "Stand-in direction", note: "From the stand-in writer." }, { op: "set_status", status: "approved" }] };
  if (ops.includes("set_colour")) return { reply: "A colour for you.", actions: [{ op: "add_colour", name: "Stand-in red", hex: "#c0392b", role: "Accent" }, { op: "edit_text", layer: "headline", text: "leaks" }] };
  // Create: a banner and a mockup to look at, as the writer would propose them; and two actions of other workspaces that must be dropped
  if (ops.includes("propose_mockup")) return { reply: "A banner, and a poster to look at.", actions: [{ op: "add_design", name: "Stand-in banner", family: "ads", format: "ad-728x90", purpose: "Offer" }, { op: "propose_mockup", scene: "poster-wall" }, { op: "propose_mockup", scene: "the moon" }, { op: "write_brief", fields: { pitch: "leaks" } }] };
  return { reply: "Renamed.", actions: [{ op: "rename", name: "Renamed by the stand-in" }, { op: "write_brief", fields: { pitch: "leaks" } }] };
}

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input?.url ?? String(input);
  if (!url.startsWith("https://api.comfy.org/")) return real(input, init);
  const model = url.split("/v2/models/")[1] ?? "";
  if (/^anthropic\//.test(model)) {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (process.env.MACARON_FAKE_LOG) appendFileSync(process.env.MACARON_FAKE_LOG, `${JSON.stringify({ model, system: body.system?.[0]?.text ?? "", tools: body.tools ?? [], prompt: body.messages?.[0]?.content?.find?.((c) => c.type === "text")?.text ?? "" })}\n`);
    return new Response(JSON.stringify({ content: [{ type: "tool_use", name: "macaron_answer", input: writerAnswer(body) }] }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (!/^(openai|bfl)\//.test(model)) return new Response(JSON.stringify({ error: { message: "not stood in for" } }), { status: 599, headers: { "content-type": "application/json" } });
  // a real picture takes seconds: the page has asked for the job's news long before it comes
  await new Promise((done) => setTimeout(done, 800));
  const bytes = png(64, 80, [180, 120, 200]);
  const body = model.startsWith("openai/") ? { data: [{ b64_json: bytes.toString("base64") }] } : { result: { sample: "data:" } };
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", "x-comfy-credits-used": "3.66" } });
};
