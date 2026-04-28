/**
 * Locks Mercury redirect URL semantics to Venus advisor-mode parsing.
 *
 * Mercury sets `mode=accountant` on Venus report URLs so `auth.ts` can run
 * `get-client-context` when paired with `clientId`. Venus must use the exact
 * same literal (`MERCURY_ADVISOR_URL_MODE`); drifting breaks cold loads and
 * `useUrlState` preservation logic.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MERCURY_ADVISOR_URL_MODE } from '../reportMode'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MERCURY_CALCULATOR_REDIRECT_PATH = join(
  __dirname,
  '../../../../../apps/mercury/app/[locale]/(fullscreen)/calculator/CalculatorRedirectClient.tsx'
)

describe('reportMode Mercury → Venus advisor URL contract', () => {
  it('Mercury CalculatorRedirectClient still emits mode equal to Venus MERCURY_ADVISOR_URL_MODE', () => {
    const source = readFileSync(MERCURY_CALCULATOR_REDIRECT_PATH, 'utf8')
    const mercuryModeLiterals = [
      ...source.matchAll(/searchParams\.set\(\s*['"]mode['"]\s*,\s*['"]([^'"]+)['"]\s*\)/g),
    ].map((m) => m[1])

    expect(mercuryModeLiterals.length).toBeGreaterThan(0)
    const distinct = [...new Set(mercuryModeLiterals)]
    expect(distinct).toContain(MERCURY_ADVISOR_URL_MODE)
    expect(distinct.every((v) => v === MERCURY_ADVISOR_URL_MODE)).toBe(true)
  })
})
