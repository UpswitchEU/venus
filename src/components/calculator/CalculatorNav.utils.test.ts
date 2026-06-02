import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatTimeAgo } from './CalculatorNav.utils'

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
