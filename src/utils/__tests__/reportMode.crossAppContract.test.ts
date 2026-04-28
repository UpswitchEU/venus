/**
 * Locks Mercury redirect URL semantics to Venus advisor-mode parsing.
 *
 * Calculator / modal surfaces use string literals `'accountant'`. Embedded iframe passes
 * `mode` as `accountant` | `seller` from runtime props (`VenusEmbeddedModal`).
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MERCURY_ADVISOR_URL_MODE } from '../reportMode'

const __dirname = dirname(fileURLToPath(import.meta.url))
const mercuryRootFromVenusTests = '../../../../../apps/mercury'

/** Mercury files that **only** emit `searchParams.set('mode', '<string literal>')` for Venus. */
const MERCURY_LITERAL_MODE_SOURCES = [
  'app/[locale]/(fullscreen)/calculator/CalculatorRedirectClient.tsx',
  'features/accountants/valuations/components/VersionTimeline.tsx',
  'components/modals/ValuationModal.tsx',
  'features/import-review/ImportReviewContent.tsx',
]

const MODE_LITERAL_REGEX = /searchParams\.set\(\s*['"]mode['"]\s*,\s*['"]([^'"]+)['"]\s*\)/g

function collectModeLiterals(source: string): string[] {
  return [...source.matchAll(MODE_LITERAL_REGEX)].map((m) => m[1])
}

describe('reportMode Mercury → Venus advisor URL contract', () => {
  it('literal-only Mercury surfaces only emit Venus MERCURY_ADVISOR_URL_MODE', () => {
    const allLiterals: string[] = []
    for (const rel of MERCURY_LITERAL_MODE_SOURCES) {
      const path = join(__dirname, mercuryRootFromVenusTests, rel)
      const source = readFileSync(path, 'utf8')
      allLiterals.push(...collectModeLiterals(source))
    }

    expect(allLiterals.length).toBeGreaterThan(0)
    const distinct = [...new Set(allLiterals)]
    expect(distinct).toContain(MERCURY_ADVISOR_URL_MODE)
    expect(distinct.every((v) => v === MERCURY_ADVISOR_URL_MODE)).toBe(true)
  })

  it('VenusEmbeddedModal still sets mode from accountant|seller prop (iframe contract)', () => {
    const path = join(
      __dirname,
      mercuryRootFromVenusTests,
      'shared/components/modals/VenusEmbeddedModal.tsx'
    )
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/searchParams\.set\(\s*['"]mode['"]\s*,\s*mode\s*\)/)
    expect(source).toMatch(/'accountant'\s*\|\s*'seller'/)
    expect(collectModeLiterals(source)).toHaveLength(0)
  })
})
