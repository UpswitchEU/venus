/**
 * Cap-table simulator gate — Phase 5 of the Wintercircus rollout.
 *
 * The selector is the single source of truth for "should the live
 * cap-table slider render above the HTML report?".  These tests pin
 * the load-bearing contract so a regression that hides the slider
 * for a SaaS founder (or shows it on the advisor surface) is caught
 * at unit-test time instead of during Wintercircus QA.
 */

import { describe, expect, it } from 'vitest'
import type { ValuationMethodResult } from '@/types/valuation'
import { selectCapTableSimulatorResult } from '../selectCapTableSimulatorResult'

const SIM_PAYLOAD = {
  investment_amount: 500_000,
  pre_money: 2_300_000,
  post_money: 2_800_000,
  dilution_pct: 17.86,
  investor_dilution_pct: 17.86,
  option_pool_pct: 10,
  safe_dilution_pct: 0,
  founder_dilution_pct: 27.86,
  safe_total: 0,
  source: 'investor_ask',
}

function methodResult(overrides: Partial<ValuationMethodResult> = {}): ValuationMethodResult {
  return {
    value: 2_300_000,
    label: 'ARR multiple',
    available: true,
    details: {},
    ...overrides,
  }
}

describe('selectCapTableSimulatorResult', () => {
  it('returns the result when the selected method carries a cap_table_simulator (SaaS path)', () => {
    const arrResult = methodResult({
      label: 'ARR multiple',
      details: { cap_table_simulator: SIM_PAYLOAD },
    })
    const got = selectCapTableSimulatorResult({
      isAdvisorAudience: false,
      selectedMethod: 'arr_multiple',
      valuationResults: { arr_multiple: arrResult },
    })
    expect(got).toBe(arrResult)
  })

  it('returns the result for the legacy startup_valuation path (backwards compat)', () => {
    const startupResult = methodResult({
      label: 'Startup',
      details: { cap_table_simulator: SIM_PAYLOAD },
    })
    const got = selectCapTableSimulatorResult({
      isAdvisorAudience: false,
      selectedMethod: 'startup_valuation',
      valuationResults: { startup_valuation: startupResult },
    })
    expect(got).toBe(startupResult)
  })

  it('keeps the founder simulator visible for Grow owners with Pro valuation access', () => {
    const arrResult = methodResult({
      label: 'ARR multiple',
      details: { cap_table_simulator: SIM_PAYLOAD },
    })
    const got = selectCapTableSimulatorResult({
      isAdvisorAudience: false,
      selectedMethod: 'arr_multiple',
      valuationResults: { arr_multiple: arrResult },
    })
    expect(got).toBe(arrResult)
  })

  it('returns null when the selected method has no cap_table_simulator in details', () => {
    const got = selectCapTableSimulatorResult({
      isAdvisorAudience: false,
      selectedMethod: 'arr_multiple',
      valuationResults: {
        arr_multiple: methodResult({ details: { arr: 1_250_000 } }),
      },
    })
    expect(got).toBeNull()
  })

  it('returns null for advisor surfaces even when a simulator payload is present', () => {
    const got = selectCapTableSimulatorResult({
      isAdvisorAudience: true,
      selectedMethod: 'arr_multiple',
      valuationResults: {
        arr_multiple: methodResult({
          details: { cap_table_simulator: SIM_PAYLOAD },
        }),
      },
    })
    expect(got).toBeNull()
  })

  it('does not silently fall through to a different method that has the simulator', () => {
    // Only the selected method is consulted.  If the founder is
    // viewing dcf but startup_valuation happens to carry a simulator
    // (e.g. a stale comparison snapshot), the slider stays hidden —
    // we'd otherwise show numbers that don't match the visible
    // headline.
    const got = selectCapTableSimulatorResult({
      isAdvisorAudience: false,
      selectedMethod: 'dcf',
      valuationResults: {
        dcf: methodResult({ label: 'DCF', details: {} }),
        startup_valuation: methodResult({
          label: 'Startup',
          details: { cap_table_simulator: SIM_PAYLOAD },
        }),
      },
    })
    expect(got).toBeNull()
  })

  it('handles missing / empty inputs gracefully', () => {
    expect(
      selectCapTableSimulatorResult({
        isAdvisorAudience: false,
        selectedMethod: null,
        valuationResults: { arr_multiple: methodResult() },
      })
    ).toBeNull()
    expect(
      selectCapTableSimulatorResult({
        isAdvisorAudience: false,
        selectedMethod: 'arr_multiple',
        valuationResults: null,
      })
    ).toBeNull()
    expect(
      selectCapTableSimulatorResult({
        isAdvisorAudience: false,
        selectedMethod: 'arr_multiple',
        valuationResults: {},
      })
    ).toBeNull()
  })

  it('rejects a non-object cap_table_simulator (defensive)', () => {
    // If the engine ever emits something weird (string / number / null)
    // for cap_table_simulator we MUST NOT pass it to the React
    // component — the slider would crash trying to read fields off it.
    const got = selectCapTableSimulatorResult({
      isAdvisorAudience: false,
      selectedMethod: 'arr_multiple',
      valuationResults: {
        arr_multiple: methodResult({
          details: {
            cap_table_simulator: 'unexpected-string' as unknown as Record<string, unknown>,
          },
        }),
      },
    })
    expect(got).toBeNull()
  })
})
