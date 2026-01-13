/**
 * Report ID Generator Tests
 * Verifies collision-proof ID generation between Venus and Mercury
 */

import {
  generateReportId,
  getReportSource,
  getReportTimestamp,
  isMercuryReportId,
  isValidReportId,
  isVenusReportId,
} from '../reportIdGenerator'

describe('reportIdGenerator', () => {
  describe('generateReportId', () => {
    it('should generate valid report ID with Venus prefix', () => {
      const id = generateReportId()
      expect(id).toMatch(/^val_\d+_v[a-z0-9]+$/)
    })

    it('should generate unique IDs on consecutive calls', () => {
      const id1 = generateReportId()
      const id2 = generateReportId()
      expect(id1).not.toBe(id2)
    })

    it('should always start with "val_" prefix', () => {
      const id = generateReportId()
      expect(id.startsWith('val_')).toBe(true)
    })

    it('should include timestamp in milliseconds', () => {
      const before = Date.now()
      const id = generateReportId()
      const after = Date.now()

      const timestamp = getReportTimestamp(id)
      expect(timestamp).toBeGreaterThanOrEqual(before)
      expect(timestamp).toBeLessThanOrEqual(after)
    })

    it('should include Venus source identifier "v"', () => {
      const id = generateReportId()
      const parts = id.split('_')
      expect(parts[2].charAt(0)).toBe('v')
    })

    it('should generate 1000 unique IDs without collisions', () => {
      const ids = new Set<string>()
      for (let i = 0; i < 1000; i++) {
        ids.add(generateReportId())
      }
      expect(ids.size).toBe(1000)
    })
  })

  describe('isValidReportId', () => {
    it('should validate Venus-generated IDs', () => {
      const id = generateReportId()
      expect(isValidReportId(id)).toBe(true)
    })

    it('should validate Mercury-generated IDs (simulated)', () => {
      const mercuryId = `val_${Date.now()}_m7a8b9c0d`
      expect(isValidReportId(mercuryId)).toBe(true)
    })

    it('should validate legacy IDs without source prefix', () => {
      const legacyId = 'val_1729800000_abc123xyz'
      expect(isValidReportId(legacyId)).toBe(true)
    })

    it('should reject invalid formats', () => {
      expect(isValidReportId('invalid')).toBe(false)
      expect(isValidReportId('val_abc_123')).toBe(false)
      expect(isValidReportId('report_123_abc')).toBe(false)
      expect(isValidReportId('')).toBe(false)
    })
  })

  describe('getReportSource', () => {
    it('should identify Venus-generated IDs', () => {
      const id = generateReportId()
      expect(getReportSource(id)).toBe('venus')
    })

    it('should identify Mercury-generated IDs', () => {
      const mercuryId = `val_${Date.now()}_m7a8b9c0d`
      expect(getReportSource(mercuryId)).toBe('mercury')
    })

    it('should identify legacy IDs as unknown', () => {
      const legacyId = 'val_1729800000_abc123xyz'
      expect(getReportSource(legacyId)).toBe('unknown')
    })

    it('should return unknown for invalid IDs', () => {
      expect(getReportSource('invalid')).toBe('unknown')
    })
  })

  describe('isVenusReportId', () => {
    it('should return true for Venus IDs', () => {
      const id = generateReportId()
      expect(isVenusReportId(id)).toBe(true)
    })

    it('should return false for Mercury IDs', () => {
      const mercuryId = `val_${Date.now()}_m7a8b9c0d`
      expect(isVenusReportId(mercuryId)).toBe(false)
    })

    it('should return false for legacy IDs', () => {
      const legacyId = 'val_1729800000_abc123xyz'
      expect(isVenusReportId(legacyId)).toBe(false)
    })
  })

  describe('isMercuryReportId', () => {
    it('should return true for Mercury IDs', () => {
      const mercuryId = `val_${Date.now()}_m7a8b9c0d`
      expect(isMercuryReportId(mercuryId)).toBe(true)
    })

    it('should return false for Venus IDs', () => {
      const id = generateReportId()
      expect(isMercuryReportId(id)).toBe(false)
    })

    it('should return false for legacy IDs', () => {
      const legacyId = 'val_1729800000_abc123xyz'
      expect(isMercuryReportId(legacyId)).toBe(false)
    })
  })

  describe('getReportTimestamp', () => {
    it('should extract timestamp from Venus ID', () => {
      const before = Date.now()
      const id = generateReportId()
      const after = Date.now()

      const timestamp = getReportTimestamp(id)
      expect(timestamp).toBeGreaterThanOrEqual(before)
      expect(timestamp).toBeLessThanOrEqual(after)
    })

    it('should extract timestamp from Mercury ID', () => {
      const now = Date.now()
      const mercuryId = `val_${now}_m7a8b9c0d`
      expect(getReportTimestamp(mercuryId)).toBe(now)
    })

    it('should extract timestamp from legacy ID', () => {
      const timestamp = 1729800000
      const legacyId = `val_${timestamp}_abc123xyz`
      expect(getReportTimestamp(legacyId)).toBe(timestamp)
    })

    it('should return null for invalid ID', () => {
      expect(getReportTimestamp('invalid')).toBeNull()
    })
  })

  describe('Collision Prevention', () => {
    it('should NEVER generate IDs that could collide with Mercury', () => {
      // Generate 10,000 Venus IDs
      const venusIds = Array.from({ length: 10000 }, () => generateReportId())

      // Verify ALL start with 'v' prefix
      venusIds.forEach((id) => {
        const parts = id.split('_')
        expect(parts[2].charAt(0)).toBe('v')
      })

      // Simulate Mercury IDs with 'm' prefix
      const mercuryIds = Array.from(
        { length: 10000 },
        () => `val_${Date.now()}_m${Math.random().toString(36).substr(2, 9)}`
      )

      // Verify NO overlap between Venus and Mercury IDs
      const venusSet = new Set(venusIds)
      const mercurySet = new Set(mercuryIds)

      const intersection = new Set([...venusSet].filter((id) => mercurySet.has(id)))
      expect(intersection.size).toBe(0)
    })

    it('should maintain uniqueness under high concurrency', async () => {
      // Simulate concurrent ID generation
      const promises = Array.from({ length: 100 }, () => Promise.resolve(generateReportId()))

      const ids = await Promise.all(promises)
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(100)
    })

    it('should generate IDs with sufficient entropy', () => {
      const id = generateReportId()
      const parts = id.split('_')
      const randomPart = parts[2].substring(1) // Remove 'v' prefix

      // Should have at least 8 characters of randomness
      expect(randomPart.length).toBeGreaterThanOrEqual(8)

      // Should only contain lowercase alphanumeric
      expect(randomPart).toMatch(/^[a-z0-9]+$/)
    })
  })

  describe('Backward Compatibility', () => {
    it('should validate legacy IDs without source prefix', () => {
      const legacyIds = [
        'val_1729800000_abc123xyz',
        'val_1234567890_xyz789abc',
        'val_9876543210_def456ghi',
      ]

      legacyIds.forEach((id) => {
        expect(isValidReportId(id)).toBe(true)
        expect(getReportSource(id)).toBe('unknown')
      })
    })

    it('should extract timestamp from legacy IDs', () => {
      const legacyId = 'val_1729800000_abc123xyz'
      expect(getReportTimestamp(legacyId)).toBe(1729800000)
    })
  })

  describe('Edge Cases', () => {
    it('should handle rapid successive calls', () => {
      const ids = []
      for (let i = 0; i < 100; i++) {
        ids.push(generateReportId())
      }

      // All should be unique
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(100)

      // All should be valid
      ids.forEach((id) => {
        expect(isValidReportId(id)).toBe(true)
        expect(isVenusReportId(id)).toBe(true)
      })
    })

    it('should handle empty string gracefully', () => {
      expect(isValidReportId('')).toBe(false)
      expect(getReportSource('')).toBe('unknown')
      expect(getReportTimestamp('')).toBeNull()
    })

    it('should handle malformed IDs gracefully', () => {
      const malformed = ['val_', 'val_123_', 'val__abc', '_123_abc', 'val_abc_123']

      malformed.forEach((id) => {
        expect(isValidReportId(id)).toBe(false)
      })
    })
  })
})
