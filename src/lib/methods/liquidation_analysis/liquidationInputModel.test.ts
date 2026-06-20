import { describe, expect, it } from 'vitest'
import {
  LIQUIDATION_ADVANCED_FIELDS,
  LIQUIDATION_ASSET_CLASS_CODES,
  LIQUIDATION_ASSET_OVERRIDE_FORM_KEYS,
  LIQUIDATION_ESSENTIAL_FIELDS,
  LIQUIDATION_LIABILITY_BUCKET_CODES,
  LIQUIDATION_LIABILITY_BUCKET_FORM_KEYS,
  LIQUIDATION_RESET_NUMERIC_FIELD_KEYS,
} from './liquidationInputConfig'
import {
  buildLiquidationAssetOverrides,
  buildLiquidationLiabilityBuckets,
  countPositiveLiquidationValues,
  formatLiquidationPercentDisplay,
  parseLiquidationPercentInput,
  readLiquidationAssetOverrideFormValues,
  readLiquidationLiabilityBucketFormValues,
  resolveLiquidationPositivePrefill,
} from './liquidationInputModel'

describe('liquidation input model', () => {
  it('keeps one canonical reset list for essentials, advanced fields, buckets, and asset overrides', () => {
    expect(LIQUIDATION_RESET_NUMERIC_FIELD_KEYS).toEqual([
      ...LIQUIDATION_ESSENTIAL_FIELDS,
      ...LIQUIDATION_ADVANCED_FIELDS,
      ...LIQUIDATION_LIABILITY_BUCKET_FORM_KEYS,
      ...LIQUIDATION_ASSET_OVERRIDE_FORM_KEYS,
    ])
  })

  it('counts only positive finite bucket or asset values', () => {
    expect(
      countPositiveLiquidationValues(
        {
          secured: 100_000,
          unsecured: 0,
          subordinated: -1,
          preferent_tax: Number.NaN,
        },
        LIQUIDATION_LIABILITY_BUCKET_CODES
      )
    ).toBe(1)
  })

  it('resolves positive prefill patches only for empty fields', () => {
    expect(
      resolveLiquidationPositivePrefill({
        field: 'liq_headcount',
        currentValue: undefined,
        sourceValue: 7.8,
        transform: Math.floor,
      })
    ).toEqual({ field: 'liq_headcount', value: 7 })

    expect(
      resolveLiquidationPositivePrefill({
        field: 'liq_headcount',
        currentValue: 3,
        sourceValue: 7.8,
      })
    ).toBeNull()

    expect(
      resolveLiquidationPositivePrefill({
        field: 'liq_headcount',
        currentValue: undefined,
        sourceValue: 0,
      })
    ).toBeNull()
  })

  it('round-trips decimal percent fields through advisor-facing whole-percent text', () => {
    expect(formatLiquidationPercentDisplay(0.155)).toBe('15.5')
    expect(formatLiquidationPercentDisplay(undefined)).toBe('')
    expect(parseLiquidationPercentInput('15.5')).toBe(0.155)
    expect(parseLiquidationPercentInput('-2')).toBe(0)
    expect(parseLiquidationPercentInput('')).toBeUndefined()
    expect(parseLiquidationPercentInput('not-a-number')).toBeUndefined()
  })

  it('serializes liability buckets from the same canonical tier order used by the UI', () => {
    expect(
      buildLiquidationLiabilityBuckets(
        {
          liq_lb_estate_costs: 5_000,
          liq_lb_secured: '120000',
          liq_lb_unsecured: 0,
          liq_lb_preferent_tax: -1,
        },
        LIQUIDATION_LIABILITY_BUCKET_CODES
      )
    ).toEqual({
      estate_costs: 5_000,
      secured: 120_000,
    })
  })

  it('serializes asset overrides from the same canonical asset order used by the UI', () => {
    expect(
      buildLiquidationAssetOverrides(
        {
          liq_ao_cash: '20000',
          liq_ao_machinery_equipment: 75_000,
          liq_ao_land: 0,
          liq_ao_intangibles: -1,
        },
        LIQUIDATION_ASSET_CLASS_CODES
      )
    ).toEqual({
      cash: { adjusted_value: 20_000 },
      machinery_equipment: { adjusted_value: 75_000 },
    })
  })

  it('reads finite bucket and asset values for UI props without leaking blanks', () => {
    expect(
      readLiquidationLiabilityBucketFormValues(
        {
          liq_lb_secured: '120000',
          liq_lb_unsecured: '',
          liq_lb_subordinated: null,
        },
        LIQUIDATION_LIABILITY_BUCKET_CODES
      )
    ).toEqual({ secured: 120_000 })

    expect(
      readLiquidationAssetOverrideFormValues(
        {
          liq_ao_cash: 0,
          liq_ao_machinery_equipment: '75000',
          liq_ao_land: 'not-a-number',
        },
        LIQUIDATION_ASSET_CLASS_CODES
      )
    ).toEqual({
      cash: 0,
      machinery_equipment: 75_000,
    })
  })
})
