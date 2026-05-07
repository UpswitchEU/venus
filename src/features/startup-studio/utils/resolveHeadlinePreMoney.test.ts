import { TAM_SAM_SOM_MAX_EUR } from '@/features/startup-studio/utils/tamSamSomFunnel'
import { describe, expect, it } from 'vitest'
import {
  isValidPreMoneyTarget,
  normalizePreMoneyTarget,
  resolveHeadlinePreMoney,
} from './resolveHeadlinePreMoney'

describe('normalizePreMoneyTarget', () => {
  it('rounds, drops non-positive, caps at studio max EUR', () => {
    expect(normalizePreMoneyTarget(null)).toBeNull()
    expect(normalizePreMoneyTarget(0)).toBeNull()
    expect(normalizePreMoneyTarget(-1)).toBeNull()
    expect(normalizePreMoneyTarget(Number.NaN)).toBeNull()
    expect(normalizePreMoneyTarget(1_000_000.4)).toBe(1_000_000)
    expect(normalizePreMoneyTarget(TAM_SAM_SOM_MAX_EUR + 1)).toBe(TAM_SAM_SOM_MAX_EUR)
  })
})

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

  it('caps an explicit target before preferring it over blend', () => {
    expect(resolveHeadlinePreMoney(TAM_SAM_SOM_MAX_EUR + 9, 1_700_000)).toBe(TAM_SAM_SOM_MAX_EUR)
  })

  it('isValidPreMoneyTarget matches resolve semantics', () => {
    expect(isValidPreMoneyTarget(1)).toBe(true)
    expect(isValidPreMoneyTarget(0)).toBe(false)
    expect(isValidPreMoneyTarget(null)).toBe(false)
    expect(isValidPreMoneyTarget(Number.NaN)).toBe(false)
  })
})
