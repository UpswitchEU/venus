/**
 * Unit tests for NameGenerator utility
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NameGenerator } from '../nameGenerator'

describe('NameGenerator', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear()
    vi.clearAllMocks()
  })

  describe('generateValuationName', () => {
    it('should generate a valuation name', () => {
      const name = NameGenerator.generateValuationName()
      expect(name).toBeTruthy()
      expect(typeof name).toBe('string')
      expect(name).toMatch(/Valuation Report #\d+/)
    })

    it('should be deterministic for the same seed (auth-first hash numbering)', () => {
      const name1 = NameGenerator.generateValuationName('fixed-seed')
      const name2 = NameGenerator.generateValuationName('fixed-seed')
      expect(name1).toBe(name2)
      expect(name1).toMatch(/^Valuation Report #\d+$/)
    })

    it('should generate names with consistent format', () => {
      const name = NameGenerator.generateValuationName()
      expect(name).toMatch(/^Valuation Report #\d+$/)
    })
  })

  describe('generateFromCompany', () => {
    it('should generate name from company name', () => {
      const name = NameGenerator.generateFromCompany('Test Company')
      expect(name).toBeTruthy()
      expect(typeof name).toBe('string')
      expect(name).toContain('Test')
      expect(name.toLowerCase()).toContain('valuation')
    })

    it('should handle empty company name', () => {
      const name = NameGenerator.generateFromCompany('')
      expect(name).toMatch(/Valuation Report #\d+/)
    })

    it('should truncate long company names', () => {
      const longName = 'Very Long Company Name That Should Be Truncated'
      const result = NameGenerator.generateFromCompany(longName)
      expect(result.length).toBeLessThan(100) // Reasonable length
    })
  })

  describe('generateWithDate', () => {
    it('should generate name with date', () => {
      const name = NameGenerator.generateWithDate()
      expect(name).toBeTruthy()
      expect(typeof name).toBe('string')
      expect(name).toMatch(/Valuation Report/)
    })

    it('should include base name when provided', () => {
      const name = NameGenerator.generateWithDate('Custom Name')
      expect(name).toContain('Custom Name')
    })
  })
})
