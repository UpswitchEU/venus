/**
 * Cross-app contract-lock for the Venus ↔ Titan plan/method matrix.
 *
 * Why this exists
 * ----------------
 * Venus carries two **fallback** lookup tables that mirror Titan's
 * `PRICING_CONFIG[*].features.allowed_methods`:
 *
 *   1. `FREE_ACCOUNTANT_ALLOWED_METHOD_KEYS` — used when Titan's
 *      `/api/v2/credits/plan` response omits `allowed_methods` (defensive
 *      fallback). If this list drifts from Titan, a Free advisor sees the
 *      wrong "locked" badges (or worse, an unlocked method that 402s
 *      server-side after they fill out the whole form).
 *   2. `resolveAllowedMethodKeys(undefined, planType)` — assumes every paid
 *      tier (`starter`, `pro`, `expert`, `enterprise`, `premium`) returns
 *      `null` from Titan ("all methods allowed"). If Titan starts returning
 *      a restricted list for any of these tiers, Venus would silently keep
 *      every method unlocked in the UI until the next deploy lands.
 *
 * Both apps are deployed independently, so a single PR can ship a Titan
 * config change without Venus catching up. This test reads Titan's source
 * file directly and asserts the contract — a Titan change that breaks
 * Venus's assumptions fails CI before either app ships.
 *
 * Symmetrical Titan-side guard: none yet. Titan's `PRICING_CONFIG` is the
 * authoritative source — Venus is the consumer that must follow.
 *
 * If you intentionally change Titan's free-tier `allowed_methods` (or any
 * paid tier's `allowed_methods` away from `null`), you MUST update
 * `apps/venus/src/constants/accountantPlanMethods.ts` in the same change
 * set, then redeploy Titan + Venus together to avoid a drift window where
 * the UI and server enforcement disagree on what a user can run.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  FREE_ACCOUNTANT_ALLOWED_METHOD_KEYS,
  resolveAllowedMethodKeys,
} from '../accountantPlanMethods'

// Resolve relative to this test file so the contract works regardless of the
// working directory the test runner was launched from (CI / local / IDE).
// `__dirname` is not available under ESM-mode Vitest; reconstruct from
// `import.meta.url` for portability — `new URL('.', import.meta.url).pathname`
// alone collapses to "/" on some Node/Vitest combos, so go through
// `fileURLToPath` which always returns an absolute filesystem path.
const __dirname = dirname(fileURLToPath(import.meta.url))
const TITAN_PRICING_CONFIG_PATH = join(
  __dirname,
  '../../../../../apps/titan-api/src/billing/config/pricing.config.ts'
)

/**
 * Extract `allowed_methods: [...]` or `allowed_methods: null` from a single
 * `[PlanType.X]` block in Titan's pricing config.
 *
 * Why a regex and not a real import: Venus's tsconfig has no path mapping
 * to `apps/titan-api/`, and adding one would pull in NestJS decorators /
 * Prisma types that vitest cannot resolve in this isolated package. Reading
 * the source as text + parsing with a tiny regex keeps the contract test
 * dependency-free while still failing CI on real drift.
 */
function extractAllowedMethodsFromTitan(source: string, planLiteral: string): string[] | null {
  // Match the [PlanType.<TIER>]: { ... allowed_methods: <value>, ... } block
  // Capture allowed_methods value (either an array literal or `null`).
  const blockPattern = new RegExp(
    `\\[PlanType\\.${planLiteral}\\]:\\s*\\{[\\s\\S]*?allowed_methods:\\s*(\\[[\\s\\S]*?\\]|null)`,
    'm'
  )
  const match = source.match(blockPattern)
  if (!match) {
    throw new Error(
      `Could not find PlanType.${planLiteral} block with allowed_methods in Titan pricing config`
    )
  }
  const value = match[1].trim()
  if (value === 'null') return null

  // Parse the array literal: extract single-quoted method keys.
  const methods = Array.from(value.matchAll(/'([a-z_0-9]+)'/g)).map((m) => m[1])
  if (methods.length === 0) {
    throw new Error(
      `PlanType.${planLiteral}.allowed_methods array is empty or unparseable: ${value}`
    )
  }
  return methods
}

describe('accountantPlanMethods cross-app contract (Venus ↔ Titan)', () => {
  const titanSource = readFileSync(TITAN_PRICING_CONFIG_PATH, 'utf-8')

  it('Free tier `allowed_methods` matches Venus FREE_ACCOUNTANT_ALLOWED_METHOD_KEYS exactly', () => {
    // Order matters here because Venus's UI sorts methods in declaration
    // order in some surfaces (upsell teasers). Use `toEqual` to lock both
    // membership AND order — anything else is silent UX drift.
    const titanFreeMethods = extractAllowedMethodsFromTitan(titanSource, 'FREE')
    expect(titanFreeMethods).toEqual([...FREE_ACCOUNTANT_ALLOWED_METHOD_KEYS])
  })

  it.each([
    'STARTER',
    'PRO',
    'EXPERT',
    'ENTERPRISE',
    'PREMIUM',
  ])('Paid tier %s has `allowed_methods: null` (= all methods unlocked)', (planLiteral) => {
    // Venus's `resolveAllowedMethodKeys(undefined, <paidPlan>)` assumes
    // every paid tier returns `null` from Titan. If Titan starts shipping
    // a restricted array for any of these, the assumption breaks — fix
    // BOTH the Titan config and `resolveAllowedMethodKeys` in the same PR.
    const titanMethods = extractAllowedMethodsFromTitan(titanSource, planLiteral)
    expect(titanMethods).toBeNull()
  })

  it.each([
    ['starter', null],
    ['pro', null],
    ['expert', null],
    ['enterprise', null],
    ['premium', null],
  ] as const)("Venus `resolveAllowedMethodKeys(undefined, '%s')` returns %s (matches Titan paid-tier contract)", (planType, expected) => {
    // Closes the loop: not only does Titan return `null` for these
    // tiers, Venus's fallback (when the API field is absent) also
    // collapses to `null`. Without this, a degraded `/credits/plan`
    // response would lock paid users out of paid methods in the UI.
    expect(resolveAllowedMethodKeys(undefined, planType)).toEqual(expected)
  })

  it('Venus FREE list contains exactly the founder triad + advisor extras (snapshot)', () => {
    // Pin the EXACT 6 keys so that:
    //   - The 3 founder methods (upswitch_adaptive, arr_multiple,
    //     startup_valuation) stay free for owners self-serving in Venus.
    //   - The 3 advisor extras (dcf, ebitda_multiple, adjusted_nav) stay
    //     free for accountants on the Free PLG tier.
    // Any silent reshuffle (e.g. dropping `dcf` from Free) will fail here
    // BEFORE customers see the wrong nav.
    expect([...FREE_ACCOUNTANT_ALLOWED_METHOD_KEYS]).toEqual([
      'upswitch_adaptive',
      'dcf',
      'ebitda_multiple',
      'adjusted_nav',
      'arr_multiple',
      'startup_valuation',
    ])
  })
})
