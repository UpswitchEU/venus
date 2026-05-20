import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const scanRoots = ['app', 'src'];
const rootFiles = [
	'middleware.ts',
	'next.config.js',
	'.env.example',
	'.env.local.example',
	'.env.production.example',
	'.env.staging.example',
	'env.example',
	'env.unlimited.example',
];

const codeExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);
const configExtensions = new Set(['.json', '.env']);
const skipDirs = new Set([
	'.git',
	'.next',
	'__tests__',
	'_archived',
	'coverage',
	'dist',
	'node_modules',
	'playwright-report',
	'test-results',
	'tests',
]);

const forbiddenRules = [
	{
		id: 'public-platform-password-env',
		pattern: /\bNEXT_PUBLIC_PLATFORM_PASSWORD\b/g,
		reason: 'Platform access secrets must never be exposed through NEXT_PUBLIC_*.',
	},
	{
		id: 'platform-password-env',
		pattern: /\bPLATFORM_PASSWORD\b/g,
		reason: 'Venus must not carry a standalone platform password gate.',
	},
	{
		id: 'platform-password-component',
		pattern: /\bPlatformPasswordProtection\b/g,
		reason: 'Browser-side platform password protection is not real access control.',
	},
	{
		id: 'platform-password-client-state',
		pattern: /\b(platformPassword|platform_password|platform-password)\b/gi,
		reason: 'Platform password state/cookies in client code reintroduce the removed gate.',
	},
	{
		id: 'public-auth-secret-env',
		pattern:
			/\bNEXT_PUBLIC_[A-Z0-9_]*(?:PASSWORD|SECRET|ACCESS_TOKEN|REFRESH_TOKEN|AUTH_TOKEN|SESSION_TOKEN)[A-Z0-9_]*\b/g,
		reason: 'Auth secrets and session tokens must be server-only, never public env.',
	},
];

function isScannableFile(file) {
	const basename = path.basename(file);
	const extension = path.extname(file);

	if (
		basename.endsWith('.d.ts') ||
		basename.includes('.test.') ||
		basename.includes('.spec.') ||
		basename === 'next-env.d.ts'
	) {
		return false;
	}

	if (codeExtensions.has(extension) || configExtensions.has(extension)) return true;
	return basename.startsWith('.env') || basename.endsWith('.env.example');
}

function walk(dir) {
	if (!fs.existsSync(dir)) return [];

	const entries = fs.readdirSync(dir, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (skipDirs.has(entry.name)) continue;
			files.push(...walk(fullPath));
			continue;
		}

		if (!entry.isFile() || !isScannableFile(fullPath)) continue;
		files.push(fullPath);
	}

	return files;
}

function relative(file) {
	return path.relative(root, file).replaceAll(path.sep, '/');
}

function lineInfo(source, index) {
	const prefix = source.slice(0, index);
	const line = prefix.split('\n').length;
	const lineStart = source.lastIndexOf('\n', index - 1) + 1;
	const rawLineEnd = source.indexOf('\n', index);
	const lineEnd = rawLineEnd === -1 ? source.length : rawLineEnd;
	const excerpt = source.slice(lineStart, lineEnd).trim();

	return { line, excerpt };
}

function scanFile(file) {
	const source = fs.readFileSync(file, 'utf8');
	const findings = [];

	for (const rule of forbiddenRules) {
		rule.pattern.lastIndex = 0;
		let match = rule.pattern.exec(source);

		while (match) {
			const { line, excerpt } = lineInfo(source, match.index);
			findings.push({
				file: relative(file),
				line,
				rule: rule.id,
				reason: rule.reason,
				excerpt,
			});

			if (match.index === rule.pattern.lastIndex) {
				rule.pattern.lastIndex += 1;
			}
			match = rule.pattern.exec(source);
		}
	}

	return findings;
}

const files = [
	...scanRoots.flatMap((scanRoot) => walk(path.join(root, scanRoot))),
	...rootFiles
		.map((file) => path.join(root, file))
		.filter((file) => fs.existsSync(file) && isScannableFile(file)),
];

const findings = files.flatMap(scanFile).sort((left, right) => {
	const byFile = left.file.localeCompare(right.file);
	if (byFile !== 0) return byFile;
	return left.line - right.line;
});

if (findings.length > 0) {
	console.error('[auth-surface] Forbidden client-side access-control surface found.');
	for (const finding of findings) {
		console.error(`- ${finding.file}:${finding.line} ${finding.rule}`);
		console.error(`  ${finding.reason}`);
		console.error(`  ${finding.excerpt}`);
	}
	process.exit(1);
}

console.log(
	`[auth-surface] OK. Scanned ${files.length} files; no public platform password gate or client auth-secret surface found.`
);
