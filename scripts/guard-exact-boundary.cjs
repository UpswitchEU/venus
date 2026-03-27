const fs = require('node:fs')
const path = require('node:path')

const venusRoot = path.resolve(__dirname, '..')
const apiRoot = path.join(venusRoot, 'app', 'api')
const scanRoots = [path.join(venusRoot, 'app'), path.join(venusRoot, 'src')]
const codeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

const blockedPatterns = [
  { label: 'Exact batch endpoint', regex: /exact\/financial-data\/batch/g },
  { label: 'Removed Titan batch helper', regex: /\bgetDivisionFinancialDataBatch\b/g },
]

function walk(dir) {
  if (!fs.existsSync(dir)) return []

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walk(fullPath))
      continue
    }
    files.push(fullPath)
  }

  return files
}

function relative(filePath) {
  return path.relative(venusRoot, filePath).replaceAll(path.sep, '/')
}

const violations = []

for (const file of walk(apiRoot)) {
  if (relative(file).includes('/exact/')) {
    violations.push({
      file,
      reason: 'Venus must not expose Exact OAuth or proxy API routes.',
    })
  }
}

for (const root of scanRoots) {
  for (const file of walk(root)) {
    if (!codeExtensions.has(path.extname(file))) continue

    const content = fs.readFileSync(file, 'utf8')
    for (const pattern of blockedPatterns) {
      if (pattern.regex.test(content)) {
        violations.push({
          file,
          reason: `${pattern.label} reintroduced in Venus code.`,
        })
      }
      pattern.regex.lastIndex = 0
    }
  }
}

if (violations.length > 0) {
  console.error('Exact/Venus boundary guard failed.\n')
  for (const violation of violations) {
    console.error(`- ${relative(violation.file)}: ${violation.reason}`)
  }
  process.exit(1)
}

console.log('Exact/Venus boundary guard passed.')
