import {
  DISTINCT_VALUATION_METHOD_COUNT as CONTRACT_DISTINCT_VALUATION_METHOD_COUNT,
  VALUATION_PRIMARY_OMNI_METHOD_ORDER,
} from '@upswitch/types'
import { describe, expect, it } from 'vitest'
import {
  PRE_SELECTABLE_METHOD_SET,
  PRE_SELECTABLE_METHODS,
  STANDALONE_METHODS,
} from '../methodFieldConfig'
import {
  DISTINCT_VALUATION_METHOD_COUNT,
  PRIMARY_OMNI_METHOD_KEYS,
  PRIMARY_OMNI_METHOD_ORDER,
} from '../omniCalcMethods'

/**
 * Cross-app contract-lock for the Mercury → Venus seller-PLG handoff.
 *
 * Mercury hands sellers off to this engine with a `selected_method` query
 * param sourced from `apps/mercury/shared/constants/seller-valuation-engine.ts
 * → SELLER_DEFAULT_VALUATION_METHOD`. Mercury currently sends
 * `'upswitch_adaptive'`. If Venus renames the omni-calc method key without
 * updating Mercury, the handoff would silently land on a missing method and
 * the engine would fall back to its first-method default — without any
 * user-facing error.
 *
 * Symmetrical Mercury-side test:
 * `apps/mercury/tests/unit/shared/constants/seller-valuation-engine.test.ts`.
 *
 * If you intentionally rename `'upswitch_adaptive'` here, you MUST also
 * update Mercury's constant AND the symmetrical Mercury test in the same
 * change set, then redeploy both apps together to avoid a drift window.
 *
 * Other Mercury entry points pinned by this contract:
 *   - `buildOwnerMarketApproachVenusPathWithQuery` (for-owners landing)
 *   - `buildStandaloneCalculatorEngineUrl` (`/calculator` redirect)
 *   - `buildVenusManualNewPathWithQuery` default method
 */
describe('omniCalcMethods cross-app contract', () => {
  it('uses the generated ValuationIQ method contract for primary order and method count', () => {
    expect(PRIMARY_OMNI_METHOD_ORDER).toEqual(VALUATION_PRIMARY_OMNI_METHOD_ORDER)
    expect(DISTINCT_VALUATION_METHOD_COUNT).toBe(CONTRACT_DISTINCT_VALUATION_METHOD_COUNT)
  })

  it('PRIMARY_OMNI_METHOD_ORDER includes upswitch_adaptive (Mercury seller-PLG default)', () => {
    expect(PRIMARY_OMNI_METHOD_ORDER).toContain('upswitch_adaptive')
  })

  it('PRIMARY_OMNI_METHOD_KEYS Set membership includes upswitch_adaptive', () => {
    expect(PRIMARY_OMNI_METHOD_KEYS.has('upswitch_adaptive')).toBe(true)
  })

  it('upswitch_adaptive is the first/headline primary method (matches catalog UX)', () => {
    expect(PRIMARY_OMNI_METHOD_ORDER[0]).toBe('upswitch_adaptive')
  })

  it('PRIMARY_OMNI_METHOD_ORDER also exposes the founder/SaaS family Mercury links to', () => {
    // Per the original UPS-STARTUP-001 spec, founders must be able to run the
    // Upswitch-adaptive (omni), SaaS (`arr_multiple`), and startup methods in
    // the same UI. The `startup_valuation` key lives outside the primary
    // order (it's not a multiples method) — see the PRE_SELECTABLE_METHODS
    // assertion below — so here we only assert the two omni methods.
    expect(PRIMARY_OMNI_METHOD_ORDER).toContain('upswitch_adaptive')
    expect(PRIMARY_OMNI_METHOD_ORDER).toContain('arr_multiple')
  })

  it('PRE_SELECTABLE_METHODS keeps the founder triad available in the top-bar dropdown', () => {
    // These three are the founder/owner self-serve entry points. Removing any
    // one would break either the dashboard CTA (`upswitch_adaptive`), the SaaS
    // founder flow (`arr_multiple`), or the venture/Berkus path
    // (`startup_valuation`). All three must stay pre-selectable.
    expect(PRE_SELECTABLE_METHODS).toContain('upswitch_adaptive')
    expect(PRE_SELECTABLE_METHODS).toContain('arr_multiple')
    expect(PRE_SELECTABLE_METHODS).toContain('startup_valuation')

    expect(PRE_SELECTABLE_METHOD_SET.has('upswitch_adaptive')).toBe(true)
    expect(PRE_SELECTABLE_METHOD_SET.has('arr_multiple')).toBe(true)
    expect(PRE_SELECTABLE_METHOD_SET.has('startup_valuation')).toBe(true)
  })

  it('startup_valuation stays in STANDALONE_METHODS (cannot be blended with SME methods)', () => {
    // The startup engine consumes qualitative inputs (Berkus scorecard, VC
    // method) that are categorically incompatible with multiples/DCF blends.
    // If this changes, the blend math in
    // `apps/venus/src/utils/buildManualValuationRequest.ts` and the
    // founder-only UI guards must be revisited together.
    expect(STANDALONE_METHODS.has('startup_valuation')).toBe(true)
    expect(STANDALONE_METHODS.has('upswitch_adaptive')).toBe(true)
  })
})
