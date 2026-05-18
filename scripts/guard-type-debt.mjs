import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const baselineFile = path.join(root, 'docs/architecture/type-debt-baseline.json');
const writeBaseline = process.argv.includes('--write-baseline');
const scanRoots = ['app', 'src'];
const codeExtensions = new Set(['.ts', '.tsx']);
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
]);
const suppressionPatterns = [
	'@ts-ignore',
	'@ts-expect-error',
	'biome-ignore',
	'eslint-disable',
];

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

function countExplicitAny(sourceFile) {
	let count = 0;

	function visit(node) {
		if (node.kind === ts.SyntaxKind.AnyKeyword) {
			count += 1;
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return count;
}

function countSuppressions(contents) {
	let count = 0;
	for (const line of contents.split('\n')) {
		if (suppressionPatterns.some((pattern) => line.includes(pattern))) {
			count += 1;
		}
	}
	return count;
}

function addCount(bucket, file, count) {
	if (count <= 0) return;
	bucket.files[file] = count;
	bucket.total += count;
}

function scan() {
	const explicitAny = { total: 0, files: {} };
	const suppressions = { total: 0, files: {} };

	for (const scanRoot of scanRoots) {
		for (const file of walk(path.join(root, scanRoot))) {
			const rel = relative(file);
			const contents = fs.readFileSync(file, 'utf8');
			const sourceFile = ts.createSourceFile(
				file,
				contents,
				ts.ScriptTarget.Latest,
				true,
				file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
			);

			addCount(explicitAny, rel, countExplicitAny(sourceFile));
			addCount(suppressions, rel, countSuppressions(contents));
		}
	}

	return {
		owner: 'Architecture',
		updated: new Date().toISOString().slice(0, 10),
		rule: 'Freeze current explicit any and TypeScript/lint suppression debt. New debt fails guard:type-debt; removed debt must also be removed from this baseline.',
		explicitAny,
		suppressions,
	};
}

function loadBaseline() {
	if (!fs.existsSync(baselineFile)) {
		return {
			explicitAny: { total: 0, files: {} },
			suppressions: { total: 0, files: {} },
		};
	}
	return JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
}

function diffBucket(current, baseline) {
	const newDebt = [];
	const staleDebt = [];
	const allFiles = new Set([
		...Object.keys(current.files ?? {}),
		...Object.keys(baseline.files ?? {}),
	]);

	for (const file of [...allFiles].sort()) {
		const currentCount = current.files?.[file] ?? 0;
		const baselineCount = baseline.files?.[file] ?? 0;
		if (currentCount > baselineCount) {
			newDebt.push({ file, current: currentCount, baseline: baselineCount });
		}
		if (currentCount < baselineCount) {
			staleDebt.push({ file, current: currentCount, baseline: baselineCount });
		}
	}

	return { newDebt, staleDebt };
}

function printDebt(title, entries) {
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
		`[type-debt] baseline written: ${current.explicitAny.total} explicit any, ${current.suppressions.total} suppression(s).`
	);
	process.exit(0);
}

const baseline = loadBaseline();
const explicitAnyDiff = diffBucket(current.explicitAny, baseline.explicitAny);
const suppressionDiff = diffBucket(current.suppressions, baseline.suppressions);

printDebt('New explicit any debt detected', explicitAnyDiff.newDebt);
printDebt(
	'Resolved explicit any debt still listed in baseline',
	explicitAnyDiff.staleDebt
);
printDebt('New suppression debt detected', suppressionDiff.newDebt);
printDebt(
	'Resolved suppression debt still listed in baseline',
	suppressionDiff.staleDebt
);

if (
	explicitAnyDiff.newDebt.length > 0 ||
	explicitAnyDiff.staleDebt.length > 0 ||
	suppressionDiff.newDebt.length > 0 ||
	suppressionDiff.staleDebt.length > 0
) {
	console.error(
		'\nRun pnpm run guard:type-debt:update only after the architecture owner accepts the debt change.'
	);
	process.exit(1);
}

console.log(
	`[type-debt] baseline respected: ${current.explicitAny.total} explicit any, ${current.suppressions.total} suppression(s).`
);
