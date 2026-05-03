/**
 * Invariant: every Venus app/api route module exports runtime = "nodejs",
 * maxDuration as a numeric literal, and usually dynamic = "force-dynamic"
 * for Titan/cookie-backed proxies. Mirrors Mercury static segment-config guard
 * (Next.js 15+ / Vercel: unconfigured handlers can hang until kill).
 *
 * Static file scan only — does not import route modules.
 */

import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const APP_API_DIR = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
	'..',
	'app',
	'api'
);

async function listRouteFiles(rootDir: string): Promise<string[]> {
	const out: string[] = [];
	async function walk(current: string): Promise<void> {
		const entries = await readdir(current, { withFileTypes: true });
		for (const entry of entries) {
			const full = join(current, entry.name);
			if (entry.isDirectory()) {
				await walk(full);
				continue;
			}
			if (entry.name === 'route.ts' || entry.name === 'route.tsx') {
				out.push(full);
			}
		}
	}
	await walk(rootDir);
	return out.sort();
}

function toRelative(file: string): string {
	return relative(resolve(APP_API_DIR, '..', '..'), file)
		.split(sep)
		.join('/');
}

const RUNTIME_NODEJS_RE = /^\s*export\s+const\s+runtime\s*=\s*['"]nodejs['"]/m;
const RUNTIME_EDGE_RE = /^\s*export\s+const\s+runtime\s*=\s*['"]edge['"]/m;
const MAX_DURATION_RE =
	/^\s*export\s+const\s+maxDuration\s*=\s*(\d+)\s*;?\s*$/m;

/** Default ceiling — most Venus BFF proxies stay at or below this. */
const MAX_DURATION_CEILING = 120;

const MAX_DURATION_HARD_CEILING = 900;

/**
 * Routes intentionally above {@link MAX_DURATION_CEILING}.
 *
 * - Normalization catch-all: Titan + ValuationIQ can exceed 120s on heavy saves.
 */
const MAX_DURATION_EXCEPTIONS: ReadonlyMap<string, number> = new Map([
	['app/api/normalization/[[...path]]/route.ts', 900],
]);

/** Venus keeps all API routes on Node until an Edge-only pathway is justified. */
const EDGE_RUNTIME_ROUTES: ReadonlySet<string> = new Set([]);

describe('Venus BFF: every API route declares Next.js segment config', () => {
	it('every route.ts exports runtime = "nodejs" (or is on the Edge allowlist)', async () => {
		const files = await listRouteFiles(APP_API_DIR);
		expect(files.length).toBeGreaterThan(0);

		const missingRuntime: string[] = [];
		const unauthorizedEdge: string[] = [];
		const seenEdge: string[] = [];

		for (const file of files) {
			const source = await readFile(file, 'utf8');
			const rel = toRelative(file);
			const isEdge = RUNTIME_EDGE_RE.test(source);
			const isNode = RUNTIME_NODEJS_RE.test(source);

			if (isEdge) {
				seenEdge.push(rel);
				if (!EDGE_RUNTIME_ROUTES.has(rel)) {
					unauthorizedEdge.push(rel);
				}
				continue;
			}

			if (!isNode) {
				missingRuntime.push(rel);
			}
		}

		expect(
			missingRuntime,
			`Routes missing 'export const runtime = "nodejs"'. Add explicit runtime for Vercel reliability.`
		).toEqual([]);

		expect(unauthorizedEdge, `Routes declaring Edge runtime without allowlist entry.`).toEqual(
			[]
		);

		const allowlistStale = [...EDGE_RUNTIME_ROUTES].filter((rel) => !seenEdge.includes(rel));
		expect(allowlistStale, `EDGE_RUNTIME_ROUTES allowlist is stale.`).toEqual([]);
	});

	it('every route.ts exports a primitive-literal maxDuration within its allowed ceiling', async () => {
		const files = await listRouteFiles(APP_API_DIR);
		const offenders: string[] = [];
		const exceptionsExercised = new Set<string>();

		for (const file of files) {
			const source = await readFile(file, 'utf8');
			const rel = toRelative(file);
			const match = source.match(MAX_DURATION_RE);
			if (!match) {
				offenders.push(rel);
				continue;
			}
			const value = Number.parseInt(match[1] ?? '', 10);
			if (!Number.isFinite(value) || value < 1) {
				offenders.push(`${rel} (got ${match[1]})`);
				continue;
			}

			if (value > MAX_DURATION_HARD_CEILING) {
				offenders.push(
					`${rel} (got ${match[1]} — exceeds hard ceiling ${MAX_DURATION_HARD_CEILING})`
				);
				continue;
			}

			if (value > MAX_DURATION_CEILING) {
				const allowedCap = MAX_DURATION_EXCEPTIONS.get(rel);
				if (allowedCap === undefined) {
					offenders.push(
						`${rel} (got ${match[1]} — exceeds default ceiling ${MAX_DURATION_CEILING}, add MAX_DURATION_EXCEPTIONS entry with justification)`
					);
					continue;
				}
				if (value > allowedCap) {
					offenders.push(
						`${rel} (got ${match[1]} — exceeds allowlist cap ${allowedCap})`
					);
					continue;
				}
				exceptionsExercised.add(rel);
			}
		}

		expect(
			offenders,
			`Routes must export 'export const maxDuration = N' as a numeric literal (Next.js static analyzer).`
		).toEqual([]);

		const staleAllowlist = [...MAX_DURATION_EXCEPTIONS.keys()].filter(
			(rel) => !exceptionsExercised.has(rel)
		);
		expect(staleAllowlist, `MAX_DURATION_EXCEPTIONS contains unused entries.`).toEqual([]);
	});

	it('every route.ts that uses cookies or upstream fetch should force-dynamic (heuristic)', async () => {
		const files = await listRouteFiles(APP_API_DIR);
		const missingDynamic: string[] = [];

		for (const file of files) {
			const source = await readFile(file, 'utf8');
			const rel = toRelative(file);
			const needsDynamic =
				source.includes('cookies(') ||
				source.includes('headers(') ||
				source.includes('fetch(') ||
				source.includes('fetchWithTimeout');

			if (!needsDynamic) continue;

			const hasDynamic = /export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/.test(
				source
			);
			if (!hasDynamic) {
				missingDynamic.push(rel);
			}
		}

		expect(
			missingDynamic,
			`Routes that call fetch/cookies/headers should export dynamic = 'force-dynamic' so Next does not try to cache proxy responses.`
		).toEqual([]);
	});
});
