// Brioche in Create: the brand's designs (social posts and stories, ads, print, web and app screens, mockups), their variations,
// the week's plan, motion pieces and exports. One definition per action, here (see space-kit.js); the page's side of each is
// in run-create.js. An action marked nested may also sit inside make_variation, to be made on the copy.
import { ALL_FORMATS, FAMILIES, FAMILY_KEYS } from "../design.js";
import { SCENE_IDS } from "../macaron-mockup-scenes.js";
import { finite, breaks, str } from "./helpers.js";

const LAYER_PROPS = new Set(["x", "y", "w", "h", "size", "align", "valign", "colorRole", "accent", "fontRole", "lineHeight", "tracking", "opacity", "hidden", "caps", "logo", "rot", "fit", "text", "src", "role", "shape", "radius", "name"]);

/** A layer's properties as she sent them, kept to what a layer has: strings (cut), booleans and numbers. */
function cleanProps(props) {
  const out = {};
  for (const [k, v] of Object.entries(props)) if (LAYER_PROPS.has(k) && (typeof v === "string" || typeof v === "boolean" || finite(v))) out[k] = typeof v === "string" ? (k === "text" ? breaks(v) : v).slice(0, 600) : v;
  return out;
}
/** A fields' clean() for an action that carries a layer's properties. */
const withProps = (a, out) => {
  if (a.props && typeof a.props === "object") out.props = cleanProps(a.props);
  return out;
};

const layer = str(120, "A layer's id, from the design below.");
const design = str(120, "A design's id.");
const props = { type: "object", description: "Layer properties to set: x, y, w, h, size, align, valign, colorRole, accent, fontRole, lineHeight, tracking, opacity, hidden, caps, logo, rot, fit, text, src, role, shape, radius." };
const format = { type: "string", enum: ALL_FORMATS, maxLength: 12, description: "A format's id, from the families below (4:5, 1:1, 9:16, 16:9, ad-300x250, a4, og, hero, phone...)." };
const name = str(120);
const note = str(160);
const status = { type: "string", enum: ["draft", "review", "approved", "scheduled"], maxLength: 12 };
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export default {
  id: "create",
  name: "Create",
  holds: "everything made from the kit: social posts and stories, ads, print, web, app, mockups, video, the week's plan and the exports",
  description: "Answer the user: one short, warm sentence, and the actions to take on the design (none when they only ask a question).",
  intro: `THE OPEN WORKSPACE: Create. It holds everything made from the kit: the brand's designs (social posts and stories, ads, print, web and app screens, mockups), their variations, the week's plan, motion pieces and exports.

A design is layers on a ground: text, image, logo and shape layers, each with an id. Positions are fractions of the frame (x, y, w, h: 0 to 1, from the top left); a text's size is a fraction of the frame's width (0.1 is a big headline, 0.034 a subhead, 0.026 a label). Every frame is 1080 wide whatever it is for, so a size means the same in all of them; the height follows the real thing. Formats, by family: ${Object.entries(FAMILIES).map(([k, f]) => `${k}: ${f.formats.join(", ")}`).join("; ")} (4:5 and 1:1 are feed posts, 9:16 a story or reel; a4 and a5 are flyers, a2 a poster; og is the link-preview share image). Safe zones are given for each format below (inside them keep text and logos); in 9:16 clear of the top 13% and the bottom 18% (the story's app covers them). A strip (728x90, email) has room for one line: the logo, the headline and a call to action. Edits apply to the format that is open, so a change to "y" in 1:1 does not move the layer in 4:5.`,
  rules: "Rules: change only what is asked. Use the layer ids and asset ids shown below, and palette ids for colours (never hex). Copy follows the brand's voice and never uses its don'ts; headlines are short. Colours: text must stay readable on its ground (yellow and warm white on ink or plum, ink on yellow or warm white).",

  /** What she is told of Create each time, after what every workspace is told: the design open, the others, the motion. */
  promptLines(s, cut) {
    const r = (v, n = 3) => (typeof v === "number" ? Math.round(v * 10 ** n) / 10 ** n : v);
    const d = s.design;
    const lines = [];
    if (s.brief?.pitch || s.brief?.goal) lines.push(`Brief: ${cut(s.brief.pitch || s.brief.goal, 260)} Audience: ${cut(s.brief.audience, 140)}`);
    lines.push("");
    if (d) {
      lines.push(`THE DESIGN OPEN: id ${d.id} "${cut(d.name, 60)}", purpose ${d.purpose}, status ${d.status}${d.day ? `, planned ${d.day}` : ""}${d.variantKind ? `, a ${d.variantKind} variation` : ""}. Intent: ${cut(d.intent, 120)}`);
      lines.push(`Open format: ${d.openFormat} (primary ${d.format}; own layouts: ${(d.ownFormats ?? []).join(", ")}; safe x ${r(d.safe?.x, 2)}-${r((d.safe?.x ?? 0) + (d.safe?.w ?? 1), 2)} y ${r(d.safe?.y, 2)}-${r((d.safe?.y ?? 0) + (d.safe?.h ?? 1), 2)}). Ground: ${d.bg?.color ?? "?"}${d.bg?.src ? ` with a picture (dim ${r(d.bg.dim?.alpha ?? 0, 2)})` : ""}.`);
      lines.push("Layers, bottom to top (id · type · role · place in the open format · look):");
      for (const l of d.layers ?? []) {
        const place = `x${r(l.x)} y${r(l.y)} w${r(l.w)}${l.h ? ` h${r(l.h)}` : ""}`;
        const look = l.type === "text" ? `size ${r(l.size)}, ${l.fontRole}, ${l.colorRole}${l.accent ? `/${l.accent}` : ""}, ${l.align}${l.hidden ? ", hidden" : ""} · "${cut(l.text, 110)}"`
          : l.type === "logo" ? `${l.logo}`
          : l.type === "shape" ? `${l.shape} ${l.colorRole}`
          : `${cut(l.src, 60)}, ${l.fit ?? "cover"}`;
        lines.push(`- ${l.id} · ${l.type} · ${l.role ?? "-"} · ${place} · ${look}`);
      }
      if (d.guard?.length) lines.push(`Brand guard says: ${d.guard.slice(0, 6).map((g) => g.text).join("; ")}`);
    } else lines.push("No design is open.");
    lines.push("");
    if (d?.family) lines.push(`FORMATS OF ITS FAMILY (${d.family}): ${(d.siblings ?? []).map((f) => `${f.id} ${f.name} ${f.w}x${f.h}px${f.own ? " (has its layout)" : ""} safe x ${r(f.safe?.x, 2)}-${r(f.safe?.x + f.safe?.w, 2)} y ${r(f.safe?.y, 2)}-${r(f.safe?.y + f.safe?.h, 2)}`).join("; ")}`);
    lines.push(`OTHER DESIGNS: ${(s.designs ?? []).slice(0, 30).map((x) => `${x.id} "${cut(x.name, 40)}" (${x.purpose}, ${x.family ?? "social"} ${x.format}, ${x.status}${x.day ? `, ${x.day}` : ""}${x.variant ? `, ${x.variant}` : ""})`).join("; ") || "none"}`);
    lines.push(`MOTION PIECES: ${(s.motion ?? []).map((m) => `${m.id} on ${m.design} (${m.duration} s, ${m.format})`).join("; ") || "none"}`);
    lines.push(`MOCKUPS MADE: ${(s.mockups ?? []).slice(0, 6).map((m) => `${cut(m.scene, 24)} of ${m.design}`).join("; ") || "none"}`);
    lines.push(`RECENT ASSETS (ids): ${(s.assets ?? []).slice(0, 10).map((a) => `${a.id} "${cut(a.name, 36)}" (${a.kind}, ${a.width}x${a.height})`).join("; ") || "none"}`);
    return lines;
  },

  actions: {
    edit_text: {
      doc: "{layer, text}: the words of a text layer. Wrap one word in *asterisks* to set it in the accent colour; \\n is a new line.",
      fields: { layer, text: { ...str(600), breaks: true } },
      nested: true,
      example: (s) => ({ layer: s.design.layers.find((l) => l.type === "text").id, text: "Made to *be kept*." }),
    },
    set_layer: {
      doc: "{layer, props}: change a layer's properties in the open format (x, y, w, h, size, align left|center|right, valign top|middle|bottom, colorRole, accent, fontRole display|text|mono, lineHeight, tracking, opacity, hidden, caps, logo, rot, fit cover|contain, role).",
      fields: { layer, props },
      clean: withProps,
      nested: true,
      example: (s) => ({ layer: s.design.layers[0].id, props: { opacity: 0.9 } }),
    },
    add_layer: {
      doc: "{type, props}: a new text, shape, image (props.src is an asset's url) or logo (props.logo is a logo id from the kit).",
      fields: { type: { type: "string", enum: ["text", "image", "logo", "shape"], maxLength: 20 }, props },
      clean: withProps,
      nested: true,
      example: () => ({ type: "text", props: { text: "A new line" } }),
    },
    remove_layer: {
      doc: "{layer}",
      fields: { layer },
      nested: true,
      example: (s) => ({ layer: s.design.layers[s.design.layers.length - 1].id }),
    },
    set_background: {
      doc: "{color, asset, dim}: a palette id for the ground, and an asset id for a picture behind (dim: 0 to 0.9 of ink over it).",
      fields: {
        color: str(40, "A palette id for a background."),
        asset: str(60, "An asset's id, for a picture."),
        dim: { type: "number", minimum: 0, maximum: 0.9, description: "How much ink over a background picture, 0 to 0.9." },
      },
      nested: true,
      example: (s) => ({ color: s.kit.palette[0].id }),
    },
    apply_kit: {
      doc: "{}: sets type roles, colours from the palette, the logo in the file that reads on its ground, keeps everything inside the safe zones. Use it when asked to apply or check the brand.",
      fields: {},
      nested: true,
      example: () => ({}),
    },
    suggest_layout: {
      doc: "{layout}: lays the layers out by their roles: stack (centred), left (type left, picture bleeding), poster (picture full-bleed, type over it), split (type and picture side by side), strip (one line: for a banner or an email header). In the open format.",
      fields: { layout: { type: "string", enum: ["stack", "left", "poster", "split", "strip"], maxLength: 20 } },
      nested: true,
      example: () => ({ layout: "left" }),
    },
    adapt_format: {
      doc: "{format}: lays the design out for another format (any of the families), keeping it readable and inside its safe zones, and opens that format. \"Lay it out as a story\" is adapt_format 9:16; \"make a banner of it\" is adapt_format ad-300x250 (or 728x90, 160x600).",
      fields: { format },
      nested: true,
      example: () => ({ format: "9:16" }),
    },
    make_variation: {
      doc: "{kind, name, note, actions}: saves a copy of the design as a variation and makes the nested actions on the copy. kinds: copy (other words), composition (another layout), colour (another ground and colours), intent (another goal: awareness, trial, community), format. Always nest at least one action.",
      fields: {
        kind: { type: "string", enum: ["copy", "composition", "colour", "intent", "format"], maxLength: 20 },
        name,
        note,
        actions: { type: "array", items: { type: "object" }, description: "For make_variation: the changes to make on the new copy." },
      },
      clean(a, out, { nested }) {
        out.actions = (Array.isArray(a.actions) ? a.actions : []).map(nested).filter(Boolean).slice(0, 12);
        return out;
      },
      example: (s) => ({ kind: "copy", name: "Other words", note: "A second try", actions: [{ op: "edit_text", layer: s.design.layers.find((l) => l.type === "text").id, text: "Other words" }] }),
    },
    generate_background: {
      doc: "{prompt, model, use}: makes a new picture with an image model and puts it behind the design (use: background) or as a layer (use: image). gpt is GPT Image 2.5 Flare (follows references, characters, products), flux is FLUX 3 (photographic scenes). The prompt describes a scene only: never ask for words, a logo or a headline in the picture: those are layers.",
      fields: {
        prompt: str(600, "What a new picture shows, in plain words. Never ask for text, a logo or a headline in it."),
        model: { type: "string", enum: ["gpt", "flux"], maxLength: 10 },
        use: { type: "string", enum: ["background", "image"], maxLength: 12 },
      },
      example: () => ({ prompt: "A bowl of plum jam on linen, soft window light", model: "gpt", use: "background" }),
    },
    add_design: {
      doc: "{name, purpose, family, format, layout, headline, sub}: (always write the headline and the subhead in the brand's voice in the same action, never leave the starter's filler: headline is a short line, with a word wrapped in *asterisks* for the accent, sub one short line or \"\" for none) a new design from the brand kit (type roles, colours, the logo and the product laid out) in a format, or in the first format of a family when only family is named; it opens in the editor. A flyer is family print (a4), a banner ad family ads, a share image family web (og), an app store screenshot family app (store).",
      fields: {
        name,
        purpose: { type: "string", enum: ["Launch", "Feature", "Showcase", "Brand", "Offer", "Motion"], maxLength: 12 },
        family: { type: "string", enum: FAMILY_KEYS, maxLength: 12, description: "For add_design: the family of formats, when no format is named: the first of its formats is used." },
        format,
        layout: { type: "string", enum: ["stack", "left", "poster", "split", "strip"], maxLength: 20 },
        headline: str(90, "For add_design: the new design's headline, a short line in the brand's voice (a word wrapped in *asterisks* takes the accent colour)."),
        sub: str(140, "For add_design: its subhead, one short line, or an empty string for none."),
      },
      example: () => ({ name: "Spring post", purpose: "Launch", format: "1:1", layout: "left", headline: "Made to *be kept*", sub: "Plum jam, slowly." }),
    },
    propose_mockup: {
      doc: `{scene, design}: shows a design (the open one when design is left out) in a real-world scene: opens the mockup window with the scene and the design chosen. It spends nothing: the person looks, then asks for the picture and sees its price. Scenes: ${SCENE_IDS.join(", ")}. Use it when the person asks to see a design on a poster, a phone, a bag, a billboard, a label...`,
      fields: { scene: { type: "string", enum: SCENE_IDS, maxLength: 30, description: "For propose_mockup: the real-world scene to place a design in." }, design },
      clean: (a, out) => (out.scene ? out : null),
      example: (s) => ({ scene: SCENE_IDS[0], design: s.design.id }),
    },
    add_motion: {
      doc: "{design}: a motion piece from a design (the open one when design is left out), with a first timing.",
      fields: { design },
      example: (s) => ({ design: s.design.id }),
    },
    plan_design: {
      doc: "{design, day}: the day of the week a post goes out (mon to sun).",
      fields: { design, day: { type: "string", enum: DAYS, maxLength: 3 } },
      example: (s) => ({ design: s.design.id, day: "mon" }),
    },
    set_status: {
      doc: "{design, status}: the design's status (draft, review, approved or scheduled).",
      fields: { design, status },
      example: (s) => ({ design: s.design.id, status: "review" }),
    },
    rename: {
      doc: "{name}: a new name for the open design.",
      fields: { name },
      example: () => ({ name: "Spring post" }),
    },
    select_design: {
      doc: "{design}: opens another design in the editor.",
      fields: { design },
      example: (s) => ({ design: s.designs[0].id }),
    },
  },
};
