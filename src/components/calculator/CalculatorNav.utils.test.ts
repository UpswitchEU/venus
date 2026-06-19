import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type CalculatorNavDisplaySummary,
  formatTimeAgo,
  normalizeCalculatorNavDisplaySummary,
} from './CalculatorNav.utils'

const t = (key: string, values?: Record<string, number>) => {
  if (key === 'common.time.justNow') return 'Just now'
  if (key === 'common.time.minutesAgo') return `${values?.count}m ago`
  if (key === 'common.time.hoursAgo') return `${values?.count}h ago`
  if (key === 'common.time.daysAgo') return `${values?.count}d ago`
  return key
}

describe('formatTimeAgo', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the just-now label for sub-minute timestamps', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-02T09:37:30.000Z'))

    expect(formatTimeAgo(new Date('2026-06-02T09:37:01.000Z'), t)).toBe('Just now')
  })

  it('formats elapsed minutes, hours, and days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-02T09:37:30.000Z'))

    expect(formatTimeAgo(new Date('2026-06-02T09:35:30.000Z'), t)).toBe('2m ago')
    expect(formatTimeAgo(new Date('2026-06-02T07:37:30.000Z'), t)).toBe('2h ago')
    expect(formatTimeAgo(new Date('2026-05-31T09:37:30.000Z'), t)).toBe('2d ago')
  })
})

describe('normalizeCalculatorNavDisplaySummary', () => {
  it('infers a missing ask price from a positive valuation range', () => {
    expect(
      normalizeCalculatorNavDisplaySummary({
        askPrice: 0,
        confidence: 'high',
        priceRange: { min: 800_000, max: 1_200_000 },
      })
    ).toEqual({
      askPrice: 1_000_000,
      confidence: 'high',
      priceRange: { min: 800_000, max: 1_200_000 },
    })
  })

  it('normalizes numeric wire-format values before rendering', () => {
    const summary = {
      askPrice: '950000',
      confidence: 'medium',
      priceRange: { min: '800000', max: '1100000' },
    } as unknown as CalculatorNavDisplaySummary

    expect(normalizeCalculatorNavDisplaySummary(summary)).toEqual({
      askPrice: 950_000,
      confidence: 'medium',
      priceRange: { min: 800_000, max: 1_100_000 },
    })
  })

  it('hides the nav valuation pill when no valuation number is usable', () => {
    expect(
      normalizeCalculatorNavDisplaySummary({
        askPrice: Number.NaN,
        confidence: 'low',
        priceRange: { min: Number.NaN, max: Number.NaN },
      })
    ).toBeNull()
  })
})
