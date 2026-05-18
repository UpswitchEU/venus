import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = process.cwd();
const nextDir = path.join(root, '.next');
const buildManifestFile = path.join(nextDir, 'build-manifest.json');
const appBuildManifestFile = path.join(nextDir, 'app-build-manifest.json');
const kib = 1024;

const rootBudgetGzipBytes = 130 * kib;
const routeBudgetsGzipBytes = {
	'/[locale]/reports/new/page': 130 * kib,
	'/[locale]/calculator/page': 130 * kib,
	'/[locale]/calculate/page': 130 * kib,
	'/[locale]/business/buyer-ready/[entityId]/page': 320 * kib,
	'/[locale]/landing/startup/page': 550 * kib,
	'/[locale]/preview-home/page': 550 * kib,
	'/[locale]/reports/[id]/page': 760 * kib,
};

const forbiddenRootChunkMarkers = [
	'dompurify',
	'html2pdf',
	'posthog',
	'recharts',
];

function readJson(file) {
	if (!fs.existsSync(file)) {
		throw new Error(`${path.relative(root, file)} is missing. Run pnpm run build first.`);
	}
	return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function chunkBytes(file) {
	const fullPath = path.join(nextDir, file);
	if (!fs.existsSync(fullPath)) {
		throw new Error(`Chunk listed in manifest is missing: ${file}`);
	}
	return fs.readFileSync(fullPath);
}

function gzipSize(files) {
	let total = 0;
	for (const file of new Set(files)) {
		total += zlib.gzipSync(chunkBytes(file)).length;
	}
	return total;
}

function formatKib(bytes) {
	return `${(bytes / kib).toFixed(1)} KiB`;
}

const buildManifest = readJson(buildManifestFile);
const appBuildManifest = readJson(appBuildManifestFile);
const failures = [];

const rootFiles = buildManifest.rootMainFiles ?? [];
const rootGzip = gzipSize(rootFiles);
if (rootGzip > rootBudgetGzipBytes) {
	failures.push(
		`shared first-load JS is ${formatKib(rootGzip)}; budget is ${formatKib(rootBudgetGzipBytes)}`
	);
}

for (const file of rootFiles) {
	const contents = chunkBytes(file).toString('utf8');
	for (const marker of forbiddenRootChunkMarkers) {
		if (contents.includes(marker)) {
			failures.push(`root chunk ${file} contains heavy marker "${marker}"`);
		}
	}
}

for (const [route, budget] of Object.entries(routeBudgetsGzipBytes)) {
	const files = appBuildManifest.pages?.[route];
	if (!files) {
		failures.push(`route ${route} is missing from .next/app-build-manifest.json`);
		continue;
	}
	const size = gzipSize(files);
	if (size > budget) {
		failures.push(
			`${route} first-load JS is ${formatKib(size)}; budget is ${formatKib(budget)}`
		);
	}
}

if (failures.length > 0) {
	console.error('[bundle-budget] failed');
	for (const failure of failures) {
		console.error(`- ${failure}`);
	}
	process.exit(1);
}

console.log(
	`[bundle-budget] ok: shared ${formatKib(rootGzip)}, ${Object.keys(routeBudgetsGzipBytes).length} route budget(s) respected.`
);
