import { describe, expect, it } from 'vitest'
import { formatHistoryCurrency } from './HistoryPanelModel'
import {
  financialVersionsComparable,
  formatComparisonRange,
  metricChange,
  percentageChange,
} from './VersionCompareModel'

describe('version comparison values', () => {
  it('compares zero and negative values without treating them as absent', () => {
    expect(metricChange(0, -100)).toBe(-100)
    expect(metricChange(-100, 0)).toBe(100)
    expect(metricChange(10, 0)).toBe(-10)
    expect(metricChange(0, 0)).toBe(0)
  })
  it.each([
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])('does not compute a delta for missing or invalid values (%s)', (value) => {
    expect(metricChange(value, 100)).toBeNull()
    expect(metricChange(100, value)).toBeNull()
  })
  it('only reports percentage growth from a positive known baseline', () => {
    expect(percentageChange(0, 100)).toBeNull()
    expect(percentageChange(-100, 100)).toBeNull()
    expect(percentageChange(undefined, 100)).toBeNull()
    expect(percentageChange(100, 0)).toBe(-100)
    expect(percentageChange(100, 150)).toBe(50)
  })
  it('does not invent endpoints for incomplete or inverted valuation ranges', () => {
    const euro = (value: number) => `EUR ${value}`
    expect(formatComparisonRange(100, undefined, euro)).toBeUndefined()
    expect(formatComparisonRange(undefined, 200, euro)).toBeUndefined()
    expect(formatComparisonRange(200, 100, euro)).toBeUndefined()
    expect(formatComparisonRange(100, Number.NaN, euro)).toBeUndefined()
    expect(formatComparisonRange(0, 200, euro)).toBe('EUR 0 – EUR 200')
  })
  it('uses exact localized currency consistently for positive, negative and zero values', () => {
    expect(formatHistoryCurrency(1_250_000, 'en', 'EUR')).toBe('€1,250,000.00')
    expect(formatHistoryCurrency(1_250_000, 'nl', 'EUR')).toBe('€\u00a01.250.000,00')
    expect(formatHistoryCurrency(1_250_000, 'fr', 'EUR')).toBe('1\u202f250\u202f000,00\u00a0€')
    expect(formatHistoryCurrency(-1_250_000, 'nl', 'EUR')).toBe('€\u00a0-1.250.000,00')
    expect(formatHistoryCurrency(0, 'en', 'EUR')).toBe('€0.00')
    expect(formatHistoryCurrency(Number.NaN, 'en')).toBe('—')
  })
  it('keeps unknown currency unknown and renders the supplied native currency precision', () => {
    expect(formatHistoryCurrency(1.25, 'en')).toBe('—')
    expect(formatHistoryCurrency(1.25, 'en', 'GBP')).toBe('£1.25')
    expect(formatHistoryCurrency(123, 'en', 'JPY')).toContain('123')
    expect(formatHistoryCurrency(123, 'en', 'JPY')).not.toContain('.00')
  })
  it('allows financial comparisons only in the same known currency and value basis', () => {
    const equity = { currency: 'EUR', valueBasis: 'equity_value' }
    expect(financialVersionsComparable(equity, equity)).toBe(true)
    expect(financialVersionsComparable(equity, { ...equity, currency: 'GBP' })).toBe(false)
    expect(financialVersionsComparable(equity, { ...equity, valueBasis: 'enterprise_value' })).toBe(
      false
    )
    expect(financialVersionsComparable({}, {})).toBe(false)
  })
})
