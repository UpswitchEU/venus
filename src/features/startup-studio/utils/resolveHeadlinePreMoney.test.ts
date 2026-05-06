import { describe, expect, it } from 'vitest'
import { isValidPreMoneyTarget, resolveHeadlinePreMoney } from './resolveHeadlinePreMoney'

describe('resolveHeadlinePreMoney', () => {
  it('uses a valid explicit target over blend', () => {
    expect(resolveHeadlinePreMoney(7_000_000, 1_700_000)).toBe(7_000_000)
  })

  it('falls back to blend when target is null', () => {
    expect(resolveHeadlinePreMoney(null, 1_700_000)).toBe(1_700_000)
  })

  it('falls back to blend when target is zero or negative', () => {
    expect(resolveHeadlinePreMoney(0, 1_700_000)).toBe(1_700_000)
    expect(resolveHeadlinePreMoney(-100, 1_700_000)).toBe(1_700_000)
  })

  it('returns null when neither side is usable', () => {
    expect(resolveHeadlinePreMoney(null, null)).toBeNull()
    expect(resolveHeadlinePreMoney(0, 0)).toBeNull()
  })

  it('isValidPreMoneyTarget matches resolve semantics', () => {
    expect(isValidPreMoneyTarget(1)).toBe(true)
    expect(isValidPreMoneyTarget(0)).toBe(false)
    expect(isValidPreMoneyTarget(null)).toBe(false)
    expect(isValidPreMoneyTarget(Number.NaN)).toBe(false)
  })
})
