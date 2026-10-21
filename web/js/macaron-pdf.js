// A minimal PDF writer: one JPEG per page, each page as big as its picture says (as wide as A4 turned on its side, as tall as the picture is). No library:
// a catalog, a page tree, and for each page its content stream (draw the picture to fill the page) and the picture as an image
// object (DCTDecode: the JPEG's own bytes, untouched), then the cross-reference table the readers need. Answers the file as bytes.
// Plain code with no page and no imports, so the server's tests read it too.

/** A string of plain characters as bytes (the PDF's own syntax is ASCII). */
const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 255);
/** A text string for the document's information: UTF-16 with a byte order mark, as hex (any characters, no escaping to get wrong). */
const textString = (s) => {
  const hex = [...`﻿${s}`].map((c) => c.codePointAt(0).toString(16).padStart(4, "0")).join("");
  return `<${hex}>`;
};
const num = (v) => String(Math.round(v * 100) / 100);

/** A JPEG's width and height, read from its first frame header (so a caller need not say them). */
export function jpegSize(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("Not a JPEG.");
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    // SOF0..SOF15 except DHT (c4), JPG (c8), DAC (cc)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
    i += 2 + len;
  }
  throw new Error("The JPEG has no size.");
}

/**
 * The PDF of pages: [{ jpeg: Uint8Array, width?, height? }], as wide as A4 turned on its side (841.89 pt) and as tall as each picture asks. `title` and
 * `author` go into the document's information, `created` (a Date) into its dates.
 */
export function buildPdf(pages, { title = "", author = "", created = new Date() } = {}) {
  if (!pages.length) throw new Error("A PDF needs at least one page.");
  const chunks = [];
  const offsets = [];
  let at = 0;
  const put = (data) => {
    const bytes = typeof data === "string" ? ascii(data) : data;
    chunks.push(bytes);
    at += bytes.length;
  };
  const object = (id, body, stream = null) => {
    offsets[id] = at;
    put(`${id} 0 obj\n`);
    put(body);
    if (stream) {
      put("\nstream\n");
      put(stream);
      put("\nendstream");
    }
    put("\nendobj\n");
  };

  put("%PDF-1.4\n");
  // a few high bytes after the header tell a tool that carries it as text that the file is binary
  put(Uint8Array.of(0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a));

  // object numbers: 1 catalog, 2 page tree, 3 information, then three for each page (page, content, picture)
  const first = (i) => 4 + i * 3;
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${first(i)} 0 R`).join(" ")}] >>`);
  const stamp = `D:${created.toISOString().replace(/[-:T]/g, "").slice(0, 14)}Z`;
  object(3, `<< /Title ${textString(title)} /Author ${textString(author)} /Producer ${textString("Comfyture Macaron")} /CreationDate (${stamp}) >>`);

  pages.forEach((p, i) => {
    const size = p.width && p.height ? { width: p.width, height: p.height } : jpegSize(p.jpeg);
    const w = 841.89;
    const h = (w * size.height) / size.width;
    const [pageId, contentId, imageId] = [first(i), first(i) + 1, first(i) + 2];
    object(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(w)} ${num(h)}] /Resources << /XObject << /Im0 ${imageId} 0 R >> /ProcSet [/PDF /ImageC] >> /Contents ${contentId} 0 R >>`);
    const content = ascii(`q ${num(w)} 0 0 ${num(h)} 0 0 cm /Im0 Do Q`);
    object(contentId, `<< /Length ${content.length} >>`, content);
    object(imageId, `<< /Type /XObject /Subtype /Image /Width ${size.width} /Height ${size.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>`, p.jpeg);
  });

  const count = 4 + pages.length * 3;
  const xref = at;
  put(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) put(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  put(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(at);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

/** A file's bytes as base64 (a page picture inlined in the single-file book). */
export function base64Of(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
