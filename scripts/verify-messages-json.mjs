#!/usr/bin/env node
/**
 * Validates every *.json file under apps/venus/messages/ (recursive).
 *
 * Goals:
 * - Fail fast before next build/webpack (trailing commas and similar otherwise surface as confusing byte offsets).
 * - Fail on a leading UTF-8 BOM — save locales as UTF-8 without BOM so Next/webpack and JSON.parse behave the same everywhere.
 * - Require a top-level JSON object (not array/string/null) — matching next-int message modules.
 *
 * Run: node scripts/verify-messages-json.mjs
 * Or: pnpm verify:messages
 *
 * When VERIFY_MESSAGES_QUIET=1 or true, suppresses the success line (used when i18n:check runs this first).
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const messagesDir = path.join(appRoot, 'messages')

/** Parent may set VERIFY_MESSAGES_QUIET=1 when chaining (e.g. i18n:check already prints a footer). */
const logOk =
  process.env.VERIFY_MESSAGES_QUIET !== '1' &&
  process.env.VERIFY_MESSAGES_QUIET !== 'true'

function relApp(p) {
  return path.relative(appRoot, p).split(path.sep).join('/')
}

function assertNoLeadingBom(text, display) {
  if (text.length > 0 && text.charCodeAt(0) === 0xfeff) {
    throw new Error(
      `${display}: UTF-8 BOM (U+FEFF) detected at start of file — re-save without BOM so Next/webpack and JSON loaders stay consistent.`,
    )
  }
}

/**
 * @returns {string[]}
 */
function listJsonLeafFiles(absDir, acc = []) {
  if (!fs.existsSync(absDir)) {
    throw new Error(`Directory not found: ${relApp(absDir)}`)
  }
  for (const ent of fs.readdirSync(absDir, { withFileTypes: true })) {
    const p = path.join(absDir, ent.name)
    if (ent.isDirectory()) {
      listJsonLeafFiles(p, acc)
    } else if (ent.isFile() && ent.name.endsWith('.json')) {
      acc.push(p)
    }
  }
  return acc
}

/**
 * Extra context from engines that expose `position` (not always present for JSON failures).
 *
 * @param {SyntaxError} err
 */
function jsonLocationHint(text, err) {
  const explicit =
    typeof err.position === 'number' &&
    Number.isFinite(err.position) &&
    err.position >= 0 &&
    err.position <= text.length

  if (!explicit && typeof text === 'string') {
    const m = /at position (\d+)/.exec(err.message)?.[1]
    const n = m !== undefined ? Number(m) : NaN
    if (Number.isFinite(n) && n >= 0 && n <= text.length) {
      return formatPointer(text, n)
    }
  }

  return explicit ? formatPointer(text, err.position) : ''
}

/** @returns {number} 1-based line */
function byteIndexToLineNumber(text, index) {
  let line = 1
  let i = 0
  while (i < index && i < text.length) {
    if (text.charCodeAt(i) === 0x0a) line++
    i++
  }
  return line
}

function formatPointer(text, index) {
  const line = byteIndexToLineNumber(text, index)
  return `near line ${line} (approx. byte offset ${index})`
}

/** @param {string} absPath absolute file path */
function verifyOneJsonFile(absPath) {
  const display = relApp(absPath)

  /** @type {string} */
  let text

  try {
    const raw = fs.readFileSync(absPath)
    text = raw.toString('utf8')
  } catch {
    throw new Error(`${display}: could not read file`)
  }

  assertNoLeadingBom(text, display)

  if (/^\s*$/.test(text)) {
    throw new Error(`${display}: file is empty or whitespace only`)
  }

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    if (err instanceof SyntaxError) {
      const hint = jsonLocationHint(text, err)
      throw new SyntaxError(`${display}: ${err.message}${hint ? ` — ${hint}` : ''}`)
    }
    throw err
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${display}: locale root must be a JSON object (got ${parsed === null ? 'null' : Array.isArray(parsed) ? 'array' : typeof parsed})`)
  }
}

/** @returns {never} */
function fail(msg) {
  console.error('[verify-messages-json]', msg)
  process.exit(1)
}

let files = []
try {
  files = listJsonLeafFiles(messagesDir)
} catch (err) {
  fail(err instanceof Error ? err.message : String(err))
}

files.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }))

if (files.length === 0) {
  fail(`No .json files found under ${relApp(messagesDir)}/`)
}

for (const f of files) {
  try {
    verifyOneJsonFile(f)
  } catch (err) {
    console.error('[verify-messages-json] Invalid locale JSON')
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}

if (logOk) {
  console.log(
    `[verify-messages-json] OK — ${files.length} file${files.length === 1 ? '' : 's'} validated under messages/`,
  )
}
