import { describe, expect, it } from 'vitest'
import type { ValuationMethodResult } from '@/types/valuation'
import {
  methodComparisonDelta,
  resolveMethodCurrency,
  resolveMethodValueBasis,
} from './methodComparisonFinancials'

const baseline: ValuationMethodResult = { label: 'Adaptive', value: 0.1, available: true }
describe('comparable method values', () => {
  it('compares only available results in the same known currency and basis', () => {
    expect(methodComparisonDelta({ ...baseline, value: 0.3 }, baseline, 'EUR')).toEqual({
      amount: 0.2,
      percent: 200,
    })
    expect(methodComparisonDelta({ ...baseline, currency: 'GBP' }, baseline, 'EUR')).toBeNull()
    expect(
      methodComparisonDelta({ ...baseline, value_basis: 'enterprise_value' }, baseline, 'EUR')
    ).toBeNull()
    expect(methodComparisonDelta(baseline, { ...baseline, available: false }, 'EUR')).toBeNull()
    expect(methodComparisonDelta(baseline, baseline)).toBeNull()
  })
  it('does not calculate percentage changes from zero or negative equity', () => {
    expect(methodComparisonDelta(baseline, { ...baseline, value: 0 }, 'EUR')).toEqual({
      amount: 0.1,
      percent: null,
    })
    expect(methodComparisonDelta(baseline, { ...baseline, value: -1 }, 'EUR')?.percent).toBeNull()
  })
  it('does not override malformed or explicitly unknown metadata', () => {
    expect(resolveMethodCurrency({ ...baseline, currency: 'invalid' }, 'EUR')).toBeNull()
    expect(resolveMethodValueBasis({ ...baseline, value_basis: null })).toBeNull()
    expect(
      resolveMethodValueBasis({ ...baseline, details: { value_basis: 'enterprise_value' } })
    ).toBe('enterprise_value')
  })
})
