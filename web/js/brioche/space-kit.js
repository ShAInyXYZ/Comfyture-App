// Brioche in the Brand kit: the palette, the logo files in colourways, the type, the patterns, the voice and the rules.
// One definition per action, here: its line in her brief, its fields in her tool, how its fields are kept (harness.js reads
// them all). The page's side of each action is in run-kit.js, and a test fails if either is missing.
import { finite, str, list, num } from "./helpers.js";

const id = str(60, "A palette colour's id, from the kit below.");
const hex = { type: "string", maxLength: 7, pattern: "^#[0-9a-fA-F]{6}$", description: "A colour as #RRGGBB." };
const name = str(120, "A name: of a colour, or of a colourway.");
const role = str(40, "What a colour is for, in a few words.");
const ground = str(40, "A palette id: the ground a colourway sits on.");
const logo = str(60, "A logo id from the kit.");

const span = (v, d) => (finite(v) ? Math.min(480, Math.max(40, Math.round(v))) : d);
const unit = (v, d) => (finite(v) ? Math.min(1, Math.max(0, v)) : d);

export default {
  id: "kit",
  name: "Brand kit",
  holds: "palette, logos, type, patterns, rules and the voice",
  owns: ["a brand pattern (the repeating graphic behind its designs)"],
  description: "Answer the user: one short, warm sentence, and the actions to take on the brand kit: its palette, colourways, type, patterns, voice and rules (none when they only ask a question).",
  intro: "THE OPEN WORKSPACE: Brand kit. It holds the palette (colours with what each is for), the logo files in colourways (a wordmark, a mark and an app icon in several colours; a colourway is a logo file on a ground that reads), the type, the patterns (repeating supporting graphics: four the kit draws by itself, and those you draw with add_pattern when asked for a pattern), the voice and the rules.",
  rules: "Logo files are the supplied files: never redraw, recolour or invent one; only pair them. Colours are written as #RRGGBB and must stay readable on each other: the notes below list the pairs that do not. Keep names short.",

  /** What she is told of the kit each time, after what every workspace is told (the palette, the logos, the voice). */
  promptLines(s, cut) {
    const kit = s.kit ?? {};
    return [
      `Type roles: ${Object.entries(kit.type ?? {}).map(([k, v]) => `${k}: ${v.family} ${v.weight}`).join("; ")}`,
      `Voice words: ${(kit.voice?.words ?? []).join(", ")}`,
      `Rules: ${(s.rules ?? []).slice(0, 14).map((x) => `${x.kind === "do" ? "keep" : "never"}: ${cut(x.text, 110)}`).join(" | ") || "none"}`,
      `Colourways saved: ${(s.colourways ?? []).map((c) => `${cut(c.name, 30)} (${c.logo} on ${c.ground})`).join("; ") || "none"}`,
      `Patterns made: ${(s.patterns ?? []).map((x) => cut(x, 40)).join("; ") || "none"} (the kit also draws four of its own: the mark tone on tone, the mark in signal, the wordmark in rows, bands)`,
      `Pairs that do not read (contrast below 4.5): ${(s.lowContrast ?? []).map((c) => `${c.a} on ${c.b} ${c.ratio}`).join("; ") || "none"}`,
    ];
  },

  actions: {
    set_colour: {
      doc: "{id, hex, name, role}: change a palette colour (id from the kit; any of hex, name, role).",
      fields: { id, hex, name, role },
      clean(a, out) {
        if (out.hex) out.hex = out.hex.toUpperCase();
        return out;
      },
      example: (s) => ({ id: s.kit.palette[0].id, hex: "#123456" }),
    },
    add_colour: {
      doc: "{name, hex, role}: a new colour (the palette holds up to eight).",
      fields: { name, hex, role },
      clean(a, out) {
        if (out.hex) out.hex = out.hex.toUpperCase();
        return out;
      },
      example: () => ({ name: "Sky", hex: "#3399FF", role: "Accent" }),
    },
    add_colourway: {
      doc: "{name, ground, logo}: save a pairing of a logo file on a palette ground (ground is a palette id, logo a logo id); choose one that reads (contrast 4.5 or more) and is not shown yet.",
      fields: { name, ground, logo },
      example: (s) => ({ name: "Mark on ink", ground: s.kit.palette[0].id, logo: s.kit.logos[0].id }),
    },
    set_voice: {
      doc: "{summary, words, lines, dos, donts}: change how the brand talks; only what you give is changed. lines are the voice's examples, each a pair: say (a line in the brand's voice) and not (the line it must never be), up to eight; they are what the Voice window and the brand book show. dos and donts are plain lists of habits to keep and avoid.",
      fields: {
        summary: str(300, "How the brand talks, in a sentence."),
        words: list("The voice in up to six words."),
        lines: { type: "array", description: "For set_voice: up to eight example pairs of the voice.", items: { type: "object", properties: { say: str(120, "A line in the brand's voice."), not: str(120, "The line it must never be.") } } },
        dos: list("What the voice does, up to eight short lines."),
        donts: list("What the voice never does, up to eight short lines."),
      },
      clean(a, out) {
        if (Array.isArray(a.lines)) {
          out.lines = a.lines.filter((x) => x && typeof x.say === "string" && x.say.trim()).slice(0, 8).map((x) => ({ say: x.say.slice(0, 120), not: typeof x.not === "string" ? x.not.slice(0, 120) : "" }));
        }
        return out;
      },
      example: () => ({ summary: "Plain and warm.", words: ["plain", "warm"], lines: [{ say: "Made to be kept.", not: "Revolutionary solutions." }], dos: ["Be plain"], donts: ["No hype"] }),
    },
    add_rule: {
      doc: "{kind, text}: a rule to keep (kind do) or never break (kind dont), one plain line.",
      fields: {
        kind: { type: "string", enum: ["do", "dont"], description: "For add_rule: a rule to keep (do) or never break (dont)." },
        text: { ...str(600, "A rule's words."), breaks: true },
      },
      example: () => ({ kind: "do", text: "Keep the lid on." }),
    },
    set_type: {
      doc: "{type, family, weight}: change a type role (display, text or mono).",
      fields: {
        type: { type: "string", enum: ["display", "text", "mono"], description: "For set_type: the type role." },
        family: str(40, "A typeface's family."),
        weight: num("A typeface's weight, 300 to 900.", 300, 900),
      },
      clean(a, out) {
        if (out.weight !== undefined) out.weight = Math.min(900, Math.max(300, Math.round(a.weight / 100) * 100));
        return out;
      },
      example: () => ({ type: "display", family: "Inter", weight: 700 }),
    },
    add_pattern: {
      doc: "{name, ground, w, h, svg, marks}: a new brand pattern (supporting graphics for backgrounds), drawn as one tile that repeats. ground is a palette id; w and h the tile in units (40 to 480); svg is the tile's drawing: only path, circle, ellipse, rect, line, polyline, polygon and g (transform, opacity allowed), every fill and stroke a palette #RRGGBB, no text, no images, no gradients' urls. The tile must repeat without a seam: a shape crossing an edge is drawn again on the opposite edge (shifted by w or h). marks places the brand's own logo files on the tile (logo id, x and y as fractions of the tile, size in units, rotate, ink a palette id): the files are recoloured to that ink, never redrawn. Make it a real designer's pattern for this brand, from its idea and its shapes: a clear motif, a rhythm (half-drop, scatter, waves, stripes, grid, radial), two or three palette colours, quiet enough to sit behind words. Never repeat a pattern listed below; a name of two or three words.",
      fields: {
        name,
        ground,
        w: num("For add_pattern: the tile's width in units (40 to 480).", 40, 480),
        h: num("For add_pattern: the tile's height in units (40 to 480).", 40, 480),
        svg: str(16000, "For add_pattern: the tile's drawing, the inside of an <svg> (no <svg> tag): path, circle, ellipse, rect, line, polyline, polygon and g only, colours as palette #RRGGBB."),
        marks: { type: "array", description: "For add_pattern: the brand's logo files placed on the tile, optional.", items: { type: "object", properties: { logo: str(60, "A logo id from the kit (a mark or a wordmark)."), x: num("Centre across the tile, 0 to 1."), y: num("Centre down the tile, 0 to 1."), size: num("Its longer side, in tile units."), rotate: num("Degrees."), ink: str(60, "The palette id it is drawn in.") } } },
      },
      clean(a, out) {
        // the tile's drawing is checked again on the page (only shapes, only the palette's colours); here it is kept to its size
        if (!out.svg || !out.svg.trim()) return null;
        out.w = span(a.w, 160);
        out.h = span(a.h, out.w);
        out.marks = (Array.isArray(a.marks) ? a.marks : []).filter((m) => m && typeof m.logo === "string").slice(0, 12).map((m) => ({
          logo: m.logo.slice(0, 60), x: unit(m.x, 0.5), y: unit(m.y, 0.5), size: finite(m.size) ? Math.min(480, Math.max(6, m.size)) : 48, rotate: finite(m.rotate) ? Math.max(-360, Math.min(360, m.rotate)) : 0, ink: typeof m.ink === "string" ? m.ink.slice(0, 60) : "",
        }));
        return out;
      },
      example: (s) => ({ name: "Moons", ground: s.kit.palette[0].id, w: 120, h: 120, svg: `<circle cx="60" cy="60" r="20" fill="${s.kit.palette[1].hex}"/>`, marks: [{ logo: s.kit.logos[0].id, x: 0.5, y: 0.5, size: 40, rotate: 0, ink: s.kit.palette[1].id }] }),
    },
  },
};
