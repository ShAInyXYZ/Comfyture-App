import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { revealCrop, cropRevealFrame } from '../server/mixer-reveal-frame.ts';

test('portrait crop uses the protected area and rejects invalid dimensions', () => {
  assert.deepEqual(revealCrop(1000, 2000), {x: 330, y: 340, width: 340, height: 680});
  for (const [w, h] of [[0, 100], [NaN, 500], [100, Infinity], [20000, 100], [1.5, 40]]) assert.throws(() => revealCrop(w, h));
});

test('the opening preserves every source pixel, without regenerating the background', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'reveal-crop-'));
  try {
    const width = 100, height = 200;
    const pixels = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 3;
      pixels[p] = x; pixels[p + 1] = y; pixels[p + 2] = (x + y) % 256;
    }
    const source = join(dir, 'source.ppm');
    await writeFile(source, Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`), pixels]));
    const { bytes, rect } = await cropRevealFrame(source, width, height);
    const cropped = join(dir, 'opening.png'); await writeFile(cropped, bytes);
    const { stdout } = await promisify(execFile)('ffmpeg', ['-v', 'error', '-i', cropped, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {encoding: 'buffer'});
    for (let y = 0; y < rect.height; y++) {
      const start = ((y + rect.y) * width + rect.x) * 3;
      assert.deepEqual(stdout.subarray(y * rect.width * 3, (y + 1) * rect.width * 3), pixels.subarray(start, start + rect.width * 3));
    }
  } finally { await rm(dir, {recursive: true, force: true}); }
});
