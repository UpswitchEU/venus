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

const policyDefaults = {
  owner: 'frontend-platform',
  reviewBy: '2026-09-30',
  sensitivePayload: 'forbidden',
}

function reviewed(policy) {
  return {
    ...policyDefaults,
    ...policy,
  }
}

const approvedStorageWriters = {
  'src/components/AuthGate.tsx': reviewed({
    classification: 'navigation-throttle',
    retention: 'session',
    allowedKeys: ['upswitch_venus_redirect_count'],
    reason: 'Prevents redirect loops inside one browser tab.',
  }),
  'src/components/calculator/hooks/useManualAccountingImportController.ts': reviewed({
    classification: 'oauth-flow-lock',
    retention: 'session',
    allowedKeyPrefixes: ['silverfin_oauth_'],
    allowedExpressions: ['oauthLockKey'],
    reason: 'Prevents duplicate accounting-provider OAuth launches.',
  }),
  'src/components/calculator/useResizableAiDockWidth.ts': reviewed({
    classification: 'ui-preference',
    retention: 'local',
    allowedKeys: ['upswitch:venus-ai-dock-width'],
    allowedExpressions: ['VENUS_AI_DOCK_STORAGE_KEY'],
    ttlExemption: 'Numeric dock-width preference only.',
    reason: 'Stores only the resizable AI dock width in pixels.',
  }),
  'src/config/features.ts': reviewed({
    classification: 'anonymous-feature-bucket',
    retention: 'local',
    allowedKeys: ['upswitch.studio.bucket'],
    ttlExemption: 'Anonymous rollout bucket; no user, company, or financial payload.',
    reason: 'Keeps rollout bucket stable without user/company payloads.',
  }),
  'src/features/manual/hooks/useManualNormalizationModalController.ts': reviewed({
    classification: 'ui-dismissal',
    retention: 'session',
    allowedKeyPrefixes: ['venus:guided-norm-handled:'],
    allowedExpressions: ['storageKey'],
    reason: 'Avoids reopening the same non-authoritative modal in one tab.',
  }),
  'src/features/manual/hooks/useManualPanelResize.ts': reviewed({
    classification: 'ui-preference',
    retention: 'local',
    allowedKeys: ['upswitch-panel-width'],
    ttlExemption: 'Numeric UI width preference only.',
    reason: 'Stores only a numeric panel-width preference.',
  }),
  'src/features/startup-studio/components/PresetPicker.tsx': reviewed({
    classification: 'ui-selection',
    retention: 'session',
    allowedKeys: ['upswitch.studio.applied_preset'],
    reason: 'Restores the active startup preset chip during tab navigation.',
  }),
  'src/features/startup-studio/components/StudioCoPilot.tsx': reviewed({
    classification: 'ui-dismissal',
    retention: 'session',
    allowedKeyPrefixes: ['upswitch.studio.copilot.peeksnooze.'],
    reason: 'Stores only a one-tab co-pilot snooze marker.',
  }),
  'src/hooks/useEmbeddedMode.ts': reviewed({
    classification: 'navigation-context',
    retention: 'session',
    allowedKeys: ['upswitch_venus_embedded'],
    reason: 'Preserves embedded-mode routing context in one browser tab.',
  }),
  'src/hooks/usePanelResize.ts': reviewed({
    classification: 'ui-preference',
    retention: 'local',
    allowedKeys: ['upswitch-panel-width'],
    ttlExemption: 'Numeric UI width preference only.',
    reason: 'Stores only a numeric panel-width preference.',
  }),
  'src/hooks/useReportIdTracking.ts': reviewed({
    classification: 'navigation-context',
    retention: 'session',
    allowedKeys: ['conversational_last_reportId'],
    reason: 'Keeps report context stable across remounts in one tab.',
  }),
  'src/lib/auth/initGuards.ts': reviewed({
    classification: 'auth-throttle',
    retention: 'session',
    allowedKeys: ['venus_init_ok_at', 'venus_reload_count', 'venus_reload_window_start'],
    reason: 'Prevents auth initialization reload loops without storing tokens.',
  }),
  'src/lib/auth/initializeAuth.ts': reviewed({
    classification: 'navigation-context',
    retention: 'session',
    allowedKeys: ['upswitch_return_url', 'upswitch_source'],
    reason: 'Carries return URL/source through auth bootstrap in one tab.',
  }),
  'src/services/analytics.ts': reviewed({
    classification: 'anonymous-analytics-buffer',
    retention: 'local',
    allowedKeys: ['upswitch-analytics'],
    ttlExemption: 'Opt-in anonymous analytics event queue; no raw valuation/company payload.',
    reason: 'Legacy client-only analytics buffer; no credentials or raw report payloads.',
  }),
  'src/services/businessTypeSuggestionApi.ts': reviewed({
    classification: 'support-fallback-buffer',
    retention: 'local-bounded',
    allowedKeys: ['business_type_suggestions'],
    ttlExemption: 'Bounded support fallback list, flushed opportunistically by service code.',
    reason: 'Bounded local fallback for failed business-type suggestions.',
  }),
  'src/services/cache/businessTypesCache.ts': reviewed({
    classification: 'reference-data-cache',
    retention: 'ttl',
    allowedKeys: [
      'upswitch_valuation_tester_business_types_cache',
      'upswitch_valuation_tester_categories_cache',
      'upswitch_valuation_tester_popular_types_cache',
      'upswitch_valuation_tester_cache_stats',
    ],
    allowedExpressions: ['key', 'CACHE_CONFIG.KEYS.STATS'],
    maxRetentionHours: 24,
    reason: 'Caches public business-type reference data with TTL.',
  }),
  'src/store/manual/useStartupValuationStore.ts': reviewed({
    classification: 'workflow-draft',
    retention: 'local',
    allowedKeys: ['venus.startup_valuation.v1'],
    allowedExpressions: ['STARTUP_VALUATION_PERSIST_NAME'],
    migrationTarget: 'Move to server-backed draft persistence or a TTL recovery envelope.',
    reason: 'Zustand startup valuation draft; must remain free of auth secrets.',
  }),
  'src/store/useUnifiedSessionStore.ts': reviewed({
    classification: 'workflow-session-cache',
    retention: 'local',
    allowedKeys: ['unified-session-storage'],
    migrationTarget: 'Move remaining workflow cache to server-first session hydration.',
    reason: 'Legacy Zustand session cache pending server-first split.',
  }),
  'src/store/useVersionHistoryStore.ts': reviewed({
    classification: 'workflow-version-cache',
    retention: 'local',
    allowedKeys: ['version-history-storage'],
    allowedExpressions: ['name'],
    migrationTarget: 'Move version metadata to authoritative backend history storage.',
    reason: 'Client-side version cache while backend sync remains authoritative.',
  }),
  'src/stores/clientContext.ts': reviewed({
    classification: 'cross-app-client-context',
    retention: 'ttl-24h',
    allowedKeys: ['client-context'],
    maxRetentionHours: 24,
    reason: 'Advisor/client relationship context; validated and expires after 24 hours.',
  }),
  'src/utils/auth/cross-tab-refresh.ts': reviewed({
    classification: 'auth-throttle',
    retention: 'local-timestamp',
    allowedKeys: ['upswitch:auth:last-refresh-at'],
    maxRetentionHours: 1,
    reason: 'Stores last refresh timestamp only; no auth token material.',
  }),
  'src/utils/auth/offlineAuth.ts': reviewed({
    classification: 'offline-auth-cache',
    retention: 'ttl-24h',
    allowedKeys: ['upswitch_auth_cache'],
    maxRetentionHours: 24,
    reason: 'Caches non-token auth state for offline UI; expires after 24 hours.',
  }),
  'src/utils/auth/sessionSync.ts': reviewed({
    classification: 'cross-tab-signal',
    retention: 'ephemeral',
    allowedKeys: ['upswitch_session_sync'],
    reason: 'Uses localStorage events as a broadcast bus, then removes the payload.',
  }),
  'src/utils/browserCompat.ts': reviewed({
    classification: 'storage-capability-probe',
    retention: 'ephemeral',
    allowedKeys: ['__localStorage_test__', '__sessionStorage_test__'],
    allowedExpressions: ['test'],
    reason: 'Writes and removes a probe key to detect storage support.',
  }),
  'src/utils/browserRecoveryStorage.ts': reviewed({
    classification: 'workflow-recovery-helper',
    retention: 'ttl-24h',
    allowedExpressions: ['key'],
    allowedKeyPrefixes: ['_norm_pending_', '_taxlat_pending_'],
    allowedKeys: ['venus_pending_syncs'],
    maxRetentionHours: 24,
    reason: 'Central TTL envelope for browser workflow recovery buffers.',
  }),
  'src/utils/capitalHistoryPrefill.ts': reviewed({
    classification: 'workflow-handoff',
    retention: 'session-one-shot',
    allowedKeys: ['venus_studio_to_saas_capital_prefill'],
    reason: 'One-shot in-tab handoff for non-credential capital-history fields.',
  }),
  'src/utils/debugLogger.ts': reviewed({
    classification: 'developer-toggle',
    retention: 'local',
    allowedKeys: ['DEBUG_CONVERSATION'],
    ttlExemption: 'Developer-only boolean toggle.',
    reason: 'Local debug flag only.',
  }),
  'src/utils/landingStudioHandoff.ts': reviewed({
    classification: 'workflow-handoff',
    retention: 'ttl-24h',
    allowedKeys: ['venus_landing_studio_handoff'],
    maxRetentionHours: 24,
    reason: 'Cross-origin signup handoff with explicit TTL and no credentials.',
  }),
  'src/utils/newValuationPrefillStorage.ts': reviewed({
    classification: 'workflow-handoff',
    retention: 'session-one-shot',
    allowedKeys: ['venus_new_valuation_prefill'],
    reason:
      'One-shot identity-fingerprinted prefill; strips identity/report HTML and consumes on read.',
  }),
  'src/utils/reportExistenceCache.ts': reviewed({
    classification: 'report-existence-cache',
    retention: 'session-ttl-30m',
    allowedKeyPrefixes: ['report_exists_'],
    allowedExpressions: ['getCacheKey(reportId)', 'getCacheKey(reportId'],
    maxRetentionHours: 0.5,
    reason: 'Caches report existence booleans only.',
  }),
  'src/utils/sessionCacheManager.ts': reviewed({
    classification: 'workflow-session-metadata-cache',
    retention: 'ttl-24h',
    allowedKeyPrefixes: ['upswitch_session_cache_'],
    allowedExpressions: ['key'],
    maxRetentionHours: 24,
    requiredSourceIncludes: [
      "const SESSION_CACHE_PAYLOAD_CLASSIFICATION = 'session-metadata-only'",
      'partialData: {}',
      'sessionData: {}',
    ],
    forbiddenSourceIncludes: [
      'name: session.name',
      'valuationResult: session.valuationResult',
      'buyerReadiness: session.buyerReadiness',
      'htmlReport: session.htmlReport',
    ],
    reason: 'Caches metadata only; raw workflow/session payload must be fetched from Titan.',
  }),
}

const approvedRecoveryCallers = {
  'src/services/reports/ReportService.ts': reviewed({
    classification: 'workflow-recovery-buffer',
    retention: 'ttl-24h',
    allowedKeys: ['venus_pending_syncs'],
    maxRetentionHours: 24,
    reason: 'Queues bounded backend-sync retries through the central TTL envelope.',
  }),
  'src/store/useNormalizationStore.ts': reviewed({
    classification: 'workflow-recovery-buffer',
    retention: 'ttl-24h',
    allowedKeyPrefixes: ['_norm_pending_'],
    maxRetentionHours: 24,
    reason: 'Buffers accepted normalization writes through the central TTL envelope.',
  }),
  'src/store/useTaxLatencyStore.ts': reviewed({
    classification: 'workflow-recovery-buffer',
    retention: 'ttl-24h',
    allowedKeyPrefixes: ['_taxlat_pending_'],
    maxRetentionHours: 24,
    reason: 'Buffers tax-latency writes through the central TTL envelope.',
  }),
}

const approvedThirdPartyPersistence = {
  'src/lib/posthog-init.ts': reviewed({
    classification: 'third-party-analytics-persistence',
    retention: 'local',
    allowedExpressions: ["persistence: 'localStorage+cookie'"],
    ttlExemption: 'PostHog is opt-out by default; event params are scrubbed before capture.',
    reason: 'PostHog client storage is limited to consented analytics state.',
  }),
}

const directStorageWritePattern =
  /\b(?:window\.)?(?:localStorage|sessionStorage)\.setItem\s*\(/g
const storageObjectWritePattern = /\bstorage\.setItem\s*\(/g
const setItemFirstArgPattern =
  /\b(?:window\.)?(?:localStorage|sessionStorage|storage)\.setItem\s*\(\s*([^,\n)]+)/g
const zustandPersistNamePattern = /(?:^|\n)\s{4,}name\s*:\s*([^,\n}]+)/g
const recoveryWritePattern =
  /\b(?:writeBrowserRecoveryValue|appendBrowserRecoveryListItem)\s*\(\s*([^,\n)]+)/g
const thirdPartyPersistencePattern =
  /\bpersistence\s*:\s*['"`]localStorage(?:\+cookie)?['"`]/g
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

function normalizeExpression(expression) {
  return expression.trim().replace(/;$/, '').replace(/\s+/g, ' ')
}

function collectStringConstants(source) {
  const constants = new Map()
  const pattern =
    /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(?:['"`]([^'"`${}]*)['"`]|`([^`$]*)\$\{[^`]+`)/g
  let match = pattern.exec(source)

  while (match) {
    constants.set(match[1], match[2] ?? match[3] ?? '')
    if (match.index === pattern.lastIndex) pattern.lastIndex += 1
    match = pattern.exec(source)
  }

  return constants
}

function resolveKeyExpression(expression, constants) {
  const normalized = normalizeExpression(expression)

  const templateConstPrefix = normalized.match(/^`\$\{([A-Za-z_$][\w$]*)\}/)
  if (templateConstPrefix && constants.has(templateConstPrefix[1])) {
    return {
      kind: 'prefix',
      value: constants.get(templateConstPrefix[1]),
      expression: normalized,
    }
  }

  const templatePrefix = normalized.match(/^`([^`$]*)\$\{/)
  if (templatePrefix) {
    return {
      kind: 'prefix',
      value: templatePrefix[1],
      expression: normalized,
    }
  }

  const literal = normalized.match(/^['"`]([^'"`]+)['"`]$/)
  if (literal) {
    return {
      kind: 'literal',
      value: literal[1],
      expression: normalized,
    }
  }

  const constPlusValue = normalized.match(/^([A-Za-z_$][\w$]*)\s*\+/)
  if (constPlusValue && constants.has(constPlusValue[1])) {
    return {
      kind: 'prefix',
      value: constants.get(constPlusValue[1]),
      expression: normalized,
    }
  }

  if (constants.has(normalized)) {
    return {
      kind: 'literal',
      value: constants.get(normalized),
      expression: normalized,
    }
  }

  return {
    kind: 'expression',
    value: normalized,
    expression: normalized,
  }
}

function collectKeyUses(pattern, source, constants, rule) {
  pattern.lastIndex = 0
  const uses = []
  let match = pattern.exec(source)

  while (match) {
    const expression = match[1]
    uses.push({
      ...resolveKeyExpression(expression, constants),
      ...lineInfo(source, match.index),
      rule,
    })
    if (match.index === pattern.lastIndex) pattern.lastIndex += 1
    match = pattern.exec(source)
  }

  return uses
}

function collectThirdPartyPersistenceUses(source) {
  thirdPartyPersistencePattern.lastIndex = 0
  const uses = []
  let match = thirdPartyPersistencePattern.exec(source)

  while (match) {
    uses.push({
      kind: 'expression',
      value: normalizeExpression(match[0]),
      expression: normalizeExpression(match[0]),
      ...lineInfo(source, match.index),
      rule: 'third-party-browser-persistence',
    })
    if (match.index === thirdPartyPersistencePattern.lastIndex) {
      thirdPartyPersistencePattern.lastIndex += 1
    }
    match = thirdPartyPersistencePattern.exec(source)
  }

  return uses
}

function isAllowedByPolicy(policy, keyUse) {
  if (keyUse.kind === 'literal') {
    if ((policy.allowedKeys ?? []).includes(keyUse.value)) return true
    if ((policy.allowedKeyPrefixes ?? []).some((prefix) => keyUse.value.startsWith(prefix))) {
      return true
    }
  }

  if (keyUse.kind === 'prefix') {
    if ((policy.allowedKeyPrefixes ?? []).some((prefix) => keyUse.value.startsWith(prefix))) {
      return true
    }
  }

  return (policy.allowedExpressions ?? []).includes(keyUse.expression)
}

function keyUseDescription(keyUse) {
  if (keyUse.kind === 'literal') return `key "${keyUse.value}"`
  if (keyUse.kind === 'prefix') return `key prefix "${keyUse.value}"`
  return `expression "${keyUse.expression}"`
}

function hasAllowedSelector(policy) {
  return (
    (policy.allowedKeys?.length ?? 0) > 0 ||
    (policy.allowedKeyPrefixes?.length ?? 0) > 0 ||
    (policy.allowedExpressions?.length ?? 0) > 0
  )
}

function policyFindingsForGroup(groupName, policies) {
  const findings = []
  const requiredStringFields = [
    'classification',
    'retention',
    'reason',
    'owner',
    'reviewBy',
    'sensitivePayload',
  ]
  const today = new Date().toISOString().slice(0, 10)

  for (const [file, policy] of Object.entries(policies)) {
    for (const field of requiredStringFields) {
      if (typeof policy[field] !== 'string' || policy[field].trim().length === 0) {
        findings.push({
          file,
          line: 1,
          rule: 'incomplete-browser-persistence-policy',
          excerpt: `${groupName} policy is missing required field "${field}".`,
        })
      }
    }

    if (policy.sensitivePayload !== 'forbidden') {
      findings.push({
        file,
        line: 1,
        rule: 'sensitive-browser-payload-not-forbidden',
        excerpt: `${groupName} policy must set sensitivePayload to "forbidden".`,
      })
    }

    if (!hasAllowedSelector(policy)) {
      findings.push({
        file,
        line: 1,
        rule: 'missing-browser-persistence-key-scope',
        excerpt: `${groupName} policy must declare allowedKeys, allowedKeyPrefixes, or allowedExpressions.`,
      })
    }

    if (policy.reviewBy < today) {
      findings.push({
        file,
        line: 1,
        rule: 'expired-browser-persistence-review',
        excerpt: `${groupName} policy review date ${policy.reviewBy} has expired.`,
      })
    }

    const retentionNeedsControl =
      policy.retention.includes('local') ||
      policy.retention.includes('ttl') ||
      policy.retention.includes('workflow')
    if (
      retentionNeedsControl &&
      typeof policy.maxRetentionHours !== 'number' &&
      !policy.ttlExemption &&
      !policy.migrationTarget
    ) {
      findings.push({
        file,
        line: 1,
        rule: 'browser-persistence-retention-not-controlled',
        excerpt:
          `${groupName} policy uses ${policy.retention}; add maxRetentionHours, ttlExemption, or migrationTarget.`,
      })
    }
  }

  return findings
}

function scanFile(file) {
  const source = fs.readFileSync(file, 'utf8')
  const rel = relative(file)
  const findings = []
  const constants = collectStringConstants(source)
  const writes =
    countMatches(directStorageWritePattern, source) +
    countMatches(storageObjectWritePattern, source) +
    (hasZustandPersist(source) ? 1 : 0)
  const recoveryWrites =
    rel === 'src/utils/browserRecoveryStorage.ts' ? 0 : countMatches(recoveryWritePattern, source)
  const thirdPartyPersistence = countMatches(thirdPartyPersistencePattern, source)

  if (writes > 0 && !approvedStorageWriters[rel]) {
    findings.push({
      file: rel,
      line: 1,
      rule: 'unapproved-browser-persistence-writer',
      excerpt: `${writes} browser persistence write surface(s) found`,
    })
  }

  if (writes > 0 && approvedStorageWriters[rel]) {
    const policy = approvedStorageWriters[rel]
    const keyUses = [
      ...collectKeyUses(
        setItemFirstArgPattern,
        source,
        constants,
        'browser-persistence-key-not-policy-approved'
      ),
      ...(hasZustandPersist(source)
        ? collectKeyUses(
            zustandPersistNamePattern,
            source,
            constants,
            'browser-persistence-key-not-policy-approved'
          )
        : []),
    ]

    for (const keyUse of keyUses) {
      if (!isAllowedByPolicy(policy, keyUse)) {
        findings.push({
          file: rel,
          line: keyUse.line,
          rule: keyUse.rule,
          excerpt: `${keyUseDescription(keyUse)} is not declared in the approved policy.`,
        })
      }
    }

    for (const requiredSnippet of policy.requiredSourceIncludes ?? []) {
      if (!source.includes(requiredSnippet)) {
        findings.push({
          file: rel,
          line: 1,
          rule: 'browser-persistence-required-source-contract-missing',
          excerpt: `Approved persistence policy requires source to include: ${requiredSnippet}`,
        })
      }
    }

    for (const forbiddenSnippet of policy.forbiddenSourceIncludes ?? []) {
      if (source.includes(forbiddenSnippet)) {
        findings.push({
          file: rel,
          line: 1,
          rule: 'browser-persistence-forbidden-source-contract-present',
          excerpt: `Approved persistence policy forbids source containing: ${forbiddenSnippet}`,
        })
      }
    }
  }

  if (recoveryWrites > 0 && !approvedRecoveryCallers[rel]) {
    findings.push({
      file: rel,
      line: 1,
      rule: 'unapproved-browser-recovery-writer',
      excerpt: `${recoveryWrites} browser recovery write surface(s) found`,
    })
  }

  if (recoveryWrites > 0 && approvedRecoveryCallers[rel]) {
    const policy = approvedRecoveryCallers[rel]
    const keyUses = collectKeyUses(
      recoveryWritePattern,
      source,
      constants,
      'browser-recovery-key-not-policy-approved'
    )
    for (const keyUse of keyUses) {
      if (!isAllowedByPolicy(policy, keyUse)) {
        findings.push({
          file: rel,
          line: keyUse.line,
          rule: keyUse.rule,
          excerpt: `${keyUseDescription(keyUse)} is not declared in the approved recovery policy.`,
        })
      }
    }
  }

  if (thirdPartyPersistence > 0 && !approvedThirdPartyPersistence[rel]) {
    findings.push({
      file: rel,
      line: 1,
      rule: 'unapproved-third-party-browser-persistence',
      excerpt: `${thirdPartyPersistence} third-party browser persistence surface(s) found`,
    })
  }

  if (thirdPartyPersistence > 0 && approvedThirdPartyPersistence[rel]) {
    const policy = approvedThirdPartyPersistence[rel]
    for (const keyUse of collectThirdPartyPersistenceUses(source)) {
      if (!isAllowedByPolicy(policy, keyUse)) {
        findings.push({
          file: rel,
          line: keyUse.line,
          rule: 'third-party-browser-persistence-not-policy-approved',
          excerpt: `${keyUseDescription(keyUse)} is not declared in the approved policy.`,
        })
      }
    }
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
const policyFindings = [
  ...policyFindingsForGroup('direct writer', approvedStorageWriters),
  ...policyFindingsForGroup('recovery caller', approvedRecoveryCallers),
  ...policyFindingsForGroup('third-party persistence', approvedThirdPartyPersistence),
]
const findings = [...policyFindings, ...files.flatMap(scanFile)].sort((left, right) => {
  const byFile = left.file.localeCompare(right.file)
  if (byFile !== 0) return byFile
  return left.line - right.line
})

const approvedPolicyFiles = [
  ...Object.keys(approvedStorageWriters),
  ...Object.keys(approvedRecoveryCallers),
  ...Object.keys(approvedThirdPartyPersistence),
]
const missingApprovedFiles = approvedPolicyFiles.filter((file) => !fs.existsSync(path.join(root, file)))

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
  `[browser-persistence] OK. ${Object.keys(approvedStorageWriters).length} approved writer file(s), ${Object.keys(approvedRecoveryCallers).length} recovery caller(s), ${Object.keys(approvedThirdPartyPersistence).length} third-party persistence surface(s); no unreviewed browser persistence writes.`
)
