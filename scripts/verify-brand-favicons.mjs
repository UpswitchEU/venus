/** Verify committed image dimensions/container without regenerating files. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { expectedPublicBrandRelPaths } from './generate-favicons-lib.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sizes = [16, 32, 48, 180, 192, 512];
const files = ['favicon-16x16.png', 'favicon-32x32.png', 'favicon-48x48.png',
  'apple-touch-icon.png', 'android-chrome-192x192.png', 'android-chrome-512x512.png'];
for (const path of expectedPublicBrandRelPaths()) assert.ok(readFileSync(resolve(root, path)).length);
for (const [index, name] of files.entries()) {
  const metadata = await sharp(resolve(root, 'public', name)).metadata();
  assert.equal(metadata.format, 'png', name);
  assert.equal(metadata.width, sizes[index], name);
  assert.equal(metadata.height, sizes[index], name);
}
const ico = readFileSync(resolve(root, 'public/favicon.ico'));
assert.equal(ico.readUInt16LE(0), 0);
assert.equal(ico.readUInt16LE(2), 1);
assert.equal(ico.readUInt16LE(4), 3);
for (let index = 0; index < 3; index++) {
  const entry = 6 + index * 16;
  const length = ico.readUInt32LE(entry + 8);
  const offset = ico.readUInt32LE(entry + 12);
  assert.ok(offset >= 54 && length > 0 && offset + length <= ico.length);
  const metadata = await sharp(ico.subarray(offset, offset + length)).metadata();
  assert.equal(metadata.width, sizes[index]);
  assert.equal(metadata.height, sizes[index]);
}
console.log('[brand-favicons] PNG dimensions and ICO payloads verified');
