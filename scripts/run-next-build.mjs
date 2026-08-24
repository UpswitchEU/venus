import { spawnSync } from 'node:child_process'

const buildEnvironment = { ...process.env }

// GitHub's quality build validates compilation without connecting to an UpSwitch
// environment. Deployed builds remain fail-closed when their API URL is missing.
if (buildEnvironment.GITHUB_ACTIONS === 'true') {
  buildEnvironment.NEXT_PUBLIC_API_BASE_URL ??= 'http://127.0.0.1:3002'
  buildEnvironment.NEXT_PUBLIC_BACKEND_URL ??= 'http://127.0.0.1:3002'
}

const result = spawnSync('next', ['build'], {
  env: buildEnvironment,
  shell: process.platform === 'win32',
  stdio: 'inherit',
})

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)
