#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateFaviconsForApp } from './generate-favicons-lib.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

generateFaviconsForApp(appRoot).catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
