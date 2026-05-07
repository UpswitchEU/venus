import { describe, expect, it } from 'vitest'
import { computeFiscal4xPreview, FISCAL_EBITDA_MULTIPLIER } from './fiscalPreviewMetrics'

describe('computeFiscal4xPreview', () => {
  it('computes anchor and equity for BE with book equity', () => {
    const out = computeFiscal4xPreview({
      countryCode: 'BE',
      ebitda: 100_000,
      bookEquity: 200_000,
      sharesForSale: 100,
    })
    expect(out.available).toBe(true)
    expect(out.ebitdaForAnchor).toBe(100_000)
    expect(out.ebitdaSource).toBe('reported_latest_complete_year')
    expect(out.fiscalAnchor).toBe(100_000 * FISCAL_EBITDA_MULTIPLIER)
    expect(out.impliedFiscalEquity).toBe(200_000 + 400_000)
    expect(out.ownershipMultiplierApplied).toBe(1)
  })

  it('scales equity by shares for sale', () => {
    const out = computeFiscal4xPreview({
      countryCode: 'BE',
      ebitda: 50_000,
      bookEquity: 100_000,
      sharesForSale: 50,
    })
    expect(out.available).toBe(true)
    expect(out.ownershipMultiplierApplied).toBe(0.5)
    expect(out.impliedFiscalEquity).toBe((100_000 + 200_000) * 0.5)
  })

  it('rejects non-BE', () => {
    const out = computeFiscal4xPreview({ countryCode: 'NL', ebitda: 50_000, bookEquity: 1 })
    expect(out.available).toBe(false)
    expect(out.unavailableReason).toBe('non_be')
  })

  it('returns anchor only when book equity missing', () => {
    const out = computeFiscal4xPreview({ countryCode: 'BE', ebitda: 50_000, bookEquity: null })
    expect(out.available).toBe(false)
    expect(out.unavailableReason).toBe('missing_book_equity')
    expect(out.fiscalAnchor).toBe(200_000)
    expect(out.ebitdaForAnchor).toBe(50_000)
    expect(out.ebitdaSource).toBe('reported_latest_complete_year')
  })

  it('records weighted-normalized EBITDA source when provided', () => {
    const out = computeFiscal4xPreview({
      countryCode: 'BE',
      ebitda: 398_000,
      ebitdaSource: 'weighted_normalized_historical',
      bookEquity: 100_000,
    })
    expect(out.available).toBe(true)
    expect(out.ebitdaSource).toBe('weighted_normalized_historical')
    expect(out.ebitdaForAnchor).toBe(398_000)
    expect(out.fiscalAnchor).toBe(398_000 * FISCAL_EBITDA_MULTIPLIER)
  })
})
