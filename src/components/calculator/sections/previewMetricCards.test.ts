import { describe, expect, it } from 'vitest'
import { formatPreviewMetricValue, roundPreviewMetric } from './previewMetricCards'

describe('previewMetricCards', () => {
  const fmt = new Intl.NumberFormat('en-BE', { maximumFractionDigits: 2 })

  it('roundPreviewMetric respects fraction digits', () => {
    expect(roundPreviewMetric(1.234, 1)).toBe(1.2)
    expect(roundPreviewMetric(1.235, 2)).toBe(1.24)
  })

  it('formatPreviewMetricValue returns em dash for null', () => {
    expect(formatPreviewMetricValue(null, fmt, 1)).toBe('—')
  })
})
