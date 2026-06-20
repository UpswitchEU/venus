import { describe, expect, it } from 'vitest'
import type { ValuationResponse } from '../../types/valuation'
import {
  buildEngineDiscountSteps,
  buildValuationEditPreparerModel,
  getPreparerConfidenceKey,
} from './ValuationEditModalPreparerModel'

describe('ValuationEditModalPreparerModel', () => {
  it('keeps the engine discount waterfall scannable and ignores trivial noise', () => {
    const result = {
      multiple_pipeline: {
        discount_waterfall: [
          { step_name: 'Benchmark start', discount_percentage: 0.05 },
          { step_name: 'Size discount', discount_percentage: -8 },
          { step_name: 'Liquidity discount', discount_percentage: -4 },
          { step_name: 'Owner risk', discount_percentage: -11 },
          { step_name: 'Country adjustment', discount_percentage: -2 },
          { step_name: 'Forecast risk', discount_percentage: -3 },
          { step_name: 'Customer concentration', discount_percentage: -5 },
          { step_name: 'Tail adjustment', discount_percentage: -1 },
        ],
      },
    } as ValuationResponse

    expect(buildEngineDiscountSteps(result)).toEqual([
      { name: 'Size discount', pct: -8 },
      { name: 'Liquidity discount', pct: -4 },
      { name: 'Owner risk', pct: -11 },
      { name: 'Country adjustment', pct: -2 },
      { name: 'Forecast risk', pct: -3 },
      { name: 'Customer concentration', pct: -5 },
    ])
  })

  it('falls back to legacy pipeline stages when the waterfall is not present', () => {
    const result = {
      multiple_pipeline: {
        stages: [
          { step_name: 'Size discount', discount_percentage: -7 },
          { step_name: 'Liquidity discount', discount_percentage: -3 },
        ],
      },
    } as ValuationResponse

    expect(buildEngineDiscountSteps(result)).toEqual([
      { name: 'Size discount', pct: -7 },
      { name: 'Liquidity discount', pct: -3 },
    ])
  })

  it('builds benchmark context, confidence, and saved preview display state', () => {
    const model = buildValuationEditPreparerModel({
      result: {
        multiples_valuation: {
          ebitda_multiple: 4.5,
          comparables_quality: 'moderate',
          confidence: 'stable',
        },
        multiple_adjustment_summary: {
          metric_key: 'ev_ebitda_median',
          benchmark_multiple: 4.5,
          selected_multiple: 4.5,
          reason_key: 'strategic_buyer_premium',
          generated_footnote_nl: 'Nederlandse voetnoot',
          generated_footnote_en: 'English footnote',
        },
      } as ValuationResponse,
      benchmarkMedian: null,
      appliedMedian: null,
      reasonKey: 'strategic_buyer_premium',
      note: '',
      locale: 'nl',
      businessTypeLabel: 'SaaS',
      industryLabel: 'Software',
      countryCode: 'BE',
      contextSeparator: ' · ',
      activeMethodValue: '123456',
      selectedMethod: 'ebitda_multiple',
      isMethodPersisting: false,
    })

    expect(model.benchmarkContext).toBe('SaaS · Software · België')
    expect(model.confidenceKey).toBe('confidenceMedium')
    expect(model.wasRestoredFromSave).toBe(true)
    expect(model.savedPreview).toBe('Nederlandse voetnoot')
    expect(model.activeMetricValue).toBe(123_456)
    expect(getPreparerConfidenceKey('high', 'low')).toBe('confidenceHigh')
  })

  it('normalizes live preview and equity math from details before root fallbacks', () => {
    const model = buildValuationEditPreparerModel({
      result: {
        ebitda: 80_000,
        net_debt: 40_000,
        balance_sheet_adjustments: 2_000,
        details: {
          sustainable_ebitda: '100000',
          net_debt: '15000',
          balance_sheet_adjustments: [{ amount: 5_000 }],
        },
        multiples_valuation: {
          ebitda_multiple: 4,
          comparables_quality: 'high',
          confidence: 'high',
          p10_ebitda_multiple: 3,
          p25_ebitda_multiple: 3.5,
          p75_ebitda_multiple: 5.5,
          p90_ebitda_multiple: 6,
        },
      } as ValuationResponse,
      benchmarkMedian: 4,
      appliedMedian: 5,
      reasonKey: 'strategic_buyer_premium',
      note: ' board approved ',
      locale: 'en',
      contextSeparator: ' / ',
      activeMethodValue: 490_000,
      selectedMethod: 'ebitda_multiple',
      isMethodPersisting: false,
    })

    expect(model.livePreview).toEqual({
      adjustment: 'premium',
      applied: '5.00',
      benchmark: '4.00',
      delta: '1.00',
      note: 'board approved',
      reasonKey: 'strategic_buyer_premium',
    })
    expect(model.liveEquityPreview).toBe(490_000)
    expect(model.sliderMin).toBe(1.8)
    expect(model.sliderMax).toBe(8.8)
  })

  it('surfaces high and low extreme-bound warning metadata only past guardrails', () => {
    const baseResult = {
      multiples_valuation: {
        ebitda_multiple: 5,
        comparables_quality: 'low',
        confidence: 'low',
        p10_ebitda_multiple: 3,
        p25_ebitda_multiple: 3.5,
        p75_ebitda_multiple: 5.5,
        p90_ebitda_multiple: 6,
      },
    } as ValuationResponse

    const highModel = buildValuationEditPreparerModel({
      result: baseResult,
      benchmarkMedian: 5,
      appliedMedian: 8,
      reasonKey: 'strategic_buyer_premium',
      note: '',
      locale: 'en',
      contextSeparator: ' / ',
      activeMethodValue: null,
      selectedMethod: 'ebitda_multiple',
      isMethodPersisting: false,
    })
    const lowModel = buildValuationEditPreparerModel({
      result: baseResult,
      benchmarkMedian: 5,
      appliedMedian: 2.2,
      reasonKey: 'distressed_sale',
      note: '',
      locale: 'en',
      contextSeparator: ' / ',
      activeMethodValue: null,
      selectedMethod: 'ebitda_multiple',
      isMethodPersisting: false,
    })

    expect(highModel.extremeBoundInfo).toEqual({
      bound: 'p90',
      boundValue: '6.00',
      directionKey: 'extremeWarningAbove',
      directionLabelKey: 'extremeWarningDirAboveLabel',
    })
    expect(lowModel.extremeBoundInfo).toEqual({
      bound: 'p10',
      boundValue: '3.00',
      directionKey: 'extremeWarningBelow',
      directionLabelKey: 'extremeWarningDirBelowLabel',
    })
  })

  it('dedupes dossier suggestions against discounts already priced into the engine', () => {
    const recurringRevenueResult = {
      recurring_revenue_percentage: 0.72,
      multiples_valuation: {
        ebitda_multiple: 4,
        comparables_quality: 'high',
        confidence: 'high',
      },
    } as ValuationResponse

    const suggestedModel = buildValuationEditPreparerModel({
      result: recurringRevenueResult,
      benchmarkMedian: 4,
      appliedMedian: 4,
      reasonKey: '',
      note: '',
      locale: 'en',
      contextSeparator: ' / ',
      activeMethodValue: null,
      selectedMethod: 'ebitda_multiple',
      isMethodPersisting: false,
    })
    const dedupedModel = buildValuationEditPreparerModel({
      result: {
        ...recurringRevenueResult,
        multiple_pipeline: {
          discount_waterfall: [{ step_name: 'Recurring revenue premium', discount_percentage: 2 }],
        },
      } as ValuationResponse,
      benchmarkMedian: 4,
      appliedMedian: 4,
      reasonKey: '',
      note: '',
      locale: 'en',
      contextSeparator: ' / ',
      activeMethodValue: null,
      selectedMethod: 'ebitda_multiple',
      isMethodPersisting: false,
    })

    expect(suggestedModel.dossierSignal?.reasonKey).toBe('recurring_revenue_premium')
    expect(dedupedModel.dossierSignal).toBeNull()
  })
})
