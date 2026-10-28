import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

/** Matches the blank portrait area required by problemFramePrompt; no image regeneration. */
export function revealCrop(width: number, height: number) {
  if (![width, height].every(n => Number.isInteger(n) && n >= 16 && n <= 16384)) throw Error('Invalid reveal image dimensions.');
  const w = Math.round(width * .34), h = Math.round(height * .34);
  return { x: Math.round((width - w) / 2), y: Math.round(height * .17), width: w, height: h };
}

export async function cropRevealFrame(path: string, width: number, height: number) {
  const rect = revealCrop(width, height);
  // RGB + exact crop avoids chroma-alignment shifts. PNG retains the source pixels;
  // the video workflow performs its own final input resizing.
  const { stdout } = await exec('ffmpeg', ['-nostdin', '-v', 'error', '-i', path,
    '-vf', `format=rgb24,crop=${rect.width}:${rect.height}:${rect.x}:${rect.y}:exact=1`,
    '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-'],
  { encoding: 'buffer', timeout: 30000, maxBuffer: 32 << 20 });
  return { bytes: stdout, rect };
}
