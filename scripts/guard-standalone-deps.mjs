import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(here, '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

const depFields = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const violations = [];

for (const field of depFields) {
	const block = pkg[field];
	if (!block) continue;
	for (const [name, spec] of Object.entries(block)) {
		if (typeof spec !== 'string') continue;
		if (spec.startsWith('file:..') || spec.startsWith('file:/')) {
			violations.push({ field, name, spec });
		}
	}
}

if (violations.length > 0) {
	console.error('venus deploys from its own repo (UpswitchEU/venus). The following deps reach outside the repo and will break `pnpm install` on Vercel:');
	for (const v of violations) console.error(`  ${v.field}.${v.name} = ${v.spec}`);
	console.error('\nVendor the package into apps/venus/vendor/<name>/ and reference it as file:./vendor/<name>.');
	process.exit(1);
}

console.log('[standalone-deps] all file: deps are vendor-local.');
