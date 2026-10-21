// Makes the makers' PRESSED logos and their CSS from the one-colour ones (web/brand/makers/mono/<id>.svg):
//   web/brand/makers/pressed/<id>.svg  the logo blind-stamped into a cloth: the mark in a see-through dark (the recess, so it is the
//                                      cloth's own colour, darker) over the same mark in a faint light, a hair lower (the lit lower lip)
//   web/css/ut-makers.css              [data-maker="<id>"] { --mk: the pressed logo; --mk-mono: the plain one (a mask, for chips) }
// Run it again when a logo is added: node scripts/utensils-makers.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MAKERS } from "../web/js/utensils-makers.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const mono = path.join(root, "web/brand/makers/mono");
const pressed = path.join(root, "web/brand/makers/pressed");
fs.mkdirSync(pressed, { recursive: true });

const rules = [];
for (const m of MAKERS) {
  const file = path.join(mono, `${m.id}.svg`);
  if (!fs.existsSync(file)) {
    console.warn(`no logo for ${m.id}`);
    continue;
  }
  const svg = fs.readFileSync(file, "utf8").trim();
  const rule = svg.match(/fill-rule="(\w+)"/)?.[1] ?? "evenodd";
  const inner = svg.replace(/^<svg[^>]*>|<\/svg>$/g, "");
  fs.writeFileSync(path.join(pressed, `${m.id}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -.5 24 25.5"><defs><g id="m" fill-rule="${rule}">${inner}</g></defs>` +
    `<use href="#m" y=".9" fill="#fff" fill-opacity=".2"/><use href="#m" fill="#000" fill-opacity=".52"/></svg>\n`);
  rules.push(`[data-maker="${m.id}"] { --mk: url("../brand/makers/pressed/${m.id}.svg"); --mk-mono: url("../brand/makers/mono/${m.id}.svg"); }`);
}
fs.writeFileSync(path.join(root, "web/css/ut-makers.css"),
  `/* The makers' logos (made by scripts/utensils-makers.mjs from web/brand/makers/mono: do not edit by hand). A book or a chip with\n   data-maker="<id>" has --mk (its logo pressed into the cloth) and --mk-mono (the plain mark, for a mask). */\n${rules.join("\n")}\n`);
console.log(`${rules.length} makers`);
