import { describe, expect, it } from 'vitest'
import type { ValuationResponse } from '@/types/valuation'
import {
  deriveManualReportPresentation,
  deriveNavPricesForVersionNav,
} from '../components/manualReportPresentation'
import { mapValuationResultToReport } from './mapValuationResultToReport'

function response(fields: Record<string, unknown>): ValuationResponse {
  return fields as unknown as ValuationResponse
}

function report(fields: Record<string, unknown>) {
  return mapValuationResultToReport({
    result: response(fields),
    selectedMethod: 'ebitda_multiple',
    reportId: 'audit',
    canDownloadPdf: false,
    tReport: (key) => key,
  })
}

describe('report financial integrity audit', () => {
  it.each([
    true,
    false,
    '',
    [],
    {},
  ])('rejects a malformed method monetary value %j before method selection', (value) => {
    const presentation = deriveManualReportPresentation(
      response({
        valuation_results: {
          ebitda_multiple: { available: true, value },
          upswitch_adaptive: { available: true, value: 300_000 },
        },
      }),
      'ebitda_multiple'
    )
    expect(presentation.valuation).toBe(300_000)
  })

  it('requires a true availability flag before selecting a method', () => {
    const presentation = deriveManualReportPresentation(
      response({
        valuation_results: {
          ebitda_multiple: { available: 'false', value: 500_000 },
          upswitch_adaptive: { available: true, value: 300_000 },
        },
      }),
      'ebitda_multiple'
    )
    expect(presentation.valuation).toBe(300_000)
  })

  it('retains an explicit zero method conclusion rather than pricing the range midpoint', () => {
    const presentation = deriveManualReportPresentation(
      response({
        valuation_results: {
          ebitda_multiple: {
            available: true,
            value: 0,
            equity_value_low: 100_000,
            equity_value_high: 300_000,
          },
        },
      }),
      'ebitda_multiple'
    )
    expect(presentation.valuation).toBe(0)
  })

  it('does not coerce malformed multiples into numerical report assumptions', () => {
    const mapped = report({
      valuation_results: {
        ebitda_multiple: {
          available: true,
          value: 500_000,
          multiple_used: true,
          details: { p25_multiple: false, p75_multiple: [] },
        },
      },
      multiples_valuation: { p25_ebitda_multiple: false, p75_ebitda_multiple: [] },
    })
    expect(mapped.multipleRange).toBeUndefined()
    expect(
      deriveManualReportPresentation(
        response({
          valuation_results: {
            ebitda_multiple: { available: true, value: 500_000, multiple_used: true },
          },
        }),
        'ebitda_multiple'
      ).multiple
    ).toBeUndefined()
  })

  it('does not convert a boolean asking price into a one-unit asking price', () => {
    const fields = {
      recommended_asking_price: true,
      valuation_results: { ebitda_multiple: { available: true, value: 500_000 } },
    }
    expect(report(fields).recommendedAskingPrice).toBe(500_000)
    expect(deriveNavPricesForVersionNav(response(fields), 'ebitda_multiple').askPrice).toBe(500_000)
  })

  it('uses the selected method band rather than the overall adaptive range', () => {
    const presentation = deriveManualReportPresentation(
      response({
        equity_value_low: 1_000_000,
        equity_value_high: 2_000_000,
        valuation_results: {
          ebitda_multiple: {
            available: true,
            value: 500_000,
            equity_value_low: '400000.125',
            equity_value_high: '600000.125',
            details: {},
          },
        },
      }),
      'ebitda_multiple'
    )
    expect(presentation.valuation).toBe(500_000)
    expect(presentation.valuationLow).toBe(400000.125)
    expect(presentation.valuationHigh).toBe(600000.125)
  })

  it('canonical equity endpoints supersede obsolete detail mirrors', () => {
    const presentation = deriveManualReportPresentation(
      response({
        valuation_results: {
          ebitda_multiple: {
            available: true,
            value: 500_000,
            equity_value_low: 400_000,
            equity_value_high: 600_000,
            details: { equity_range_low: 100_000, equity_range_high: 900_000 },
          },
        },
      }),
      'ebitda_multiple'
    )
    expect(presentation.valuationLow).toBe(400_000)
    expect(presentation.valuationHigh).toBe(600_000)
  })

  it('preserves an explicitly unavailable method range', () => {
    const presentation = deriveManualReportPresentation(
      response({
        equity_value_low: 1_000_000,
        equity_value_high: 2_000_000,
        valuation_results: {
          ebitda_multiple: {
            available: true,
            value: 500_000,
            equity_value_low: null,
            equity_value_high: null,
            details: {},
          },
        },
      }),
      'ebitda_multiple'
    )
    expect(presentation.valuationLow).toBeUndefined()
    expect(presentation.valuationHigh).toBeUndefined()
  })

  it('never joins a method lower bound to another method upper bound', () => {
    const presentation = deriveManualReportPresentation(
      response({
        equity_value_low: 1_000_000,
        equity_value_high: 2_000_000,
        valuation_results: {
          ebitda_multiple: {
            available: true,
            value: 500_000,
            details: { equity_range_low: 400_000 },
          },
        },
      }),
      'ebitda_multiple'
    )
    expect(presentation.valuationLow).toBe(400_000)
    expect(presentation.valuationHigh).toBeUndefined()
  })

  it('retains the observed zero lower endpoint of a weighted range', () => {
    const presentation = deriveManualReportPresentation(
      response({
        weighted_valuation: {
          blended_equity_value: 250_000,
          valuation_range_low: 0,
          valuation_range_high: 500_000,
        },
        valuation_results: {
          ebitda_multiple: {
            available: true,
            value: 500_000,
            details: { equity_range_low: 400_000, equity_range_high: 600_000 },
          },
        },
      }),
      'ebitda_multiple'
    )
    expect(presentation.valuation).toBe(250_000)
    expect(presentation.valuationLow).toBe(0)
    expect(presentation.valuationHigh).toBe(500_000)
  })

  it('does not borrow a method range for an unbanded weighted conclusion', () => {
    const presentation = deriveManualReportPresentation(
      response({
        weighted_valuation: { blended_equity_value: 250_000 },
        valuation_results: {
          ebitda_multiple: {
            available: true,
            value: 500_000,
            details: { equity_range_low: 400_000, equity_range_high: 600_000 },
          },
        },
      }),
      'ebitda_multiple'
    )
    expect(presentation.valuation).toBe(250_000)
    expect(presentation.valuationLow).toBeUndefined()
    expect(presentation.valuationHigh).toBeUndefined()
  })

  it('keeps reported and normalized earnings separate in the report metadata', () => {
    const mapped = report({
      current_year_data: {
        revenue: 1_000_000,
        ebitda: 125_000,
        reported_ebitda: 100_000,
        normalized_ebitda: 125_000,
        ebitda_normalized: true,
      },
    })
    expect(mapped.ebitda).toBe(100_000)
    expect(mapped.normalizedEbitda).toBe(125_000)
    expect(mapped.metrics?.[1].value).toBe('10.0%')
  })

  it.each([
    'GBP',
    'CHF',
    'USD',
  ])('labels %s revenue with its actual response currency', (currency) => {
    const mapped = report({ currency, current_year_data: { revenue: 2_000_000, ebitda: 400_000 } })
    expect(mapped.currency).toBe(currency)
    expect(mapped.metrics?.[0].value).not.toContain('€')
  })

  it.each([
    null,
    '',
    false,
    [],
    'NaN',
  ])('missing or malformed EBITDA %j never displays a break-even margin', (ebitda) => {
    const mapped = report({ current_year_data: { revenue: 1_000_000, ebitda } })
    expect(mapped.metrics?.[1].value).toBe('—')
    expect(mapped.normalizedEbitda).toBeUndefined()
  })
})
