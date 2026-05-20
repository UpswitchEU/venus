/**
 * Shared favicon rasterization from logos/upswitch-app-icon.svg
 * Resolves sharp + png-to-ico from the target app's node_modules (robust in monorepos).
 * Colocated under this app so standalone deploys (single-app repo) resolve imports correctly.
 */

import { createRequire } from 'node:module';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Relative to `public/` — single source for verify + generator. */
export const BRAND_MARK_SVG_REL = join('logos', 'upswitch-mark.svg');
export const APP_ICON_SVG_REL = join('logos', 'upswitch-app-icon.svg');

const SIZES = [
	{ name: 'favicon-16x16.png', size: 16 },
	{ name: 'favicon-32x32.png', size: 32 },
	{ name: 'favicon-48x48.png', size: 48 },
	{ name: 'apple-touch-icon.png', size: 180 },
	{ name: 'android-chrome-192x192.png', size: 192 },
	{ name: 'android-chrome-512x512.png', size: 512 },
];

export const FAVICON_ICO_FILENAME = 'favicon.ico';

/** PNG outputs produced by generateFaviconsForApp (excludes .ico). */
export const RASTER_PNG_FILENAMES = SIZES.map((s) => s.name);

/** All committed artifacts under `public/` that must exist after generation. */
export function expectedPublicBrandRelPaths() {
	return [
		join('public', BRAND_MARK_SVG_REL),
		join('public', APP_ICON_SVG_REL),
		join('public', FAVICON_ICO_FILENAME),
		...RASTER_PNG_FILENAMES.map((n) => join('public', n)),
	];
}

/**
 * @param {string} appRoot Absolute path to the Next.js app (directory containing package.json + public/)
 */
export async function generateFaviconsForApp(appRoot) {
	const root = resolve(appRoot);
	const pkg = join(root, 'package.json');
	const publicDir = join(root, 'public');
	const svgPath = join(publicDir, APP_ICON_SVG_REL);

	if (!existsSync(pkg)) {
		throw new Error(`[generate-favicons] Missing package.json at ${pkg}`);
	}
	if (!existsSync(publicDir)) {
		throw new Error(
			`[generate-favicons] Missing public/ directory at ${publicDir}`
		);
	}
	if (!existsSync(svgPath)) {
		throw new Error(
			`[generate-favicons] Missing source SVG (add ${APP_ICON_SVG_REL} under public/): ${svgPath}`
		);
	}
	const markPath = join(publicDir, BRAND_MARK_SVG_REL);
	if (!existsSync(markPath)) {
		throw new Error(
			`[generate-favicons] Missing brand mark SVG (add ${BRAND_MARK_SVG_REL} under public/): ${markPath}`
		);
	}

	const require = createRequire(pkg);
	let sharp;
	let pngToIco;
	try {
		sharp = require('sharp');
		pngToIco = require('png-to-ico').default;
	} catch (e) {
		throw new Error(
			`[generate-favicons] sharp and png-to-ico must be devDependencies of ${root} (${e.message})`
		);
	}

	const svgBuffer = readFileSync(svgPath);
	const svgText = svgBuffer.toString('utf8');
	if (!svgText.includes('#C98771') || !svgText.includes('#000000')) {
		throw new Error(
			`[generate-favicons] ${APP_ICON_SVG_REL} must include terracotta mark (#C98771) and black tile (#000000); wrong or corrupt SVG?`
		);
	}

	const MIN_PNG_BYTES = 64;
	for (const { name, size } of SIZES) {
		const outPath = join(publicDir, name);
		await sharp(svgBuffer)
			.resize(size, size)
			.png()
			.toFile(outPath);
		const psz = statSync(outPath).size;
		if (psz < MIN_PNG_BYTES) {
			throw new Error(
				`[generate-favicons] ${name} unexpectedly small (${psz} bytes); check source SVG`
			);
		}
		console.log(`Generated ${name} (${size}x${size})`);
	}

	const icoSizes = [16, 32, 48];
	const pngBuffers = await Promise.all(
		icoSizes.map((s) => sharp(svgBuffer).resize(s, s).png().toBuffer())
	);
	const icoBuffer = await pngToIco(pngBuffers);
	const icoPath = join(publicDir, FAVICON_ICO_FILENAME);
	writeFileSync(icoPath, icoBuffer);
	const st = statSync(icoPath);
	if (st.size < 32) {
		throw new Error(
			`[generate-favicons] favicon.ico appears corrupt (size ${st.size} bytes)`
		);
	}
	console.log('Generated favicon.ico (multi-resolution ICO)');
}
