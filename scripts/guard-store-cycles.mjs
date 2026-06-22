import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const scanRoot = path.join(root, 'src/store');
const codeExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);
const skipDirs = new Set(['__tests__', '_archived', 'node_modules']);

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
			entry.name.endsWith('.spec.tsx')
		) {
			continue;
		}
		files.push(fullPath);
	}

	return files;
}

const files = walk(scanRoot).map((file) => path.resolve(file));
const fileSet = new Set(files);
const staticImportPattern = /^\s*import\s+(?!type\b)(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/gm;
const sideEffectImportPattern = /^\s*import\s+['"]([^'"]+)['"]/gm;
const dynamicImportPattern = /import\(['"]([^'"]+)['"]\)/g;

function relative(file) {
	return path.relative(root, file).replaceAll(path.sep, '/');
}

function candidateFiles(base) {
	const candidates = [];
	for (const extension of codeExtensions) {
		candidates.push(`${base}${extension}`);
	}
	for (const extension of codeExtensions) {
		candidates.push(path.join(base, `index${extension}`));
	}
	return candidates;
}

function resolveImport(fromFile, specifier) {
	let base = null;
	if (specifier.startsWith('.')) {
		base = path.resolve(path.dirname(fromFile), specifier);
	} else if (specifier.startsWith('@/store/')) {
		base = path.resolve(root, 'src/store', specifier.slice('@/store/'.length));
	} else {
		return null;
	}

	for (const candidate of candidateFiles(base)) {
		if (fileSet.has(candidate)) return candidate;
	}
	return null;
}

function runtimeImportsFor(file) {
	const source = fs.readFileSync(file, 'utf8');
	const imports = [];

	for (const pattern of [staticImportPattern, sideEffectImportPattern, dynamicImportPattern]) {
		pattern.lastIndex = 0;
		for (const match of source.matchAll(pattern)) {
			const resolved = resolveImport(file, match[1]);
			if (resolved) imports.push(resolved);
		}
	}

	return imports;
}

const graph = new Map(files.map((file) => [file, runtimeImportsFor(file)]));
const visited = new Set();
const onStack = new Set();
const stack = [];
const cycles = [];

function visit(file) {
	visited.add(file);
	onStack.add(file);
	stack.push(file);

	for (const dependency of graph.get(file) ?? []) {
		if (!visited.has(dependency)) {
			visit(dependency);
			continue;
		}

		if (onStack.has(dependency)) {
			cycles.push(stack.slice(stack.indexOf(dependency)).concat(dependency));
		}
	}

	stack.pop();
	onStack.delete(file);
}

for (const file of files) {
	if (!visited.has(file)) visit(file);
}

const uniqueCycles = [];
const seen = new Set();
for (const cycle of cycles) {
	const key = cycle
		.slice(0, -1)
		.map(relative)
		.sort()
		.join('|');
	if (seen.has(key)) continue;
	seen.add(key);
	uniqueCycles.push(cycle.map(relative));
}

if (uniqueCycles.length > 0) {
	console.error('[store-cycles] runtime import cycle(s) detected:');
	for (const cycle of uniqueCycles) {
		console.error(`- ${cycle.join(' -> ')}`);
	}
	console.error('\nUse type-only imports for contracts, or move shared runtime code behind a neutral helper.');
	process.exit(1);
}

console.log(`[store-cycles] OK. Scanned ${files.length} store file(s); no runtime cycles found.`);
