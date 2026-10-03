// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { normalizeSessionData } from '../../services/session/SessionNormalizer'
import type { ValuationFormData } from '../../types/valuation'
import { mergeOptionalSessionPrefillFields } from '../mergeOptionalSessionPrefillFields'
import { buildValuationBusinessContext } from '../valuationRequestBusinessContext'

function restore(context: Record<string, unknown>, path: string): ValuationFormData {
  if (path === 'session') {
    return normalizeSessionData({
      session_key: 'unit-roundtrip',
      session_data: { business_context: context },
    }).formData as ValuationFormData
  }
  return mergeOptionalSessionPrefillFields({ business_context: context }, {}) as ValuationFormData
}

function rebuild(formData: ValuationFormData) {
  return buildValuationBusinessContext({
    formData,
    countryCode: 'BE',
    latestRevenue: 1000000,
    rawForecastData: [],
    projectionYears: 5,
  }).businessContext
}

describe.each(['session', 'prefill'])('%s percentage restoration into percent controls', (path) => {
  it.each([
    ['dcf_wacc_pct', '.122', 'fraction', 12.2],
    ['dcf_tax_rate_pct', '.25', 'fraction', 25],
    ['dcf_terminal_growth_pct', '.005', 'fraction', 0.5],
    ['saas_nrr_pct', '1.2', 'fraction', 120],
    ['saas_churn_pct', '0', 'fraction', 0],
    ['dcf_revenue_growth_pct', '-.005', 'fraction', -0.5],
    ['dcf_wacc_pct', '12.200', 'percentage_points', 12.2],
    ['dcf_wacc_pct', '12.2％', 'percentage_points', 12.2],
  ])('preserves the economic rate for %s = %s %s', (key, raw, unit, points) => {
    const context = {
      [key]: raw,
      percentage_input_contract: { schema_version: 'percentage_inputs.v1', units: { [key]: unit } },
    }
    const saved = JSON.stringify(context)
    const form = restore(context, path)
    expect((form as Record<string, unknown>)[key]).toBe(points)
    const wire = rebuild(form)
    expect(wire?.[key]).toBe(points)
    expect(wire?.percentage_input_contract).toEqual({
      schema_version: 'percentage_inputs.v1',
      units: { [key]: 'percentage_points' },
    })
    // A second save/reload does not apply the unit conversion again.
    expect(rebuild(restore(JSON.parse(JSON.stringify(wire)), path))?.[key]).toBe(points)
    expect(JSON.stringify(context)).toBe(saved)
  })

  it.each([
    true,
    'NaN',
    'Infinity',
    '1_0',
    '25%',
    '1e999999',
  ])('rejects malformed declared fraction %s on restore', (raw) => {
    const context = {
      dcf_wacc_pct: raw,
      percentage_input_contract: {
        schema_version: 'percentage_inputs.v1',
        units: { dcf_wacc_pct: 'fraction' },
      },
    }
    expect(() => restore(context, path)).toThrow()
  })

  it('retains missing and legacy context without fabricating or rescaling values', () => {
    const context = { dcf_wacc_pct: null, saas_churn_pct: 0.03 }
    const form = restore(context, path)
    expect(form.dcf_wacc_pct).toBeUndefined()
    expect(form.saas_churn_pct).toBe(0.03)
    expect(context).toEqual({ dcf_wacc_pct: null, saas_churn_pct: 0.03 })
  })

  it('keeps an explicit form edit authoritative over inherited fractional context', () => {
    const context = {
      dcf_wacc_pct: '.122',
      percentage_input_contract: {
        schema_version: 'percentage_inputs.v1',
        units: { dcf_wacc_pct: 'fraction' },
      },
    }
    const form = restore(context, path)
    form.dcf_wacc_pct = 0.5
    expect(rebuild(form)?.dcf_wacc_pct).toBe(0.5)
    expect(rebuild(form)?.percentage_input_contract).toEqual({
      schema_version: 'percentage_inputs.v1',
      units: { dcf_wacc_pct: 'percentage_points' },
    })
  })
})
