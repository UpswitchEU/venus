// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { buildSectorMismatchWarning } from './sectorMismatchWarning'

describe('buildSectorMismatchWarning', () => {
  it('returns null when NACE-resolved type matches the selected business type', () => {
    expect(
      buildSectorMismatchWarning({
        naceResolvedId: 'logistics',
        naceResolvedName: 'Logistics',
        businessTypeId: 'logistics',
        selectedTitle: 'Logistics',
      })
    ).toBeNull()
  })

  it('returns null when legacy aliases resolve to the same canonical type', () => {
    expect(
      buildSectorMismatchWarning({
        naceResolvedId: 'fintech-lending',
        naceResolvedName: 'Fintech - Lending',
        businessTypeId: 'fintech_lending_credit',
        selectedTitle: 'Fintech - Lending & Credit',
      })
    ).toBeNull()
  })

  it('uses design-system name for NACE-resolved label', () => {
    expect(
      buildSectorMismatchWarning({
        naceResolvedId: 'logistics',
        naceResolvedName: 'Logistics',
        businessTypeId: 'software_saas',
        selectedTitle: 'Software / SaaS',
      })
    ).toEqual({
      naceTypeTitle: 'Logistics',
      selectedTitle: 'Software / SaaS',
    })
  })

  it('falls back to ids and industry when titles are missing', () => {
    expect(
      buildSectorMismatchWarning({
        naceResolvedId: 'logistics',
        businessTypeId: 'software_saas',
        industry: 'Custom Industry',
      })
    ).toEqual({
      naceTypeTitle: 'logistics',
      selectedTitle: 'Custom Industry',
    })
  })
})
