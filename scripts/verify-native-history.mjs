import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { cp, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, firefox, webkit } from 'playwright'
import { verifyNativeHistory } from '../tests/e2e/native-history.scenarios.mjs'

// Run the actual Next router and production form/save hooks against a local
// in-memory endpoint. A temporary project prevents loading Venus's .env files.
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = await mkdtemp(path.join(tmpdir(), 'venus-native-history-'))
const port = Number(process.env.HISTORY_TEST_PORT || 3033)
const baseUrl = `http://127.0.0.1:${port}`
const browser = { chromium, firefox, webkit }[process.env.HISTORY_TEST_BROWSER || 'chromium']
if (!browser) throw new Error('HISTORY_TEST_BROWSER must be chromium, firefox or webkit')
let server
let output = ''
try {
  await cp(path.join(source, 'tests/e2e/fixtures/native-history'), root, { recursive: true })
  await writeFile(path.join(root, 'source-root.json'), JSON.stringify(source))
  await symlink(path.join(source, 'node_modules'), path.join(root, 'node_modules'), 'dir')
  server = spawn(
    process.execPath,
    [
      path.join(source, 'node_modules/next/dist/bin/next'),
      'dev',
      '-H',
      '127.0.0.1',
      '-p',
      String(port),
    ],
    {
      cwd: root,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Fixture startup timed out\n${output}`)),
      120000,
    )
    const capture = (data) => {
      output = (output + data.toString()).slice(-12000)
      if (output.includes('Ready in')) {
        clearTimeout(timer)
        resolve()
      }
    }
    server.stdout.on('data', capture)
    server.stderr.on('data', capture)
    server.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    server.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`Fixture exited (${code})\n${output}`))
    })
  })
  await ready
  await verifyNativeHistory(browser, {
    baseUrl,
    executablePath: process.env.HISTORY_TEST_EXECUTABLE,
  })
} catch (error) {
  console.error(output)
  throw error
} finally {
  if (server && server.exitCode === null) {
    const stopped = once(server, 'exit')
    server.kill('SIGTERM')
    await stopped
  }
  await rm(root, { recursive: true, force: true })
}
