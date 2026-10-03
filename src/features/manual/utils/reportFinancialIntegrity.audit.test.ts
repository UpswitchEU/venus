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
    0, -20,
  ])('retains observed equity %s without pricing an unrelated range midpoint', (value) => {
    const saved = response({
      valuation_results: {
        ebitda_multiple: {
          available: true,
          value,
          value_basis: 'equity_value',
          value_low: 100,
          value_high: 200,
        },
      },
    })
    const presentation = deriveManualReportPresentation(saved, 'ebitda_multiple')
    expect(presentation.valuation).toBe(value)
    expect(presentation.valuationLow).toBeUndefined()
    expect(presentation.valuationHigh).toBeUndefined()
    expect(deriveNavPricesForVersionNav(saved, 'ebitda_multiple')?.askPrice).toBeUndefined()
  })

  it('retains the enterprise basis of a legacy saved value without an equity bridge', () => {
    const saved = response(
      JSON.parse(
        JSON.stringify({
          report_context: { enterprise_value_mid: '150.08', applied_multiple: '1.5' },
        })
      )
    )
    expect(deriveManualReportPresentation(saved, 'omzet_multiple')).toMatchObject({
      valuation: 150.08,
      valueBasis: 'enterprise_value',
    })
    expect(deriveNavPricesForVersionNav(saved, 'omzet_multiple')).toBeNull()
  })

  it('uses an enterprise method band without inheriting a conflicting equity band', () => {
    const saved = response({
      equity_value_low: 900,
      equity_value_high: 1100,
      valuation_results: {
        omzet_multiple: {
          available: true,
          value: 150.08,
          value_basis: 'enterprise_value',
          value_low: '0',
          value_high: '190.10',
          equity_value_low: null,
          equity_value_high: null,
        },
      },
    })
    expect(deriveManualReportPresentation(saved, 'omzet_multiple')).toMatchObject({
      valuation: 150.08,
      valuationLow: 0,
      valuationHigh: 190.1,
      valueBasis: 'enterprise_value',
    })
  })

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
    expect(presentation.valuation).toBeNull()
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
    expect(presentation.valuation).toBeNull()
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
    expect(report(fields).recommendedAskingPrice).toBeUndefined()
    expect(
      deriveNavPricesForVersionNav(response(fields), 'ebitda_multiple')?.askPrice
    ).toBeUndefined()
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

describe('unavailable monetary facts', () => {
  it('does not fabricate earnings, a multiple, a currency, confidence or a point valuation', () => {
    const mapped = report({})
    expect(mapped.valuation).toBeNull()
    expect(mapped.ebitda).toBeNull()
    expect(mapped.multiple).toBeNull()
    expect(mapped.currency).toBeNull()
    expect(mapped.confidenceLevel).toBeUndefined()
    expect(mapped.recommendedAskingPrice).toBeUndefined()
    expect(deriveNavPricesForVersionNav(response({}))).toBeNull()
  })
  it('does not estimate a point from a range whose point is unavailable', () => {
    expect(
      deriveManualReportPresentation(response({ equity_value_low: 100, equity_value_high: 300 }))
        .valuation
    ).toBeNull()
  })
  it.each([
    0, -100.25,
  ])('preserves reported EBITDA %s without filling missing normalized evidence', (ebitda) => {
    expect(report({ current_year_data: { ebitda } }).ebitda).toBe(ebitda)
  })
})

it('never proposes a shareholder asking price from an enterprise-only valuation', () => {
  const result = response({
    currency: 'GBP',
    valuation_results: {
      ebitda_multiple: {
        available: true,
        value: 100,
        value_basis: 'enterprise_value',
        enterprise_value: 100,
        value_low: 90,
        value_high: 110,
        equity_value: null,
      },
    },
  })
  const mapped = report(result as unknown as Record<string, unknown>)
  expect(mapped.valuation).toBe(100)
  expect(mapped.valueBasis).toBe('enterprise_value')
  expect(mapped.recommendedAskingPrice).toBeUndefined()
  expect(deriveNavPricesForVersionNav(result, 'ebitda_multiple')).toBeNull()
})
