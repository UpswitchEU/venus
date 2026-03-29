import { describe, expect, it } from 'vitest'
import {
  createManualPreviewFormatters,
  formatEurCompactBelgian,
  getBelgianNumberLocale,
} from './manualPreviewFormatters'
import { PREVIEW_DECIMALS } from './previewConstants'

describe('getBelgianNumberLocale', () => {
  it('maps app locale to Belgian Intl tags', () => {
    expect(getBelgianNumberLocale('en')).toBe('en-BE')
    expect(getBelgianNumberLocale('nl')).toBe('nl-BE')
  })
})

describe('createManualPreviewFormatters', () => {
  it('exposes distinct formatters', () => {
    const f = createManualPreviewFormatters('en-BE')
    expect(f.saasMetric.format(1.23)).toBe(f.saasMetric.format(1.23))
    expect(f.currency.format(1000)).toContain('€')
    expect(f.ratio.resolvedOptions().maximumFractionDigits).toBe(PREVIEW_DECIMALS.ratio)
  })

  it('formatEurCompact matches standalone formatEurCompactBelgian', () => {
    const f = createManualPreviewFormatters('en-BE')
    const v = 3_000_000
    expect(f.formatEurCompact(v)).toBe(formatEurCompactBelgian('en-BE', v))
    expect(f.formatEurCompact(v)).toMatch(/3/)
  })
})
