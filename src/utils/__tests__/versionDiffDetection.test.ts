/**
 * Version Diff Detection Tests
 *
 * Test change detection between valuation versions.
 *
 * @module utils/__tests__/versionDiffDetection.test
 */

import { describe, expect, it } from 'vitest'
import type { ValuationRequest } from '../../types/valuation'
import {
  areChangesSignificant,
  detectVersionChanges,
  formatChangesSummary,
  generateAutoLabel,
} from '../versionDiffDetection'

describe('versionDiffDetection', () => {
  const baseData: Partial<ValuationRequest> = {
    company_name: 'Test Company',
    country_code: 'BE',
    founding_year: 2020,
    number_of_employees: 10,
    number_of_owners: 2,
    current_year_data: {
      year: 2025,
      revenue: 2000000,
      ebitda: 500000,
      total_assets: 1000000,
      total_debt: 200000,
      cash: 100000,
    },
  }

  describe('detectVersionChanges', () => {
    it('should detect no changes when data is identical', () => {
      const changes = detectVersionChanges(baseData, baseData)

      expect(changes.totalChanges).toBe(0)
      expect(changes.significantChanges).toHaveLength(0)
    })

    it('should detect revenue change', () => {
      const newData = {
        ...baseData,
        current_year_data: {
          ...baseData.current_year_data!,
          revenue: 2500000, // +25%
        },
      }

      const changes = detectVersionChanges(baseData, newData)

      expect(changes.revenue).toBeDefined()
      expect(changes.revenue?.from).toBe(2000000)
      expect(changes.revenue?.to).toBe(2500000)
      expect(changes.revenue?.percentChange).toBeCloseTo(25, 1)
      expect(changes.totalChanges).toBe(1)
    })

    it('should detect EBITDA change', () => {
      const newData = {
        ...baseData,
        current_year_data: {
          ...baseData.current_year_data!,
          ebitda: 750000, // +50%
        },
      }

      const changes = detectVersionChanges(baseData, newData)

      expect(changes.ebitda).toBeDefined()
      expect(changes.ebitda?.from).toBe(500000)
      expect(changes.ebitda?.to).toBe(750000)
      expect(changes.ebitda?.percentChange).toBeCloseTo(50, 1)
    })

    it('should detect multiple financial changes', () => {
      const newData = {
        ...baseData,
        current_year_data: {
          ...baseData.current_year_data!,
          revenue: 2500000,
          ebitda: 750000,
          total_assets: 1200000,
        },
      }

      const changes = detectVersionChanges(baseData, newData)

      expect(changes.totalChanges).toBe(3)
      expect(changes.revenue).toBeDefined()
      expect(changes.ebitda).toBeDefined()
      expect(changes.totalAssets).toBeDefined()
    })

    it('should mark significant changes (>10%)', () => {
      const newData = {
        ...baseData,
        current_year_data: {
          ...baseData.current_year_data!,
          revenue: 2500000, // +25% (significant)
          ebitda: 505000, // +1% (not significant)
        },
      }

      const changes = detectVersionChanges(baseData, newData)

      expect(changes.significantChanges).toContain('revenue')
      expect(changes.significantChanges).not.toContain('ebitda')
    })

    it('should detect company name change', () => {
      const newData = {
        ...baseData,
        company_name: 'Updated Company Name',
      }

      const changes = detectVersionChanges(baseData, newData)

      expect(changes.companyName).toBeDefined()
      expect(changes.companyName?.from).toBe('Test Company')
      expect(changes.companyName?.to).toBe('Updated Company Name')
    })

    it('should preserve decimal and zero shareholding changes exactly', () => {
      const withDecimalStake = {
        ...baseData,
        shares_for_sale: 33.33,
      }
      const withZeroStake = {
        ...baseData,
        shares_for_sale: 0,
      }

      const decimalChange = detectVersionChanges(baseData, withDecimalStake)
      const zeroChange = detectVersionChanges(withDecimalStake, withZeroStake)

      expect(decimalChange.sharesForSale?.to).toBe(33.33)
      expect(zeroChange.sharesForSale?.from).toBe(33.33)
      expect(zeroChange.sharesForSale?.to).toBe(0)
    })
  })

  describe('formatChangesSummary', () => {
    it('should format revenue change', () => {
      const changes = {
        revenue: {
          from: 2000000,
          to: 2500000,
          percentChange: 25,
          timestamp: new Date(),
        },
        totalChanges: 1,
        significantChanges: ['revenue'],
      }

      const summaries = formatChangesSummary(changes, 'BE')

      expect(summaries).toHaveLength(1)
      expect(summaries[0]).toContain('Revenue')
      expect(summaries[0]).toContain('+25')
    })

    it('should format multiple changes', () => {
      const changes = {
        revenue: {
          from: 2000000,
          to: 2500000,
          percentChange: 25,
          timestamp: new Date(),
        },
        ebitda: {
          from: 500000,
          to: 750000,
          percentChange: 50,
          timestamp: new Date(),
        },
        totalChanges: 2,
        significantChanges: ['revenue', 'ebitda'],
      }

      const summaries = formatChangesSummary(changes, 'BE')

      expect(summaries).toHaveLength(2)
      expect(summaries[0]).toContain('Revenue')
      expect(summaries[1]).toContain('EBITDA')
    })

    it('should handle negative changes', () => {
      const changes = {
        revenue: {
          from: 2500000,
          to: 2000000,
          percentChange: -20,
          timestamp: new Date(),
        },
        totalChanges: 1,
        significantChanges: [],
      }

      const summaries = formatChangesSummary(changes, 'BE')

      expect(summaries[0]).toContain('-20')
    })
  })

  describe('areChangesSignificant', () => {
    it('should return true for significant financial changes', () => {
      const changes = {
        revenue: {
          from: 2000000,
          to: 2500000,
          percentChange: 25,
          timestamp: new Date(),
        },
        totalChanges: 1,
        significantChanges: ['revenue'],
      }

      expect(areChangesSignificant(changes)).toBe(true)
    })

    it('should return true for multiple non-significant changes', () => {
      const changes = {
        companyName: {
          from: 'Old',
          to: 'New',
          timestamp: new Date(),
        },
        foundingYear: {
          from: 2020,
          to: 2021,
          timestamp: new Date(),
        },
        numberOfEmployees: {
          from: 10,
          to: 12,
          timestamp: new Date(),
        },
        totalChanges: 3,
        significantChanges: [],
      }

      expect(areChangesSignificant(changes)).toBe(true)
    })

    it('should return false for trivial changes', () => {
      const changes = {
        numberOfEmployees: {
          from: 10,
          to: 11,
          timestamp: new Date(),
        },
        totalChanges: 1,
        significantChanges: [],
      }

      expect(areChangesSignificant(changes)).toBe(false)
    })
  })

  describe('generateAutoLabel', () => {
    it('should generate label with significant changes', () => {
      const changes = {
        totalChanges: 2,
        significantChanges: ['revenue', 'ebitda'],
      }

      const label = generateAutoLabel(3, changes)

      expect(label).toContain('v3')
      expect(label).toContain('revenue')
      expect(label).toContain('ebitda')
    })

    it('should generate label for single change', () => {
      const changes = {
        revenue: {
          from: 2000000,
          to: 2500000,
          percentChange: 25,
          timestamp: new Date(),
        },
        totalChanges: 1,
        significantChanges: [],
      }

      const label = generateAutoLabel(2, changes)

      expect(label).toContain('v2')
      expect(label).toContain('revenue')
    })

    it('should generate generic label for no changes', () => {
      const changes = {
        totalChanges: 0,
        significantChanges: [],
      }

      const label = generateAutoLabel(1, changes)

      expect(label).toBe('Version 1')
    })
  })
})

/**
 * Version Diff Detection Tests
 *
 * Test change detection between valuation versions.
 *
 * @module utils/__tests__/versionDiffDetection.test
 */

import { describe, expect, it } from 'vitest'
import type { ValuationRequest } from '../../types/valuation'
import {
  areChangesSignificant,
  detectVersionChanges,
  formatChangesSummary,
  generateAutoLabel,
} from '../versionDiffDetection'

describe('versionDiffDetection', () => {
  const baseData: Partial<ValuationRequest> = {
    company_name: 'Test Company',
    country_code: 'BE',
    founding_year: 2020,
    number_of_employees: 10,
    number_of_owners: 2,
    current_year_data: {
      year: 2025,
      revenue: 2000000,
      ebitda: 500000,
      total_assets: 1000000,
      total_debt: 200000,
      cash: 100000,
    },
  }

  describe('detectVersionChanges', () => {
    it('should detect no changes when data is identical', () => {
      const changes = detectVersionChanges(baseData, baseData)

      expect(changes.totalChanges).toBe(0)
      expect(changes.significantChanges).toHaveLength(0)
    })

    it('should detect revenue change', () => {
      const newData = {
        ...baseData,
        current_year_data: {
          ...baseData.current_year_data!,
          revenue: 2500000, // +25%
        },
      }

      const changes = detectVersionChanges(baseData, newData)

      expect(changes.revenue).toBeDefined()
      expect(changes.revenue?.from).toBe(2000000)
      expect(changes.revenue?.to).toBe(2500000)
      expect(changes.revenue?.percentChange).toBeCloseTo(25, 1)
      expect(changes.totalChanges).toBe(1)
    })

    it('should detect EBITDA change', () => {
      const newData = {
        ...baseData,
        current_year_data: {
          ...baseData.current_year_data!,
          ebitda: 750000, // +50%
        },
      }

      const changes = detectVersionChanges(baseData, newData)

      expect(changes.ebitda).toBeDefined()
      expect(changes.ebitda?.from).toBe(500000)
      expect(changes.ebitda?.to).toBe(750000)
      expect(changes.ebitda?.percentChange).toBeCloseTo(50, 1)
    })

    it('should detect multiple financial changes', () => {
      const newData = {
        ...baseData,
        current_year_data: {
          ...baseData.current_year_data!,
          revenue: 2500000,
          ebitda: 750000,
          total_assets: 1200000,
        },
      }

      const changes = detectVersionChanges(baseData, newData)

      expect(changes.totalChanges).toBe(3)
      expect(changes.revenue).toBeDefined()
      expect(changes.ebitda).toBeDefined()
      expect(changes.totalAssets).toBeDefined()
    })

    it('should mark significant changes (>10%)', () => {
      const newData = {
        ...baseData,
        current_year_data: {
          ...baseData.current_year_data!,
          revenue: 2500000, // +25% (significant)
          ebitda: 505000, // +1% (not significant)
        },
      }

      const changes = detectVersionChanges(baseData, newData)

      expect(changes.significantChanges).toContain('revenue')
      expect(changes.significantChanges).not.toContain('ebitda')
    })

    it('should detect company name change', () => {
      const newData = {
        ...baseData,
        company_name: 'Updated Company Name',
      }

      const changes = detectVersionChanges(baseData, newData)

      expect(changes.companyName).toBeDefined()
      expect(changes.companyName?.from).toBe('Test Company')
      expect(changes.companyName?.to).toBe('Updated Company Name')
    })
  })

  describe('formatChangesSummary', () => {
    it('should format revenue change', () => {
      const changes = {
        revenue: {
          from: 2000000,
          to: 2500000,
          percentChange: 25,
          timestamp: new Date(),
        },
        totalChanges: 1,
        significantChanges: ['revenue'],
      }

      const summaries = formatChangesSummary(changes, 'BE')

      expect(summaries).toHaveLength(1)
      expect(summaries[0]).toContain('Revenue')
      expect(summaries[0]).toContain('+25')
    })

    it('should format multiple changes', () => {
      const changes = {
        revenue: {
          from: 2000000,
          to: 2500000,
          percentChange: 25,
          timestamp: new Date(),
        },
        ebitda: {
          from: 500000,
          to: 750000,
          percentChange: 50,
          timestamp: new Date(),
        },
        totalChanges: 2,
        significantChanges: ['revenue', 'ebitda'],
      }

      const summaries = formatChangesSummary(changes, 'BE')

      expect(summaries).toHaveLength(2)
      expect(summaries[0]).toContain('Revenue')
      expect(summaries[1]).toContain('EBITDA')
    })

    it('should handle negative changes', () => {
      const changes = {
        revenue: {
          from: 2500000,
          to: 2000000,
          percentChange: -20,
          timestamp: new Date(),
        },
        totalChanges: 1,
        significantChanges: [],
      }

      const summaries = formatChangesSummary(changes, 'BE')

      expect(summaries[0]).toContain('-20')
    })
  })

  describe('areChangesSignificant', () => {
    it('should return true for significant financial changes', () => {
      const changes = {
        revenue: {
          from: 2000000,
          to: 2500000,
          percentChange: 25,
          timestamp: new Date(),
        },
        totalChanges: 1,
        significantChanges: ['revenue'],
      }

      expect(areChangesSignificant(changes)).toBe(true)
    })

    it('should return true for multiple non-significant changes', () => {
      const changes = {
        companyName: {
          from: 'Old',
          to: 'New',
          timestamp: new Date(),
        },
        foundingYear: {
          from: 2020,
          to: 2021,
          timestamp: new Date(),
        },
        numberOfEmployees: {
          from: 10,
          to: 12,
          timestamp: new Date(),
        },
        totalChanges: 3,
        significantChanges: [],
      }

      expect(areChangesSignificant(changes)).toBe(true)
    })

    it('should return false for trivial changes', () => {
      const changes = {
        numberOfEmployees: {
          from: 10,
          to: 11,
          timestamp: new Date(),
        },
        totalChanges: 1,
        significantChanges: [],
      }

      expect(areChangesSignificant(changes)).toBe(false)
    })
  })

  describe('generateAutoLabel', () => {
    it('should generate label with significant changes', () => {
      const changes = {
        totalChanges: 2,
        significantChanges: ['revenue', 'ebitda'],
      }

      const label = generateAutoLabel(3, changes)

      expect(label).toContain('v3')
      expect(label).toContain('revenue')
      expect(label).toContain('ebitda')
    })

    it('should generate label for single change', () => {
      const changes = {
        revenue: {
          from: 2000000,
          to: 2500000,
          percentChange: 25,
          timestamp: new Date(),
        },
        totalChanges: 1,
        significantChanges: [],
      }

      const label = generateAutoLabel(2, changes)

      expect(label).toContain('v2')
      expect(label).toContain('revenue')
    })

    it('should generate generic label for no changes', () => {
      const changes = {
        totalChanges: 0,
        significantChanges: [],
      }

      const label = generateAutoLabel(1, changes)

      expect(label).toBe('Version 1')
    })
  })
})
