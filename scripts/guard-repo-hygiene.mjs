import { execFileSync } from 'node:child_process';

const trackedFiles = execFileSync('git', ['ls-files'], {
	encoding: 'utf8',
})
	.split('\n')
	.filter(Boolean);

const allowedEnvFiles = new Set([
	'.env.example',
	'.env.staging.example',
	'env.example',
	'env.unlimited.example',
]);

function isDisallowed(file) {
	if (file === '.env' || (file.startsWith('.env.') && !allowedEnvFiles.has(file))) {
		return true;
	}
	if (file.startsWith('playwright-report/') || file.startsWith('test-results/')) {
		return true;
	}
	if (file.startsWith('.yarn/') || file === '.yarnrc.yml') return true;
	if (file.endsWith('.tsbuildinfo')) return true;
	if (file === 'build-output.log' || file === 'dev.log') return true;
	if (file === 'biome_output.txt' || file.startsWith('logs/')) return true;
	return false;
}

const disallowed = trackedFiles.filter(isDisallowed);

if (disallowed.length > 0) {
	console.error('Tracked local/generated files are not allowed:');
	for (const file of disallowed) console.error(`- ${file}`);
	console.error('\nRemove them from the index with git rm --cached <file>.');
	process.exit(1);
}

console.log('[repo-hygiene] no tracked local/generated files found.');
