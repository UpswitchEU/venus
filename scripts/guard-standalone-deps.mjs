import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(here, '..', 'package.json');
const repoRoot = resolve(here, '..');
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
		if (spec.startsWith('file:./')) {
			const dependencyPath = resolve(repoRoot, spec.slice('file:'.length));
			if (!existsSync(resolve(dependencyPath, 'package.json'))) {
				violations.push({ field, name, spec, reason: 'missing vendored package.json' });
			}
		}
	}
}

if (violations.length > 0) {
	console.error('venus deploys from its own repo (UpswitchEU/venus). The following deps reach outside the repo and will break `pnpm install` on Vercel:');
	for (const v of violations) {
		const reason = v.reason ? ` (${v.reason})` : '';
		console.error(`  ${v.field}.${v.name} = ${v.spec}${reason}`);
	}
	console.error('\nVendor the package into apps/venus/vendor/<name>/ and reference it as file:./vendor/<name>.');
	process.exit(1);
}

const manifestPath = resolve(repoRoot, 'vendor/contracts/manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
for (const [fileName, expectedHash] of Object.entries(manifest.sha256)) {
	const contractPath = resolve(repoRoot, 'vendor/contracts', fileName);
	if (!existsSync(contractPath)) {
		throw new Error(`[standalone-deps] missing vendored contract: ${fileName}`);
	}
	const actualHash = createHash('sha256').update(readFileSync(contractPath)).digest('hex');
	if (actualHash !== expectedHash) {
		throw new Error(
			`[standalone-deps] contract checksum mismatch for ${fileName}: ${actualHash} != ${expectedHash}`,
		);
	}
}

console.log(
	`[standalone-deps] all file: deps are vendor-local; ${Object.keys(manifest.sha256).length} contract checksums verified.`,
);
