import { readdir, readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import type { Script } from "./engine.ts";

export type Category = "camera" | "vfx" | "transform";
export const CATEGORIES: Category[] = ["camera", "vfx", "transform"];

/** A preset is a starting template for the script and settings; everything stays editable. */
export interface Preset {
  id: string;
  name: string;
  category: Category;
  /** One short line shown in the bank. */
  blurb: string;
  script: Script;
  /** Transform presets paint their last frame from the start frame. */
  end?: { paint: string };
  seconds?: number;
  /** The bundled sample photo its preview was rendered from. */
  sample?: string;
  /** Media shipped in the preset folder, filled in by the loader. */
  preview?: string;
  poster?: string;
}

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function validate(p: Preset): string[] {
  const errors: string[] = [];
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(p.id ?? "")) errors.push("id must be lowercase letters, digits and dashes");
  if (!p.name?.trim()) errors.push("name is required");
  if (!CATEGORIES.includes(p.category)) errors.push(`category must be one of ${CATEGORIES.join(", ")}`);
  if (!Array.isArray(p.script?.shots) || !p.script.shots.some((s) => s.action?.trim())) {
    errors.push("script needs at least one shot with an action");
  }
  if (p.seconds !== undefined && (!Number.isInteger(p.seconds) || p.seconds < 2 || p.seconds > 10)) {
    errors.push("seconds must be a whole number from 2 to 10");
  }
  return errors;
}

export async function loadPresets(root: string): Promise<Preset[]> {
  const presets: Preset[] = [];
  for (const dir of (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory())) {
    const folder = join(root, dir.name);
    const file = join(folder, "preset.json");
    if (!(await exists(file))) continue;
    const preset = JSON.parse(await readFile(file, "utf8")) as Preset;
    const errors = validate(preset);
    if (preset.id !== dir.name) errors.push(`id "${preset.id}" must match its folder`);
    if (errors.length) {
      console.warn(`presets/${dir.name}: skipped (${errors.join("; ")})`);
      continue;
    }
    for (const [key, name] of [["preview", "preview.mp4"], ["poster", "poster.jpg"]] as const) {
      if (await exists(join(folder, name))) preset[key] = `/presets/${dir.name}/${name}`;
    }
    presets.push(preset);
  }
  const order = (p: Preset) => CATEGORIES.indexOf(p.category);
  return presets.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
}

/** Writes a new preset folder; refuses to overwrite one that exists. */
export async function savePreset(root: string, preset: Preset) {
  const errors = validate(preset);
  if (errors.length) throw Object.assign(new Error(errors.join("; ")), { status: 400 });
  const folder = join(root, preset.id);
  if (await exists(folder)) throw Object.assign(new Error(`A preset called "${preset.id}" already exists.`), { status: 409 });
  await mkdir(folder, { recursive: true });
  const { preview: _p, poster: _q, ...data } = preset;
  await writeFile(join(folder, "preset.json"), JSON.stringify(data, null, 2) + "\n");
}
