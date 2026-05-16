/**
 * Request Deduplication Tests
 *
 * Test concurrent request deduplication logic.
 *
 * @module utils/__tests__/requestDeduplication.test
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestDeduplicator } from '../requestDeduplication'

describe('RequestDeduplicator', () => {
  let deduplicator: RequestDeduplicator

  beforeEach(() => {
    deduplicator = new RequestDeduplicator()
  })

  describe('deduplicate', () => {
    it('should execute function on first call', async () => {
      const fn = vi.fn().mockResolvedValue('result')

      const result = await deduplicator.deduplicate('key1', fn)

      expect(fn).toHaveBeenCalledTimes(1)
      expect(result).toBe('result')
    })

    it('should return same promise for concurrent calls', async () => {
      let resolveCount = 0
      const fn = vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolveCount++
            resolve(`result-${resolveCount}`)
          }, 100)
        })
      })

      // Start two concurrent requests
      const promise1 = deduplicator.deduplicate('key1', fn)
      const promise2 = deduplicator.deduplicate('key1', fn)

      // Should be same promise
      expect(promise1).toBe(promise2)

      const [result1, result2] = await Promise.all([promise1, promise2])

      // Function called only once
      expect(fn).toHaveBeenCalledTimes(1)

      // Both get same result
      expect(result1).toBe(result2)
      expect(result1).toBe('result-1')
    })

    it('should allow new call after first completes', async () => {
      const fn = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second')

      const result1 = await deduplicator.deduplicate('key1', fn)
      const result2 = await deduplicator.deduplicate('key1', fn)

      expect(fn).toHaveBeenCalledTimes(2)
      expect(result1).toBe('first')
      expect(result2).toBe('second')
    })

    it('should deduplicate different keys separately', async () => {
      const fn1 = vi.fn().mockResolvedValue('result1')
      const fn2 = vi.fn().mockResolvedValue('result2')

      const [result1, result2] = await Promise.all([
        deduplicator.deduplicate('key1', fn1),
        deduplicator.deduplicate('key2', fn2),
      ])

      expect(fn1).toHaveBeenCalledTimes(1)
      expect(fn2).toHaveBeenCalledTimes(1)
      expect(result1).toBe('result1')
      expect(result2).toBe('result2')
    })

    it('should remove from pending after error', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('First call fails'))
        .mockResolvedValueOnce('Second call succeeds')

      // First call fails
      await expect(deduplicator.deduplicate('key1', fn)).rejects.toThrow('First call fails')

      // Second call should execute (not deduplicated)
      const result = await deduplicator.deduplicate('key1', fn)

      expect(fn).toHaveBeenCalledTimes(2)
      expect(result).toBe('Second call succeeds')
    })

    it('should handle errors in concurrent calls', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Failed'))

      const promise1 = deduplicator.deduplicate('key1', fn)
      const promise2 = deduplicator.deduplicate('key1', fn)

      // Both should fail with same error
      await expect(promise1).rejects.toThrow('Failed')
      await expect(promise2).rejects.toThrow('Failed')

      // Function called only once
      expect(fn).toHaveBeenCalledTimes(1)
    })
  })

  describe('clear', () => {
    it('should clear all pending requests', () => {
      const fn = vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 1000)))

      deduplicator.deduplicate('key1', fn)
      deduplicator.deduplicate('key2', fn)

      expect(deduplicator.getStats().pending).toBe(2)

      deduplicator.clear()

      expect(deduplicator.getStats().pending).toBe(0)
    })
  })

  describe('clearKey', () => {
    it('should clear specific key', () => {
      const fn = vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 1000)))

      deduplicator.deduplicate('key1', fn)
      deduplicator.deduplicate('key2', fn)

      deduplicator.clearKey('key1')

      expect(deduplicator.getStats().pending).toBe(1)
    })
  })

  describe('getStats', () => {
    it('should track statistics', async () => {
      const fn1 = vi.fn().mockResolvedValue('result')
      const fn2 = vi.fn().mockResolvedValue('result')

      // First call - executes
      await deduplicator.deduplicate('key1', fn1)

      // Second call with same key before first completes - deduplicated
      const promise1 = deduplicator.deduplicate('key1', fn1)
      const promise2 = deduplicator.deduplicate('key1', fn2) // Concurrent

      await Promise.all([promise1, promise2])

      const stats = deduplicator.getStats()

      expect(stats.total).toBeGreaterThan(0)
      expect(stats.executed).toBeGreaterThan(0)
      expect(stats.deduplicationRate).toBeGreaterThanOrEqual(0)
    })

    it('should calculate deduplication rate', async () => {
      const fn = vi.fn().mockResolvedValue('result')

      await deduplicator.deduplicate('key1', fn)
      await deduplicator.deduplicate('key2', fn)

      const stats = deduplicator.getStats()

      expect(stats.executed).toBe(2)
      expect(stats.total).toBe(2)
      expect(stats.deduplicationRate).toBe(0)
    })
  })

  describe('resetStats', () => {
    it('should reset statistics', async () => {
      const fn = vi.fn().mockResolvedValue('result')

      await deduplicator.deduplicate('key1', fn)

      expect(deduplicator.getStats().total).toBe(1)

      deduplicator.resetStats()

      const stats = deduplicator.getStats()
      expect(stats.total).toBe(0)
      expect(stats.executed).toBe(0)
      expect(stats.deduplicated).toBe(0)
    })
  })
})
