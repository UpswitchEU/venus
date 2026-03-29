import { describe, expect, it } from 'vitest'
import { resolveRevenueQualityBadgeVariant } from './revenueQualityBadge'

describe('resolveRevenueQualityBadgeVariant', () => {
  it('treats revenue_multiple like omzet_multiple for badge lens', () => {
    expect(resolveRevenueQualityBadgeVariant(['revenue_multiple'])).toBe('omzet')
    expect(resolveRevenueQualityBadgeVariant(['revenue_multiple', 'ebitda_multiple'])).toBe('both')
  })

  it('keeps omzet_multiple behaviour', () => {
    expect(resolveRevenueQualityBadgeVariant(['omzet_multiple'])).toBe('omzet')
    expect(resolveRevenueQualityBadgeVariant(['ebitda_multiple'])).toBe('ebitda')
  })
})
