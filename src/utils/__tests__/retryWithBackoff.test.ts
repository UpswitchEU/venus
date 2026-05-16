/**
 * Retry With Backoff Tests
 *
 * Test exponential backoff retry logic.
 *
 * @module utils/__tests__/retryWithBackoff.test
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NetworkError, RateLimitError, ValidationError } from '../errors/ApplicationErrors'
import { retryPresets, retryWithBackoff } from '../retryWithBackoff'

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('success scenarios', () => {
    it('should return result on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success')

      const result = await retryWithBackoff(fn, { maxRetries: 3 })

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should return result after retries', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new NetworkError())
        .mockRejectedValueOnce(new NetworkError())
        .mockResolvedValueOnce('success')

      const result = await retryWithBackoff(fn, {
        maxRetries: 3,
        initialDelay: 10,
      })

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(3)
    })
  })

  describe('failure scenarios', () => {
    it('should throw after max retries exhausted', async () => {
      const fn = vi.fn().mockRejectedValue(new NetworkError('Connection failed'))

      await expect(
        retryWithBackoff(fn, {
          maxRetries: 2,
          initialDelay: 10,
        })
      ).rejects.toThrow('Connection failed')

      expect(fn).toHaveBeenCalledTimes(3) // Initial + 2 retries
    })

    it('should not retry non-retryable errors', async () => {
      const fn = vi.fn().mockRejectedValue(new ValidationError('Invalid input'))

      await expect(retryWithBackoff(fn, { maxRetries: 3 })).rejects.toThrow('Invalid input')

      // Should fail immediately without retries
      expect(fn).toHaveBeenCalledTimes(1)
    })
  })

  describe('exponential backoff', () => {
    it('should increase delay exponentially', async () => {
      const delays: number[] = []
      const fn = vi.fn().mockRejectedValue(new NetworkError())

      const _startTime = Date.now()

      await expect(
        retryWithBackoff(fn, {
          maxRetries: 3,
          initialDelay: 50,
          maxDelay: 500,
          backoffMultiplier: 2,
          onRetry: (attempt, error, delay) => {
            delays.push(delay)
          },
        })
      ).rejects.toThrow()

      // Delays should be: 50ms, 100ms, 200ms
      expect(delays).toHaveLength(3)
      expect(delays[0]).toBe(50)
      expect(delays[1]).toBe(100)
      expect(delays[2]).toBe(200)
    })

    it('should cap delay at maxDelay', async () => {
      const delays: number[] = []
      const fn = vi.fn().mockRejectedValue(new NetworkError())

      await expect(
        retryWithBackoff(fn, {
          maxRetries: 5,
          initialDelay: 500,
          maxDelay: 1000,
          backoffMultiplier: 2,
          onRetry: (attempt, error, delay) => {
            delays.push(delay)
          },
        })
      ).rejects.toThrow()

      // All delays should be capped at 1000ms
      delays.forEach((delay) => {
        expect(delay).toBeLessThanOrEqual(1000)
      })
    })
  })

  describe('callbacks', () => {
    it('should call onRetry callback', async () => {
      const fn = vi.fn().mockRejectedValueOnce(new NetworkError()).mockResolvedValueOnce('success')

      const onRetry = vi.fn()

      await retryWithBackoff(fn, {
        maxRetries: 2,
        initialDelay: 10,
        onRetry,
      })

      expect(onRetry).toHaveBeenCalledTimes(1)
      expect(onRetry).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(NetworkError),
        expect.any(Number)
      )
    })

    it('should call onFailure callback when exhausted', async () => {
      const fn = vi.fn().mockRejectedValue(new RateLimitError())
      const onFailure = vi.fn()

      await expect(
        retryWithBackoff(fn, {
          maxRetries: 2,
          initialDelay: 10,
          onFailure,
        })
      ).rejects.toThrow()

      expect(onFailure).toHaveBeenCalledTimes(1)
      expect(onFailure).toHaveBeenCalledWith(
        expect.any(RateLimitError),
        3 // Total attempts
      )
    })
  })

  describe('custom retryable errors', () => {
    it('should only retry specified error types', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new RateLimitError())
        .mockResolvedValueOnce('success')

      // Only retry RateLimitError
      const result = await retryWithBackoff(fn, {
        maxRetries: 2,
        initialDelay: 10,
        retryableErrors: [RateLimitError],
      })

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should not retry errors not in custom list', async () => {
      const fn = vi.fn().mockRejectedValue(new NetworkError())

      await expect(
        retryWithBackoff(fn, {
          maxRetries: 2,
          retryableErrors: [RateLimitError], // Only retry rate limits
        })
      ).rejects.toThrow()

      // Should fail immediately
      expect(fn).toHaveBeenCalledTimes(1)
    })
  })

  describe('retryPresets', () => {
    it('should have session preset', () => {
      expect(retryPresets.session).toBeDefined()
      expect(retryPresets.session.maxRetries).toBe(2)
      expect(retryPresets.session.initialDelay).toBe(200)
      expect(retryPresets.session.maxDelay).toBe(3000)
    })

    it('should have restoration preset', () => {
      expect(retryPresets.restoration).toBeDefined()
      expect(retryPresets.restoration.maxRetries).toBe(2)
    })

    it('should have api preset', () => {
      expect(retryPresets.api).toBeDefined()
    })
  })
})
