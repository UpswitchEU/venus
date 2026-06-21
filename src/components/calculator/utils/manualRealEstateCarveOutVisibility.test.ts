import { describe, expect, it } from 'vitest'
import {
  hasManualRealEstateCarveOutData,
  shouldShowManualRealEstateCarveOut,
} from './manualRealEstateCarveOutVisibility'

describe('manual real-estate carve-out visibility', () => {
  it('shows the panel when any selected method consumes the carve-out', () => {
    expect(
      shouldShowManualRealEstateCarveOut({
        effectiveMethods: ['arr_multiple', 'dcf'],
        formData: {},
      })
    ).toBe(true)
  })

  it('hides the panel for non-consuming methods when no stored carve-out state exists', () => {
    expect(
      shouldShowManualRealEstateCarveOut({
        effectiveMethods: ['arr_multiple'],
        formData: {},
      })
    ).toBe(false)
  })

  it('keeps the panel visible when stored carve-out state would otherwise become hidden', () => {
    expect(
      shouldShowManualRealEstateCarveOut({
        effectiveMethods: ['arr_multiple'],
        formData: {
          real_estate_treatment: 'carve_out',
        },
      })
    ).toBe(true)
    expect(
      shouldShowManualRealEstateCarveOut({
        effectiveMethods: ['adjusted_nav'],
        formData: {
          estimated_market_rent: 0,
        },
      })
    ).toBe(true)
  })

  it('treats explicit inclusion and balance-sheet values as stored carve-out state', () => {
    expect(hasManualRealEstateCarveOutData({ real_estate_treatment: 'included' })).toBe(true)
    expect(hasManualRealEstateCarveOutData({ exclude_real_estate: true })).toBe(true)
    expect(hasManualRealEstateCarveOutData({ real_estate_market_value: 0 })).toBe(true)
    expect(hasManualRealEstateCarveOutData({ real_estate_book_value: 0 })).toBe(true)
  })
})
