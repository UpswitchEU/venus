#!/usr/bin/env node

import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const SKIP_SUFFIXES = new Set([
  '.bin',
  '.csv',
  '.gif',
  '.ico',
  '.jpg',
  '.jpeg',
  '.lock',
  '.pdf',
  '.png',
  '.pyc',
  '.svg',
  '.webp',
  '.xlsx',
  '.zip',
])
const SKIP_PARTS = new Set([
  '.git',
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
])
const SKIP_FILE_NAMES = new Set(['pnpm-lock.yaml'])
const PLACEHOLDER_MARKERS = [
  '***',
  '...',
  '<',
  '>',
  '${',
  '$',
  '{',
  '}',
  'change',
  'example',
  'fake',
  'pass',
  'placeholder',
  'password',
  'sample',
  'test',
  'todo',
  'user',
  'your',
  'xxx',
  'yyy',
]
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres', 'db'])
const LOCAL_PASSWORDS = new Set(['password', 'pass', 'postgres', 'local', 'test', 'p'])
const SAFE_SCALAR_VALUES = new Set(['', '0', '1', 'false', 'null', 'none', 'off', 'on', 'true'])
const DATABASE_URL_RE =
  /(?<scheme>postgresql|postgres|mysql|redis):\/\/(?<user>[^:@/\s'"`]+):(?<password>[^@/\s'"`]+)@(?<host>[^:/\s'"`]+)/gi
const CONFIG_FILE_RE =
  /(^|\/)(?:\.env(?:\..*)?|env(?:\..*)?|.*\.env(?:\..*)?|docker-compose(?:\..*)?|.*\.(?:ya?ml|toml|ini|cfg|conf))$/i
const SENSITIVE_ASSIGNMENT_RE =
  /^\s*(?:-\s*)?(?<key>[A-Z0-9_.-]*(?:API_KEY|DATABASE_URL|DSN|PASSWORD|PRIVATE_KEY|REDIS_URL|SECRET|TOKEN)[A-Z0-9_.-]*)\s*[:=]\s*(?<value>.+?)\s*,?\s*(?:\s+#.*|\s+\/\/.*)?$/i
const TOKEN_PATTERNS = [
  ['private-key', /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/g],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['stripe-secret-key', /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/g],
  ['stripe-webhook-secret', /\bwhsec_[A-Za-z0-9]{16,}\b/g],
  ['openai-secret-key', /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{30,}\b/g],
  ['anthropic-secret-key', /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g],
  ['resend-api-key', /\bre_[A-Za-z0-9][A-Za-z0-9_-]{20,}\b/g],
  ['supabase-secret-key', /\bsb_secret_[A-Za-z0-9_-]{12,}\b/g],
  ['github-token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g],
]
const ALLOWLISTED_TOKENS = new Set()

function trackedFiles() {
  const result = spawnSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(result.stderr || 'git ls-files failed')
  }
  return result.stdout.split('\0').filter(Boolean)
}

function shouldScan(file) {
  const parts = file.split('/')
  const suffix = file.includes('.') ? `.${file.split('.').pop().toLowerCase()}` : ''
  return (
    !SKIP_SUFFIXES.has(suffix) &&
    !parts.some((part) => SKIP_PARTS.has(part) || SKIP_FILE_NAMES.has(part))
  )
}

function isConfigLikeFile(file) {
  return CONFIG_FILE_RE.test(file)
}

function cleanAssignmentValue(rawValue) {
  let value = rawValue.trim().replace(/,\s*$/, '')
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  } else {
    value = value.replace(/\s+#.*$/, '').replace(/\s+\/\/.*$/, '')
  }
  return value.trim()
}

function isPlaceholder(value) {
  const lowered = value.toLowerCase()
  return PLACEHOLDER_MARKERS.some((marker) => lowered.includes(marker))
}

function isSecretReference(value) {
  const normalized = value.trim().replace(/^\${{\s*/, '').replace(/\s*}}$/, '').toLowerCase()
  return (
    normalized.startsWith('secrets.') ||
    normalized.startsWith('vars.') ||
    normalized.startsWith('process.env.') ||
    normalized.startsWith('import.meta.env.')
  )
}

function isAllowedLocalUrl(value) {
  try {
    const url = new URL(value)
    return LOCAL_HOSTS.has(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

function isSafeAssignedValue(value) {
  const normalized = value.trim()
  const lowered = normalized.toLowerCase()
  return (
    SAFE_SCALAR_VALUES.has(lowered) ||
    /^\d+(?:\.\d+)?$/.test(normalized) ||
    isPlaceholder(normalized) ||
    isSecretReference(normalized) ||
    isAllowedLocalUrl(normalized)
  )
}

function isAllowedLocalDatabaseUrl(host, password) {
  const loweredPassword = password.toLowerCase()
  return (
    LOCAL_PASSWORDS.has(loweredPassword) ||
    (LOCAL_HOSTS.has(host.toLowerCase()) && LOCAL_PASSWORDS.has(loweredPassword))
  )
}

function redact(line) {
  return line
    .replace(SENSITIVE_ASSIGNMENT_RE, (_match, key) => `${key}=***`)
    .replace(DATABASE_URL_RE, (_match, scheme, user, _password, host) => `${scheme}://${user}:***@${host}`)
    .replace(/\bsk_(?:live|test)_[A-Za-z0-9]+\b/g, 'sk_***')
    .replace(/\bwhsec_[A-Za-z0-9]+\b/g, 'whsec_***')
    .replace(/\bsk-[A-Za-z0-9][A-Za-z0-9_-]{8,}\b/g, 'sk-***')
    .replace(/\bsk-ant-[A-Za-z0-9_-]{8,}\b/g, 'sk-ant-***')
    .replace(/\bre_[A-Za-z0-9][A-Za-z0-9_-]{8,}\b/g, 're_***')
    .replace(/\bsb_secret_[A-Za-z0-9_-]{8,}\b/g, 'sb_secret_***')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, 'AKIA***')
    .slice(0, 240)
}

function scanLine(file, lineNumber, line) {
  const findings = []
  if (isConfigLikeFile(file)) {
    const assignment = SENSITIVE_ASSIGNMENT_RE.exec(line)
    if (assignment?.groups) {
      const value = cleanAssignmentValue(assignment.groups.value)
      if (!isSafeAssignedValue(value)) {
        findings.push({ file, line: lineNumber, rule: 'concrete-sensitive-assignment', excerpt: redact(line.trim()) })
      }
    }
  }
  for (const match of line.matchAll(DATABASE_URL_RE)) {
    const { host, password } = match.groups
    if (!isPlaceholder(password) && !isAllowedLocalDatabaseUrl(host, password)) {
      findings.push({ file, line: lineNumber, rule: 'concrete-database-url', excerpt: redact(line.trim()) })
    }
  }
  for (const [rule, pattern] of TOKEN_PATTERNS) {
    for (const match of line.matchAll(pattern)) {
      const token = match[0]
      if (!ALLOWLISTED_TOKENS.has(token) && !isPlaceholder(token)) {
        findings.push({ file, line: lineNumber, rule, excerpt: redact(line.trim()) })
      }
    }
  }
  return findings
}

const findings = []
for (const file of trackedFiles()) {
  if (!shouldScan(file)) continue
  let source = ''
  try {
    source = fs.readFileSync(file, 'utf8')
  } catch {
    continue
  }
  source.split(/\r?\n/).forEach((line, index) => findings.push(...scanLine(file, index + 1, line)))
}

if (findings.length > 0) {
  console.error('Credential-looking values found in tracked files:')
  for (const finding of findings.slice(0, 80)) {
    console.error(`  - ${finding.file}:${finding.line} [${finding.rule}]`)
    console.error(`    ${finding.excerpt}`)
  }
  if (findings.length > 80) console.error(`  ... and ${findings.length - 80} more`)
  console.error('\nReplace real values with placeholders, rotate exposed credentials, and scrub history.')
  process.exit(1)
}

console.log('OK: no credential-looking values found in tracked files.')
