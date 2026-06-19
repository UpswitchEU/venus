import { describe, expect, it } from 'vitest'
import {
  calculateNormalizationAdjustment,
  getNormalizationAdjustmentGuard,
  parseNormalizationInputValue,
  parseNormalizationPromptAmount,
} from './UnifiedNormalizationEditorModel'

describe('parseNormalizationInputValue', () => {
  it('parses plain and localized euro amounts', () => {
    expect(parseNormalizationInputValue('60000')).toBe(60_000)
    expect(parseNormalizationInputValue('EUR 60.000')).toBe(60_000)
    expect(parseNormalizationInputValue('60,5')).toBe(60.5)
  })

  it('returns null for empty or non-numeric input', () => {
    expect(parseNormalizationInputValue('')).toBeNull()
    expect(parseNormalizationInputValue('huur')).toBeNull()
  })
})

describe('calculateNormalizationAdjustment', () => {
  it('calculates manual amount, percent, subtract, and absolute adjustments', () => {
    const safeEbitda = 100_000

    expect(
      calculateNormalizationAdjustment({ type: 'add', numericValue: 20_000, safeEbitda })
    ).toBe(20_000)
    expect(
      calculateNormalizationAdjustment({ type: 'subtract', numericValue: 20_000, safeEbitda })
    ).toBe(-20_000)
    expect(
      calculateNormalizationAdjustment({ type: 'add_percent', numericValue: 35, safeEbitda })
    ).toBe(35_000)
    expect(
      calculateNormalizationAdjustment({ type: 'subtract_percent', numericValue: 35, safeEbitda })
    ).toBe(-35_000)
    expect(
      calculateNormalizationAdjustment({ type: 'absolute', numericValue: 120_000, safeEbitda })
    ).toBe(20_000)
  })

  it('falls back to zero for non-finite calculated adjustments', () => {
    expect(
      calculateNormalizationAdjustment({
        type: 'add_percent',
        numericValue: Number.POSITIVE_INFINITY,
        safeEbitda: 100_000,
      })
    ).toBe(0)
  })
})

describe('getNormalizationAdjustmentGuard', () => {
  it('warns and blocks based on the calculated adjustment, not the raw input value', () => {
    expect(getNormalizationAdjustmentGuard({ adjustment: 35_000, safeEbitda: 100_000 })).toEqual({
      kind: 'warning',
      pct: '35',
    })
    expect(getNormalizationAdjustmentGuard({ adjustment: 210_000, safeEbitda: 100_000 })).toEqual({
      kind: 'blocked',
      pct: '210',
    })
  })

  it('does not warn when an absolute target only changes EBITDA modestly', () => {
    expect(getNormalizationAdjustmentGuard({ adjustment: 20_000, safeEbitda: 100_000 })).toBeNull()
  })

  it('ignores zero or unusable EBITDA baselines', () => {
    expect(getNormalizationAdjustmentGuard({ adjustment: 50_000, safeEbitda: 0 })).toBeNull()
    expect(
      getNormalizationAdjustmentGuard({ adjustment: 50_000, safeEbitda: Number.NaN })
    ).toBeNull()
  })
})

describe('parseNormalizationPromptAmount', () => {
  it('parses currency, localized separators, and explicit k suffixes', () => {
    expect(parseNormalizationPromptAmount('normaliseer €60.000')).toBe('60000')
    expect(parseNormalizationPromptAmount('normaliseer huur 60k')).toBe('60000')
  })

  it('does not treat an unrelated k elsewhere in the prompt as an amount suffix', () => {
    expect(parseNormalizationPromptAmount('kantoorkosten 60')).toBe('60')
  })

  it('skips a bare ledger code and uses the following amount', () => {
    expect(parseNormalizationPromptAmount('604 huur 60k', { ledgerCode: '604' })).toBe('60000')
    expect(parseNormalizationPromptAmount('604 kantoorkosten 60', { ledgerCode: '604' })).toBe('60')
  })

  it('does not skip the amount when the ledger-shaped value is marked as money', () => {
    expect(parseNormalizationPromptAmount('604 correctie €604', { ledgerCode: '604' })).toBe('604')
  })
})
