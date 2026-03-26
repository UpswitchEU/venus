import { describe, expect, it } from 'vitest'
import {
  compareOmniMethodKeys,
  partitionOmniMethodEntries,
  PRIMARY_OMNI_METHOD_KEYS,
  PRIMARY_OMNI_METHOD_ORDER,
} from './omniCalcMethods'

describe('PRIMARY_OMNI_METHOD_KEYS', () => {
  it('includes DCF and SDE so they appear before “show all”', () => {
    expect(PRIMARY_OMNI_METHOD_KEYS.has('dcf')).toBe(true)
    expect(PRIMARY_OMNI_METHOD_KEYS.has('sde_multiple')).toBe(true)
  })

  it('includes revenue-style multiples and Adaptive', () => {
    expect(PRIMARY_OMNI_METHOD_KEYS.has('upswitch_adaptive')).toBe(true)
    expect(PRIMARY_OMNI_METHOD_KEYS.has('arr_multiple')).toBe(true)
    expect(PRIMARY_OMNI_METHOD_KEYS.has('omzet_multiple')).toBe(true)
    expect(PRIMARY_OMNI_METHOD_KEYS.has('revenue_multiple')).toBe(true)
  })
})

describe('partitionOmniMethodEntries', () => {
  it('orders primary keys by PRIMARY_OMNI_METHOD_ORDER', () => {
    const { primary } = partitionOmniMethodEntries([
      ['fiscal_4x', {} as never],
      ['upswitch_adaptive', {} as never],
      ['arr_multiple', {} as never],
      ['ebitda_multiple', {} as never],
    ])
    expect(primary.map(([k]) => k)).toEqual([
      'upswitch_adaptive',
      'arr_multiple',
      'ebitda_multiple',
      'fiscal_4x',
    ])
  })

  it('sorts secondary keys alphabetically', () => {
    const { secondary } = partitionOmniMethodEntries([
      ['zebra', {} as never],
      ['alpha', {} as never],
    ])
    expect(secondary.map(([k]) => k)).toEqual(['alpha', 'zebra'])
  })
})

describe('compareOmniMethodKeys', () => {
  it('places primary keys before any secondary key', () => {
    expect(compareOmniMethodKeys('dcf', 'zebra')).toBeLessThan(0)
    expect(compareOmniMethodKeys('zebra', 'dcf')).toBeGreaterThan(0)
  })

  it('matches PRIMARY_OMNI_METHOD_ORDER for two primary keys', () => {
    const a = PRIMARY_OMNI_METHOD_ORDER.indexOf('ebitda_multiple')
    const b = PRIMARY_OMNI_METHOD_ORDER.indexOf('dcf')
    const cmp = compareOmniMethodKeys('ebitda_multiple', 'dcf')
    expect(Math.sign(cmp)).toBe(Math.sign(a - b))
  })
})
