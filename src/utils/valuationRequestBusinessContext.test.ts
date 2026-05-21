// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { ValuationFormData } from '@/types/valuation'
import { buildValuationBusinessContext } from './valuationRequestBusinessContext'

/**
 * Benchmarks the convergence point where a DCF valuation's inputs — entered
 * manually, pulled from an accounting integration, or filled by the AI
 * assistant — land in the request `business_context`.
 *
 * The fixture is the APV section of Henk van Blitterswijk's customer DCF
 * workbook (`Template DCF methode.xls`): a year-end FCFF schedule with an
 * explicit interest tax-shield stream. Whichever channel supplies it, the
 * request must reach the engine identically — only the input-source
 * provenance differs.
 */
const HENK_DCF_FIELDS: Record<string, unknown> = {
  dcf_input_mode: 'fcff_only',
  dcf_discounting_convention: 'year_end',
  dcf_wacc_pct: 17.5,
  dcf_terminal_growth_pct: 1,
  dcf_tax_shield_projections: [1.5, 1.125, 0.75, 0.375, 0],
}

function formDataWith(overrides: Record<string, unknown> = {}): ValuationFormData {
  return { companyName: 'Henk DCF Template BV', ...overrides } as unknown as ValuationFormData
}

function buildHenkContext(
  overrides: Record<string, unknown> = {},
  inputSource?: string
): Record<string, unknown> {
  const { businessContext } = buildValuationBusinessContext({
    formData: formDataWith({ ...HENK_DCF_FIELDS, ...overrides }),
    latestRevenue: 1000,
    countryCode: 'NL',
    rawForecastData: [],
    inputSource,
  })
  return (businessContext ?? {}) as Record<string, unknown>
}

describe('buildValuationBusinessContext — Henk DCF benchmark across input channels', () => {
  it('carries the year-end FCFF convention and tax-shield schedule into business_context', () => {
    const { businessContext, userConfiguredDcf } = buildValuationBusinessContext({
      formData: formDataWith(HENK_DCF_FIELDS),
      latestRevenue: 1000,
      countryCode: 'NL',
      rawForecastData: [],
    })
    const ctx = (businessContext ?? {}) as Record<string, unknown>

    expect(userConfiguredDcf).toBe(true)
    expect(ctx.dcf_input_mode).toBe('fcff_only')
    expect(ctx.dcf_discounting_convention).toBe('year_end')
    expect(ctx.dcf_wacc_pct).toBe(17.5)
    expect(ctx.dcf_tax_shield_projections).toEqual([1.5, 1.125, 0.75, 0.375, 0])
    // year-end + FCFF-only + explicit tax shields => recognised Henk benchmark.
    expect(ctx.dcf_benchmark_case).toBe('henk_customer_dcf_template')
    expect(ctx.dcf_bridge_policy).toBe('apv_tax_shield_inside_dcf')
    expect(ctx.dcf_double_counting_guard).toBe(true)
  })

  it('manual channel: no integration source resolves to "manual"', () => {
    const ctx = buildHenkContext()
    expect(ctx.dcf_tax_shield_source).toBe('manual')
    expect(ctx.apv_input_source).toBe('manual')
  })

  it('integration channel: official_financials provider resolves to "integration:<provider>"', () => {
    const ctx = buildHenkContext({
      official_financials: { source: 'silverfin', filingYear: 2025 },
    })
    expect(ctx.dcf_tax_shield_source).toBe('integration:silverfin')
    expect(ctx.apv_input_source).toBe('integration:silverfin')
  })

  it('AI-assistant channel: inputSource argument resolves to "ai_assistant"', () => {
    const ctx = buildHenkContext({}, 'ai_assistant')
    expect(ctx.dcf_tax_shield_source).toBe('ai_assistant')
    expect(ctx.apv_input_source).toBe('ai_assistant')
  })

  it('only tags the Henk benchmark case when both FCFF mode and year-end convention are set', () => {
    // Mid-year discounting is a valid ValuationIQ APV variant, not the
    // customer-template reconciliation — it must not claim the benchmark tag.
    const ctx = buildHenkContext({ dcf_discounting_convention: 'mid_year' })
    expect(ctx.dcf_discounting_convention).toBe('mid_year')
    expect(ctx.dcf_benchmark_case).toBeUndefined()
  })
})
