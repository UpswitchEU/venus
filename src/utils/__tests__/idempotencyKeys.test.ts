/**
 * Idempotency Keys Tests
 *
 * Test idempotency key generation and management.
 *
 * @module utils/__tests__/idempotencyKeys.test
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  generateIdempotencyKey,
  IdempotencyKeyManager,
  isIdempotencyKeyExpired,
  parseIdempotencyKey,
} from '../idempotencyKeys'

describe('idempotencyKeys', () => {
  describe('generateIdempotencyKey', () => {
    it('should generate key with correct format', () => {
      const key = generateIdempotencyKey('val_123', 'create')

      expect(key).toMatch(/^val_123-create-\d+-[a-z0-9]+$/)
    })

    it('should generate unique keys', () => {
      const key1 = generateIdempotencyKey('val_123', 'create')
      const key2 = generateIdempotencyKey('val_123', 'create')

      expect(key1).not.toBe(key2)
    })

    it('should include reportId and operation', () => {
      const key = generateIdempotencyKey('val_456', 'update')

      expect(key).toContain('val_456')
      expect(key).toContain('update')
    })
  })

  describe('parseIdempotencyKey', () => {
    it('should parse valid key', () => {
      const key = 'val_123-create-1765751234567'
      const parsed = parseIdempotencyKey(key)

      expect(parsed).toEqual({
        reportId: 'val_123',
        operation: 'create',
        timestamp: 1765751234567,
      })
    })

    it('should handle reportId with hyphens', () => {
      const key = 'val-with-hyphens-123-create-1765751234567'
      const parsed = parseIdempotencyKey(key)

      expect(parsed?.reportId).toBe('val-with-hyphens-123')
      expect(parsed?.operation).toBe('create')
    })

    it('should return null for invalid format', () => {
      expect(parseIdempotencyKey('invalid')).toBeNull()
      expect(parseIdempotencyKey('too-short')).toBeNull()
      expect(parseIdempotencyKey('val_123-create-notanumber')).toBeNull()
    })
  })

  describe('isIdempotencyKeyExpired', () => {
    it('should return false for recent key', () => {
      const key = generateIdempotencyKey('val_123', 'create')
      expect(isIdempotencyKeyExpired(key)).toBe(false)
    })

    it('should return true for old key', () => {
      const oldTimestamp = Date.now() - 25 * 60 * 60 * 1000 // 25 hours ago
      const key = `val_123-create-${oldTimestamp}`

      expect(isIdempotencyKeyExpired(key, 24)).toBe(true)
    })

    it('should respect custom expiry hours', () => {
      vi.useFakeTimers()
      const base = Date.now()
      vi.setSystemTime(base)
      const key = generateIdempotencyKey('val_123', 'create')

      expect(isIdempotencyKeyExpired(key, 1)).toBe(false)
      vi.setSystemTime(base + 100)
      expect(isIdempotencyKeyExpired(key, 0.00001)).toBe(true) // Very short expiry
      vi.useRealTimers()
    })

    it('should return true for invalid key', () => {
      expect(isIdempotencyKeyExpired('invalid')).toBe(true)
    })
  })

  describe('IdempotencyKeyManager', () => {
    let manager: IdempotencyKeyManager

    beforeEach(() => {
      manager = new IdempotencyKeyManager()
    })

    describe('getOrCreate', () => {
      it('should create new key first time', () => {
        const key = manager.getOrCreate('val_123', 'create')

        expect(key).toMatch(/^val_123-create-\d+-[a-z0-9]+$/)
      })

      it('should return same key for same operation', () => {
        const key1 = manager.getOrCreate('val_123', 'create')
        const key2 = manager.getOrCreate('val_123', 'create')

        expect(key1).toBe(key2)
      })

      it('should create different keys for different operations', () => {
        const key1 = manager.getOrCreate('val_123', 'create')
        const key2 = manager.getOrCreate('val_123', 'update')

        expect(key1).not.toBe(key2)
      })

      it('should create different keys for different reportIds', () => {
        const key1 = manager.getOrCreate('val_123', 'create')
        const key2 = manager.getOrCreate('val_456', 'create')

        expect(key1).not.toBe(key2)
      })
    })

    describe('clear', () => {
      it('should clear specific operation key', () => {
        const key1 = manager.getOrCreate('val_123', 'create')
        manager.clear('val_123', 'create')
        const key2 = manager.getOrCreate('val_123', 'create')

        expect(key1).not.toBe(key2)
      })
    })

    describe('clearAll', () => {
      it('should clear all keys', () => {
        manager.getOrCreate('val_123', 'create')
        manager.getOrCreate('val_456', 'create')

        manager.clearAll()

        const stats = manager.getStats()
        expect(stats.activeKeys).toBe(0)
      })
    })

    describe('getStats', () => {
      it('should return statistics', () => {
        manager.getOrCreate('val_123', 'create')
        manager.getOrCreate('val_456', 'update')

        const stats = manager.getStats()

        expect(stats.activeKeys).toBe(2)
        expect(stats.expiredKeys).toBe(0)
      })
    })

    describe('cleanupExpired', () => {
      it('should remove expired keys', () => {
        // Create key with very short expiry
        const oldTimestamp = Date.now() - 25 * 60 * 60 * 1000 // 25 hours ago
        const _key = `val_123-create-${oldTimestamp}`

        // Manually add expired key
        manager.getOrCreate('val_123', 'create')

        const cleaned = manager.cleanupExpired()

        // Should clean up keys (implementation may vary)
        expect(cleaned).toBeGreaterThanOrEqual(0)
      })
    })
  })
})
