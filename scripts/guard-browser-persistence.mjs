#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const scanRoots = ['app', 'src']
const codeExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'])
const skipDirs = new Set([
  '.git',
  '.next',
  '.next-dev',
  '__tests__',
  '_archived',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
  'tests',
])

const approvedStorageWriters = {
  'src/components/AuthGate.tsx': {
    classification: 'navigation-throttle',
    retention: 'session',
    reason: 'Prevents redirect loops inside one browser tab.',
  },
  'src/components/calculator/hooks/useManualAccountingImportController.ts': {
    classification: 'oauth-flow-lock',
    retention: 'session',
    reason: 'Prevents duplicate accounting-provider OAuth launches.',
  },
  'src/config/features.ts': {
    classification: 'anonymous-feature-bucket',
    retention: 'local',
    reason: 'Keeps rollout bucket stable without user/company payloads.',
  },
  'src/features/manual/hooks/useManualNormalizationModalController.ts': {
    classification: 'ui-dismissal',
    retention: 'session',
    reason: 'Avoids reopening the same non-authoritative modal in one tab.',
  },
  'src/features/manual/hooks/useManualPanelResize.ts': {
    classification: 'ui-preference',
    retention: 'local',
    reason: 'Stores only a numeric panel-width preference.',
  },
  'src/features/startup-studio/components/PresetPicker.tsx': {
    classification: 'ui-selection',
    retention: 'session',
    reason: 'Restores the active startup preset chip during tab navigation.',
  },
  'src/features/startup-studio/components/StudioCoPilot.tsx': {
    classification: 'ui-dismissal',
    retention: 'session',
    reason: 'Stores only a one-tab co-pilot snooze marker.',
  },
  'src/hooks/useEmbeddedMode.ts': {
    classification: 'navigation-context',
    retention: 'session',
    reason: 'Preserves embedded-mode routing context in one browser tab.',
  },
  'src/hooks/usePanelResize.ts': {
    classification: 'ui-preference',
    retention: 'local',
    reason: 'Stores only a numeric panel-width preference.',
  },
  'src/hooks/useReportIdTracking.ts': {
    classification: 'navigation-context',
    retention: 'session',
    reason: 'Keeps report context stable across remounts in one tab.',
  },
  'src/lib/auth/initGuards.ts': {
    classification: 'auth-throttle',
    retention: 'session',
    reason: 'Prevents auth initialization reload loops without storing tokens.',
  },
  'src/lib/auth/initializeAuth.ts': {
    classification: 'navigation-context',
    retention: 'session',
    reason: 'Carries return URL/source through auth bootstrap in one tab.',
  },
  'src/services/analytics.ts': {
    classification: 'anonymous-analytics-buffer',
    retention: 'local',
    reason: 'Legacy client-only analytics buffer; no credentials or raw report payloads.',
  },
  'src/services/businessTypeSuggestionApi.ts': {
    classification: 'support-fallback-buffer',
    retention: 'local-bounded',
    reason: 'Bounded local fallback for failed business-type suggestions.',
  },
  'src/services/cache/businessTypesCache.ts': {
    classification: 'reference-data-cache',
    retention: 'ttl',
    reason: 'Caches public business-type reference data with TTL.',
  },
  'src/store/manual/useStartupValuationStore.ts': {
    classification: 'workflow-draft',
    retention: 'local',
    reason: 'Zustand startup valuation draft; must remain free of auth secrets.',
  },
  'src/store/useUnifiedSessionStore.ts': {
    classification: 'workflow-session-cache',
    retention: 'local',
    reason: 'Legacy Zustand session cache pending server-first split.',
  },
  'src/store/useVersionHistoryStore.ts': {
    classification: 'workflow-version-cache',
    retention: 'local',
    reason: 'Client-side version cache while backend sync remains authoritative.',
  },
  'src/stores/clientContext.ts': {
    classification: 'cross-app-client-context',
    retention: 'ttl-24h',
    reason: 'Advisor/client relationship context; validated and expires after 24 hours.',
  },
  'src/utils/auth/cross-tab-refresh.ts': {
    classification: 'auth-throttle',
    retention: 'local-timestamp',
    reason: 'Stores last refresh timestamp only; no auth token material.',
  },
  'src/utils/auth/offlineAuth.ts': {
    classification: 'offline-auth-cache',
    retention: 'ttl-24h',
    reason: 'Caches non-token auth state for offline UI; expires after 24 hours.',
  },
  'src/utils/auth/sessionSync.ts': {
    classification: 'cross-tab-signal',
    retention: 'ephemeral',
    reason: 'Uses localStorage events as a broadcast bus, then removes the payload.',
  },
  'src/utils/browserCompat.ts': {
    classification: 'storage-capability-probe',
    retention: 'ephemeral',
    reason: 'Writes and removes a probe key to detect storage support.',
  },
  'src/utils/browserRecoveryStorage.ts': {
    classification: 'workflow-recovery-helper',
    retention: 'ttl-24h',
    reason: 'Central TTL envelope for browser workflow recovery buffers.',
  },
  'src/utils/capitalHistoryPrefill.ts': {
    classification: 'workflow-handoff',
    retention: 'session-one-shot',
    reason: 'One-shot in-tab handoff for non-credential capital-history fields.',
  },
  'src/utils/debugLogger.ts': {
    classification: 'developer-toggle',
    retention: 'local',
    reason: 'Local debug flag only.',
  },
  'src/utils/landingStudioHandoff.ts': {
    classification: 'workflow-handoff',
    retention: 'ttl-24h',
    reason: 'Cross-origin signup handoff with explicit TTL and no credentials.',
  },
  'src/utils/reportExistenceCache.ts': {
    classification: 'report-existence-cache',
    retention: 'session-ttl-30m',
    reason: 'Caches report existence booleans only.',
  },
  'src/utils/sessionCacheManager.ts': {
    classification: 'workflow-session-cache',
    retention: 'ttl-24h',
    reason: 'Caches stripped session payload with expiry for recovery/resilience.',
  },
}

const directStorageWritePattern =
  /\b(?:window\.)?(?:localStorage|sessionStorage)\.setItem\s*\(/g
const storageObjectWritePattern = /\bstorage\.setItem\s*\(/g
const sensitiveLiteralKeyPattern =
  /\b(?:window\.)?(?:localStorage|sessionStorage)\.setItem\s*\(\s*['"`][^'"`]*(?:access|credential|password|refresh|secret|token)[^'"`]*['"`]/gi

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue
      files.push(...walk(fullPath))
      continue
    }
    if (!entry.isFile()) continue
    if (!codeExtensions.has(path.extname(entry.name))) continue
    if (entry.name.includes('.test.') || entry.name.includes('.spec.')) continue
    files.push(fullPath)
  }

  return files
}

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, '/')
}

function lineInfo(source, index) {
  const prefix = source.slice(0, index)
  const line = prefix.split('\n').length
  const lineStart = source.lastIndexOf('\n', index - 1) + 1
  const rawLineEnd = source.indexOf('\n', index)
  const lineEnd = rawLineEnd === -1 ? source.length : rawLineEnd
  return { line, excerpt: source.slice(lineStart, lineEnd).trim().slice(0, 220) }
}

function countMatches(pattern, source) {
  pattern.lastIndex = 0
  let count = 0
  while (pattern.exec(source)) count += 1
  return count
}

function hasZustandPersist(source) {
  return source.includes('zustand/middleware') && /\bpersist\s*\(/.test(source)
}

function scanFile(file) {
  const source = fs.readFileSync(file, 'utf8')
  const rel = relative(file)
  const findings = []
  const writes =
    countMatches(directStorageWritePattern, source) +
    (rel === 'src/utils/browserRecoveryStorage.ts'
      ? countMatches(storageObjectWritePattern, source)
      : 0) +
    (hasZustandPersist(source) ? 1 : 0)

  if (writes > 0 && !approvedStorageWriters[rel]) {
    findings.push({
      file: rel,
      line: 1,
      rule: 'unapproved-browser-persistence-writer',
      excerpt: `${writes} browser persistence write surface(s) found`,
    })
  }

  sensitiveLiteralKeyPattern.lastIndex = 0
  let match = sensitiveLiteralKeyPattern.exec(source)
  while (match) {
    const { line, excerpt } = lineInfo(source, match.index)
    findings.push({
      file: rel,
      line,
      rule: 'sensitive-storage-key-literal',
      excerpt,
    })
    if (match.index === sensitiveLiteralKeyPattern.lastIndex) {
      sensitiveLiteralKeyPattern.lastIndex += 1
    }
    match = sensitiveLiteralKeyPattern.exec(source)
  }

  return findings
}

const files = scanRoots.flatMap((scanRoot) => walk(path.join(root, scanRoot)))
const findings = files.flatMap(scanFile).sort((left, right) => {
  const byFile = left.file.localeCompare(right.file)
  if (byFile !== 0) return byFile
  return left.line - right.line
})

const missingApprovedFiles = Object.keys(approvedStorageWriters).filter(
  (file) => !fs.existsSync(path.join(root, file))
)

if (missingApprovedFiles.length > 0) {
  console.error('[browser-persistence] Approved writer paths no longer exist.')
  for (const file of missingApprovedFiles) {
    console.error(`- ${file}`)
  }
  process.exit(1)
}

if (findings.length > 0) {
  console.error('[browser-persistence] Browser persistence policy violations found.')
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.rule}`)
    console.error(`  ${finding.excerpt}`)
  }
  process.exit(1)
}

console.log(
  `[browser-persistence] OK. ${Object.keys(approvedStorageWriters).length} approved writer file(s); no unreviewed browser persistence writes.`
)
