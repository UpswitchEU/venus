// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ValuationFormData } from '@/types/valuation'
import { markAuthoredPercentageInputs, PERCENTAGE_INPUT_FIELDS } from './percentageInputContract'
import { buildValuationBusinessContext } from './valuationRequestBusinessContext'

const fixture = JSON.parse(
  readFileSync(resolve('tests/contracts/percentage-inputs-conformance.v1.json'), 'utf8')
)

describe('explicit percentage input units', () => {
  it('matches the engine field catalogue', () => {
    expect([...PERCENTAGE_INPUT_FIELDS].sort()).toEqual(fixture.supported_fields)
  })
  it.each(
    fixture.cases
  )('preserves declared wire units without guessing magnitude: $id', (item) => {
    const context = {
      [item.key]: item.raw,
      percentage_input_contract: {
        schema_version: 'percentage_inputs.v1',
        units: { [item.key]: item.unit },
      },
    }
    expect(markAuthoredPercentageInputs(JSON.parse(JSON.stringify(context)), {})).toEqual(
      context.percentage_input_contract
    )
  })
  it.each(
    fixture.invalid_contracts
  )('does not silently erase an unsupported saved unit contract: %j', (contract) => {
    expect(() =>
      markAuthoredPercentageInputs({ percentage_input_contract: contract }, {})
    ).toThrow()
  })
  it('marks typed half-point WACC and growth at the real request builder', () => {
    const result = buildValuationBusinessContext({
      formData: {
        dcf_wacc_pct: 0.5,
        dcf_terminal_growth_pct: 0.1,
        saas_churn_pct: 0.5,
      } as ValuationFormData,
      countryCode: 'BE',
      latestRevenue: 1000000,
      rawForecastData: [],
      projectionYears: 5,
    })
    expect(result.businessContext).toMatchObject({
      dcf_wacc_pct: 0.5,
      dcf_terminal_growth_pct: 0.1,
      saas_churn_pct: 0.5,
      percentage_input_contract: {
        schema_version: 'percentage_inputs.v1',
        units: {
          dcf_wacc_pct: 'percentage_points',
          dcf_terminal_growth_pct: 'percentage_points',
          saas_churn_pct: 'percentage_points',
        },
      },
    })
  })
  it('does not relabel inherited unversioned fields or mutate historical state', () => {
    const context = { dcf_wacc_pct: 0.12, saas_churn_pct: 0.03 }
    const result = buildValuationBusinessContext({
      formData: { business_context: context, dcf_capex_pct: 0.5 } as ValuationFormData,
      countryCode: 'BE',
      latestRevenue: 1000000,
      rawForecastData: [],
      projectionYears: 5,
    })
    expect(result.businessContext?.percentage_input_contract).toEqual({
      schema_version: 'percentage_inputs.v1',
      units: { dcf_capex_pct: 'percentage_points' },
    })
    expect(result.businessContext?.dcf_wacc_pct).toBe(0.12)
    expect(context).toEqual({ dcf_wacc_pct: 0.12, saas_churn_pct: 0.03 })
  })
  it('replaces units only when the percent control authors a replacement value', () => {
    const context = {
      percentage_input_contract: {
        schema_version: 'percentage_inputs.v1',
        units: {
          dcf_wacc_pct: 'fraction',
          saas_churn_pct: 'fraction',
        },
      },
    }
    expect(markAuthoredPercentageInputs(context, { dcf_wacc_pct: 0.5 })?.units).toEqual({
      dcf_wacc_pct: 'percentage_points',
      saas_churn_pct: 'fraction',
    })
    expect(context.percentage_input_contract.units.dcf_wacc_pct).toBe('fraction')
  })
})
