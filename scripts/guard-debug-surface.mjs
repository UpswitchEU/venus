import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const baselineFile = path.join(root, 'docs/architecture/debug-surface-baseline.json');
const writeBaseline = process.argv.includes('--write-baseline');
const scanRoots = ['app', 'src'];
const codeExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);
const skipFiles = new Set([
	// Logging adapters are the approved sink for direct console calls.
	'src/lib/authLogger.ts',
	'src/utils/auth/authLogger.ts',
	'src/utils/debugLogger.ts',
	'src/utils/logger.ts',
	'src/utils/loggers.ts',
]);
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
const zeroCounts = { console: 0, alert: 0, debugger: 0 };

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
			entry.name.endsWith('.d.ts') ||
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

function scriptKind(file) {
	const extension = path.extname(file);
	if (extension === '.tsx' || extension === '.jsx') return ts.ScriptKind.TSX;
	if (extension === '.js' || extension === '.mjs' || extension === '.cjs') {
		return ts.ScriptKind.JS;
	}
	return ts.ScriptKind.TS;
}

function isConsoleExpression(expression) {
	if (ts.isPropertyAccessExpression(expression)) {
		if (ts.isIdentifier(expression.expression) && expression.expression.text === 'console') {
			return expression.name.text;
		}
		return undefined;
	}

	if (
		ts.isElementAccessExpression(expression) &&
		ts.isIdentifier(expression.expression) &&
		expression.expression.text === 'console' &&
		ts.isStringLiteralLike(expression.argumentExpression)
	) {
		return expression.argumentExpression.text;
	}

	return undefined;
}

function isAlertExpression(expression) {
	if (ts.isIdentifier(expression) && expression.text === 'alert') return true;
	if (!ts.isPropertyAccessExpression(expression)) return false;
	if (expression.name.text !== 'alert') return false;
	return (
		ts.isIdentifier(expression.expression) &&
		(expression.expression.text === 'window' || expression.expression.text === 'globalThis')
	);
}

function scanFile(file) {
	const sourceText = fs.readFileSync(file, 'utf8');
	const sourceFile = ts.createSourceFile(
		file,
		sourceText,
		ts.ScriptTarget.Latest,
		true,
		scriptKind(file)
	);
	const counts = { ...zeroCounts };
	const consoleMethods = {};

	function visit(node) {
		if (ts.isDebuggerStatement(node)) {
			counts.debugger += 1;
		}

		if (ts.isCallExpression(node)) {
			const consoleMethod = isConsoleExpression(node.expression);
			if (consoleMethod) {
				counts.console += 1;
				consoleMethods[consoleMethod] = (consoleMethods[consoleMethod] ?? 0) + 1;
			}

			if (isAlertExpression(node.expression)) {
				counts.alert += 1;
			}
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);

	return { counts, consoleMethods };
}

function hasDebugSurface(counts) {
	return counts.console > 0 || counts.alert > 0 || counts.debugger > 0;
}

function addCounts(total, counts) {
	total.console += counts.console;
	total.alert += counts.alert;
	total.debugger += counts.debugger;
}

function sortObject(input) {
	return Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right)));
}

function scan() {
	const files = {};
	const totals = { ...zeroCounts };

	for (const scanRoot of scanRoots) {
		for (const file of walk(path.join(root, scanRoot))) {
			const rel = relative(file);
			if (skipFiles.has(rel)) continue;

			const { counts, consoleMethods } = scanFile(file);
			if (!hasDebugSurface(counts)) continue;

			addCounts(totals, counts);
			files[rel] = {
				...counts,
				consoleMethods: sortObject(consoleMethods),
			};
		}
	}

	return {
		owner: 'Architecture',
		updated: new Date().toISOString().slice(0, 10),
		rule: 'Freeze direct console.*, alert(), and debugger usage in production paths. New or increased direct debug surfaces fail guard:debug-surface; approved reductions must update this baseline.',
		scanRoots,
		allowlistedFiles: [...skipFiles].sort(),
		totals,
		files: sortObject(files),
		totalFiles: Object.keys(files).length,
	};
}

function loadBaseline() {
	if (!fs.existsSync(baselineFile)) {
		return { totals: { ...zeroCounts }, files: {} };
	}
	return JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
}

function fileCounts(files, file) {
	const entry = files?.[file] ?? {};
	return {
		console: entry.console ?? 0,
		alert: entry.alert ?? 0,
		debugger: entry.debugger ?? 0,
	};
}

function diffFiles(current, baseline) {
	const newOrGrown = [];
	const reducedOrResolved = [];
	const allFiles = new Set([
		...Object.keys(current.files ?? {}),
		...Object.keys(baseline.files ?? {}),
	]);

	for (const file of [...allFiles].sort()) {
		const currentCounts = fileCounts(current.files, file);
		const baselineCounts = fileCounts(baseline.files, file);
		const grownCategories = [];
		const reducedCategories = [];

		for (const category of Object.keys(zeroCounts)) {
			if (currentCounts[category] > baselineCounts[category]) {
				grownCategories.push({
					category,
					current: currentCounts[category],
					baseline: baselineCounts[category],
				});
			}
			if (currentCounts[category] < baselineCounts[category]) {
				reducedCategories.push({
					category,
					current: currentCounts[category],
					baseline: baselineCounts[category],
				});
			}
		}

		if (grownCategories.length > 0) {
			newOrGrown.push({ file, categories: grownCategories });
		}
		if (reducedCategories.length > 0) {
			reducedOrResolved.push({ file, categories: reducedCategories });
		}
	}

	return { newOrGrown, reducedOrResolved };
}

function formatCategories(categories) {
	return categories
		.map((entry) => {
			const delta = entry.current - entry.baseline;
			return `${entry.category} ${entry.current} vs ${entry.baseline} (${delta > 0 ? '+' : ''}${delta})`;
		})
		.join(', ');
}

function printEntries(title, entries) {
	if (entries.length === 0) return;
	console.error(`\n${title}:`);
	for (const entry of entries) {
		console.error(`- ${entry.file}: ${formatCategories(entry.categories)}`);
	}
}

const current = scan();

if (writeBaseline) {
	fs.writeFileSync(`${baselineFile}.tmp`, `${JSON.stringify(current, null, 2)}\n`);
	fs.renameSync(`${baselineFile}.tmp`, baselineFile);
	console.log(
		`[debug-surface] baseline written: ${current.totalFiles} file(s), ${current.totals.console} console call(s), ${current.totals.alert} alert call(s), ${current.totals.debugger} debugger statement(s).`
	);
	process.exit(0);
}

const baseline = loadBaseline();
const diff = diffFiles(current, baseline);
printEntries('New or increased direct debug surfaces detected', diff.newOrGrown);
printEntries('Reduced direct debug surfaces still listed in baseline', diff.reducedOrResolved);

if (diff.newOrGrown.length > 0 || diff.reducedOrResolved.length > 0) {
	console.error(
		'\nRun pnpm run guard:debug-surface:update only after the architecture owner accepts the debug-surface baseline change.'
	);
	process.exit(1);
}

console.log(
	`[debug-surface] baseline respected: ${current.totalFiles} file(s), ${current.totals.console} console call(s), ${current.totals.alert} alert call(s), ${current.totals.debugger} debugger statement(s).`
);
