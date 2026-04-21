import { describe, expect, it } from 'vitest'
import { validateEbitdaMargin, validateRevenue } from '../industryGuidance'

describe('validateRevenue', () => {
  it('does not treat revenue 0 as “missing” — still returns a structured result', () => {
    const r = validateRevenue(0, 'services', undefined, 5, 2020)
    expect(r.isValid).toBe(true)
    expect(r.severity).toBeDefined()
  })
})

describe('validateEbitdaMargin', () => {
  it('evaluates margin when revenue > 0 and EBITDA is exactly 0', () => {
    const r = validateEbitdaMargin(1_000_000, 0, 'services')
    expect(r.message.length).toBeGreaterThan(0)
    expect(r.message.toLowerCase()).toContain('margin')
  })

  it('skips margin when revenue is 0 (undefined margin)', () => {
    const r = validateEbitdaMargin(0, 100_000, 'services')
    expect(r.message).toBe('')
  })
})
