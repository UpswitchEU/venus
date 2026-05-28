import { describe, expect, it } from 'vitest'
import { isFiniteNumeric } from './isFiniteNumeric'

describe('isFiniteNumeric', () => {
  it('accepts numbers and numeric strings', () => {
    expect(isFiniteNumeric(42)).toBe(true)
    expect(isFiniteNumeric('120000')).toBe(true)
  })

  it('rejects empty and non-numeric values', () => {
    expect(isFiniteNumeric(null)).toBe(false)
    expect(isFiniteNumeric('')).toBe(false)
    expect(isFiniteNumeric('n/a')).toBe(false)
    expect(isFiniteNumeric(Number.NaN)).toBe(false)
  })
})
