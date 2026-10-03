import fs from 'node:fs'
import path from 'node:path'

// Tailwind compiles trusted repository CSS during the build. Its watcher and
// recursive pattern parser must not be shipped in a production server trace.
const buildDir = process.env.NEXT_DIST_DIR || '.next'
const forbidden = /\/node_modules\/(?:tailwindcss(?:-animate)?|@tailwindcss\/[^/]+|braces)(?:\/|$)/
const traces = []
function collect(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filename = path.join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== 'cache' && entry.name !== 'standalone') collect(filename)
    else if (entry.isFile() && entry.name.endsWith('.nft.json')) traces.push(filename)
  }
}
collect(buildDir)
if (traces.length === 0) throw new Error('Production dependency verification requires build traces.')
const violations = traces.flatMap((trace) => {
  const { files } = JSON.parse(fs.readFileSync(trace, 'utf8'))
  if (!Array.isArray(files)) throw new Error(`Invalid production dependency trace: ${trace}`)
  return files.filter((file) => forbidden.test(`/${file.replaceAll('\\', '/')}`))
    .map((file) => `${trace}: ${file}`)
})
if (violations.length) throw new Error(`Build-only dependencies reached production:\n${violations.join('\n')}`)
console.log(`Verified ${traces.length} production dependency traces: no Tailwind tooling or braces.`)
