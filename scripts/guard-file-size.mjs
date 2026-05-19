import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const baselineFile = path.join(root, 'docs/architecture/file-size-baseline.json');
const writeBaseline = process.argv.includes('--write-baseline');
const maxLines = Number(process.env.FILE_SIZE_MAX_LINES ?? 1000);
const scanRoots = ['app', 'src'];
const codeExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);
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

		if (!entry.isFile()) continue;
		if (!codeExtensions.has(path.extname(entry.name))) continue;
		if (
			entry.name.endsWith('.test.ts') ||
			entry.name.endsWith('.test.tsx') ||
			entry.name.endsWith('.spec.ts') ||
			entry.name.endsWith('.spec.tsx') ||
			entry.name === 'next-env.d.ts'
		) {
			continue;
		}
		files.push(fullPath);
	}

	return files;
}

function relative(file) {
	return path.relative(root, file).replaceAll(path.sep, '/');
}

function countLines(contents) {
	if (contents.length === 0) return 0;
	return contents.split(/\r\n|\r|\n/).length;
}

function scan() {
	const files = {};

	for (const scanRoot of scanRoots) {
		for (const file of walk(path.join(root, scanRoot))) {
			const lines = countLines(fs.readFileSync(file, 'utf8'));
			if (lines > maxLines) {
				files[relative(file)] = lines;
			}
		}
	}

	return {
		owner: 'Architecture',
		updated: new Date().toISOString().slice(0, 10),
		maxLines,
		rule: 'Freeze current oversized production files. New files over maxLines or growth in existing oversized files fails guard:file-size; shrinkage must also be removed from this baseline.',
		files,
		totalFiles: Object.keys(files).length,
	};
}

function loadBaseline() {
	if (!fs.existsSync(baselineFile)) {
		return { maxLines, files: {} };
	}
	return JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
}

function diffFiles(current, baseline) {
	const newOrGrown = [];
	const shrunkOrResolved = [];
	const allFiles = new Set([
		...Object.keys(current.files ?? {}),
		...Object.keys(baseline.files ?? {}),
	]);

	for (const file of [...allFiles].sort()) {
		const currentLines = current.files?.[file] ?? 0;
		const baselineLines = baseline.files?.[file] ?? 0;
		if (currentLines > baselineLines) {
			newOrGrown.push({ file, current: currentLines, baseline: baselineLines });
		}
		if (currentLines < baselineLines) {
			shrunkOrResolved.push({ file, current: currentLines, baseline: baselineLines });
		}
	}

	return { newOrGrown, shrunkOrResolved };
}

function printEntries(title, entries) {
	if (entries.length === 0) return;
	console.error(`\n${title}:`);
	for (const entry of entries) {
		const delta = entry.current - entry.baseline;
		console.error(
			`- ${entry.file}: current ${entry.current}, baseline ${entry.baseline} (${delta > 0 ? '+' : ''}${delta})`
		);
	}
}

const current = scan();

if (writeBaseline) {
	fs.writeFileSync(`${baselineFile}.tmp`, `${JSON.stringify(current, null, 2)}\n`);
	fs.renameSync(`${baselineFile}.tmp`, baselineFile);
	console.log(
		`[file-size] baseline written: ${current.totalFiles} file(s) over ${current.maxLines} lines.`
	);
	process.exit(0);
}

const baseline = loadBaseline();
if (baseline.maxLines !== current.maxLines) {
	console.error(
		`[file-size] maxLines mismatch: current ${current.maxLines}, baseline ${baseline.maxLines}. Run guard:file-size:update after architecture approval.`
	);
	process.exit(1);
}

const diff = diffFiles(current, baseline);
printEntries('New or grown oversized files detected', diff.newOrGrown);
printEntries('Shrunk oversized files still listed in baseline', diff.shrunkOrResolved);

if (diff.newOrGrown.length > 0 || diff.shrunkOrResolved.length > 0) {
	console.error(
		'\nRun pnpm run guard:file-size:update only after the architecture owner accepts the file-size baseline change.'
	);
	process.exit(1);
}

console.log(
	`[file-size] baseline respected: ${current.totalFiles} file(s) over ${current.maxLines} lines.`
);
