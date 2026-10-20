// A stand-in for Comfy Router's picture models, for a test that must not spend credits. The server is started
// with it preloaded (NODE_OPTIONS=--import=<this file>): every call to api.comfy.org/v2/models/... for a
// picture is answered here with a small PNG and the header that says what it cost; anything else on
// api.comfy.org is refused, and everything that is not api.comfy.org goes through as it was.
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

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input?.url ?? String(input);
  if (!url.startsWith("https://api.comfy.org/")) return real(input, init);
  const model = url.split("/v2/models/")[1] ?? "";
  if (!/^(openai|bfl)\//.test(model)) return new Response(JSON.stringify({ error: { message: "not stood in for" } }), { status: 599, headers: { "content-type": "application/json" } });
  // a real picture takes seconds: the page has asked for the job's news long before it comes
  await new Promise((done) => setTimeout(done, 800));
  const bytes = png(64, 80, [180, 120, 200]);
  const body = model.startsWith("openai/") ? { data: [{ b64_json: bytes.toString("base64") }] } : { result: { sample: "data:" } };
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", "x-comfy-credits-used": "3.66" } });
};
