import { describe, expect, it } from 'vitest'
import type { ValuationMethodResult, ValuationResponse } from '../../types/valuation'
import {
  buildMethodBreakdownModel,
  buildMultipleFormulaModel,
  getDcfReadinessMissingFieldKeys,
  getFormulaTranslationKey,
  normalizeComparablesQualityKey,
} from './ValuationEditModalBreakdownModel'

describe('ValuationEditModalBreakdownModel', () => {
  it('builds APV DCF bridge state and readiness gaps from method details', () => {
    const method = {
      available: true,
      label: 'Discounted Cash Flow',
      value: 1_496,
      wacc: 0.175,
      details: {
        enterprise_value: 1_396,
        dcf_enterprise_value_before_apv: 1_393,
        dcf_equity_value_before_apv: 1_493,
        apv_tax_shield_value: 3,
        apv_enterprise_value: 1_396,
        apv_equity_value: 1_496,
        apv_discount_rate: 0.175,
        apv_discounting_convention: 'year_end',
        apv_benchmark_reconciliation: {
          benchmark_name: 'Customer DCF template',
          status: 'matched',
        },
        historical_fcf_readiness: {
          status: 'partial',
          historical_years_count: 3,
          actual_capex_years: 1,
          actual_tax_years: 3,
          actual_nwc_years: 1,
        },
      },
    } as ValuationMethodResult

    const model = buildMethodBreakdownModel({
      appliedMultiple: null,
      method,
      methodKey: 'dcf',
      result: {} as ValuationResponse,
    })

    expect(model.hasApvBridge).toBe(true)
    expect(model.apvTaxShieldValue).toBe(3)
    expect(model.apvBenchmarkStatus).toBe('matched')
    expect(model.apvBenchmarkName).toBe('Customer DCF template')
    expect(getFormulaTranslationKey('dcf', model.hasApvBridge)).toBe('formulaDcfApv')
    expect(getDcfReadinessMissingFieldKeys(model.dcfReadiness)).toEqual([
      'capex',
      'working_capital',
    ])
    expect(buildMultipleFormulaModel('dcf', model)).toBeNull()
  })

  it('normalizes localized DCF result strings for report breakdown cards', () => {
    const method = {
      available: true,
      label: 'Discounted Cash Flow',
      value: '1.496.000',
      wacc: '0,11',
      details: {
        enterprise_value: '1.396.000',
        terminal_value: '500.000',
        terminal_exit_multiple: '6,5',
        terminal_value_methodology: 'exit_multiple',
        apv_tax_shield_value: '3.000',
      },
    } as unknown as ValuationMethodResult

    const model = buildMethodBreakdownModel({
      appliedMultiple: null,
      method,
      methodKey: 'dcf',
      result: {} as ValuationResponse,
    })

    expect(model.wacc).toBe(0.11)
    expect(model.equityValue).toBe(1_496_000)
    expect(model.enterpriseValue).toBe(1_396_000)
    expect(model.terminalValue).toBe(500_000)
    expect(model.terminalExitMultiple).toBe(6.5)
    expect(model.apvTaxShieldValue).toBe(3_000)
  })

  it('projects revenue multiple formulas from normalized model values', () => {
    const method = {
      available: true,
      label: 'Revenue multiple',
      value: 575_000,
      details: {
        revenue: 300_000,
        enterprise_value: 600_000,
      },
    } as ValuationMethodResult
    const result = {
      details: {
        net_debt: 25_000,
        balance_sheet_adjustments: [{ amount: 10_000 }],
      },
      multiple_pipeline: {
        final_multiple: 2,
        stages: [
          {
            step_name: 'Size discount',
            multiple_before: 2.4,
            multiple_after: 2,
            discount_percentage: -16.7,
          },
        ],
      },
    } as ValuationResponse

    const model = buildMethodBreakdownModel({
      appliedMultiple: null,
      method,
      methodKey: 'revenue_multiple',
      result,
    })
    const formula = buildMultipleFormulaModel('revenue_multiple', model)

    expect(model.usesRevenueMetric).toBe(true)
    expect(model.fallbackPipelineRows).toEqual([
      {
        after: 2,
        before: 2.4,
        discount: -16.7,
        label: 'Size discount',
      },
    ])
    expect(getFormulaTranslationKey('revenue_multiple', false)).toBe('formulaRevenue')
    expect(formula).toEqual({
      balanceSheetAdjustments: 10_000,
      enterpriseValue: 600_000,
      equity: 575_000,
      metric: 300_000,
      multiple: 2,
      netDebt: 25_000,
    })
  })

  it('normalizes comparables quality aliases for translated display keys', () => {
    expect(normalizeComparablesQualityKey(' moderate ')).toBe('medium')
    expect(normalizeComparablesQualityKey('HIGH')).toBe('high')
  })
})
