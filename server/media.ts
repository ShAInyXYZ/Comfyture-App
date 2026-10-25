import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { extname } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".gif": "image/gif",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".ico": "image/x-icon",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

export function typeFor(path: string): string {
  return TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

export const IMAGE_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

/** Reads width and height from PNG, JPEG or WebP bytes without decoding. */
export function imageSize(b: Buffer): { width: number; height: number } | null {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) {
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
    return null;
  }
  if (b.length > 30 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const kind = b.toString("ascii", 12, 16);
    if (kind === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (kind === "VP8L") {
      const bits = b.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (kind === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

// what is worth compressing: the app's code, styles and data, and the Stage's models (about a quarter of their size gzipped)
const PACKABLE = /^(text\/|application\/(javascript|json|xml)|image\/svg|model\/gltf)/;
const pack = promisify(gzip);
// the compressed copies, kept by file and version so each is compressed once (the oldest go past 96 MB)
const packed = new Map<string, Buffer>();
let packedBytes = 0;
function keep(key: string, body: Buffer) {
  packed.set(key, body);
  packedBytes += body.length;
  for (const [k, b] of packed) {
    if (packedBytes <= 96 * 1024 * 1024) break;
    packed.delete(k);
    packedBytes -= b.length;
  }
}

/**
 * Streams a file, honouring Range requests so video can seek, and its validators: a file the browser already has (same size, same
 * time) answers 304 with no body, so the app's ~700 files and the Stage's models are fetched once, not on every visit.
 */
export async function sendFile(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  cache = "no-cache",
  download?: string,
) {
  let size: number;
  let mtime: Date;
  try {
    const s = await stat(path);
    if (!s.isFile()) throw new Error("not a file");
    size = s.size;
    mtime = s.mtime;
  } catch {
    res.writeHead(404).end();
    return;
  }
  const etag = `W/"${size.toString(16)}-${Math.floor(mtime.getTime() / 1000).toString(16)}"`;
  const headers: Record<string, string | number> = {
    "Content-Type": typeFor(path),
    "Accept-Ranges": "bytes",
    "Cache-Control": cache,
    ETag: etag,
    "Last-Modified": mtime.toUTCString(),
  };
  // the browser's copy is still this file: nothing to send
  const match = req.headers["if-none-match"];
  const since = req.headers["if-modified-since"];
  if ((match && match.split(/\s*,\s*/).includes(etag)) || (!match && since && Math.floor(mtime.getTime() / 1000) <= Math.floor(Date.parse(since) / 1000))) {
    res.writeHead(304, { ETag: etag, "Last-Modified": headers["Last-Modified"], "Cache-Control": cache }).end();
    return;
  }
  if (download) headers["Content-Disposition"] = `attachment; filename="${download.replace(/[^\w.-]/g, "_")}"`;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  // code, styles, data and models go gzipped to a browser that takes it (a whole file, never a range)
  const type = String(headers["Content-Type"]);
  if (!range && !download && size > 1024 && size < 16 * 1024 * 1024 && PACKABLE.test(type) && /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""))) {
    const key = `${path}|${etag}`;
    let body = packed.get(key);
    if (!body) keep(key, (body = await pack(await readFile(path), { level: 6 })));
    res.writeHead(200, { ...headers, "Content-Encoding": "gzip", Vary: "Accept-Encoding", "Content-Length": body.length });
    return void res.end(req.method === "HEAD" ? undefined : body);
  }
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
      return;
    }
    res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
    if (req.method === "HEAD") return void res.end();
    createReadStream(path, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, "Content-Length": size });
  if (req.method === "HEAD") return void res.end();
  createReadStream(path).pipe(res);
}
