/**
 * Circuit Breaker Tests
 *
 * Test circuit breaker state machine and failure protection.
 *
 * @module utils/__tests__/circuitBreaker.test
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CircuitBreaker } from '../circuitBreaker'
import { NetworkError } from '../errors/ApplicationErrors'

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 100, // Short timeout for testing
      successThreshold: 2,
      name: 'TestBreaker',
    })
  })

  describe('CLOSED state (normal operation)', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe('CLOSED')
    })

    it('should execute function successfully', async () => {
      const fn = vi.fn().mockResolvedValue('success')

      const result = await breaker.execute(fn)

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
      expect(breaker.getState()).toBe('CLOSED')
    })

    it('should transition to OPEN after threshold failures', async () => {
      const fn = vi.fn().mockRejectedValue(new NetworkError())

      // Fail 3 times (threshold)
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow()
      }

      expect(breaker.getState()).toBe('OPEN')
      expect(fn).toHaveBeenCalledTimes(3)
    })
  })

  describe('OPEN state (fast-fail)', () => {
    beforeEach(async () => {
      // Open the circuit
      const fn = vi.fn().mockRejectedValue(new NetworkError())
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow()
      }
    })

    it('should fast-fail without executing function', async () => {
      const fn = vi.fn().mockResolvedValue('success')

      await expect(breaker.execute(fn)).rejects.toThrow(/Circuit breaker is OPEN/)

      // Function should NOT be called (fast-fail)
      expect(fn).not.toHaveBeenCalled()
    })

    it('should transition to HALF_OPEN after timeout', async () => {
      expect(breaker.getState()).toBe('OPEN')

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150))

      const fn = vi.fn().mockResolvedValue('success')
      await breaker.execute(fn)

      expect(breaker.getState()).toBe('HALF_OPEN')
    })
  })

  describe('HALF_OPEN state (testing recovery)', () => {
    beforeEach(async () => {
      // Open circuit
      const fn = vi.fn().mockRejectedValue(new NetworkError())
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow()
      }

      // Wait for reset
      await new Promise((resolve) => setTimeout(resolve, 150))
    })

    it('should transition to CLOSED after success threshold', async () => {
      const fn = vi.fn().mockResolvedValue('success')

      // Need 2 successes (successThreshold)
      await breaker.execute(fn)
      expect(breaker.getState()).toBe('HALF_OPEN')

      await breaker.execute(fn)
      expect(breaker.getState()).toBe('CLOSED')

      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should transition back to OPEN on any failure', async () => {
      const fn = vi.fn().mockResolvedValueOnce('success').mockRejectedValueOnce(new NetworkError())

      // First success
      await breaker.execute(fn)
      expect(breaker.getState()).toBe('HALF_OPEN')

      // Second call fails
      await expect(breaker.execute(fn)).rejects.toThrow()
      expect(breaker.getState()).toBe('OPEN')
    })
  })

  describe('getStats', () => {
    it('should return current statistics', async () => {
      const fn = vi.fn().mockResolvedValueOnce('success').mockRejectedValueOnce(new NetworkError())

      await breaker.execute(fn)
      await expect(breaker.execute(fn)).rejects.toThrow()

      const stats = breaker.getStats()

      expect(stats.state).toBe('CLOSED')
      expect(stats.totalCalls).toBe(2)
      expect(stats.failures).toBe(1)
      // Success counter resets on failure (tracks consecutive successes in HALF_OPEN)
      expect(stats.successes).toBe(0)
      expect(stats.lastSuccessTime).toBeInstanceOf(Date)
      expect(stats.lastFailureTime).toBeInstanceOf(Date)
    })
  })

  describe('reset', () => {
    it('should manually reset to CLOSED state', async () => {
      // Open circuit
      const fn = vi.fn().mockRejectedValue(new NetworkError())
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow()
      }

      expect(breaker.getState()).toBe('OPEN')

      breaker.reset()

      expect(breaker.getState()).toBe('CLOSED')
      expect(breaker.getStats().failures).toBe(0)
    })
  })

  describe('destroy', () => {
    it('should clear timers', () => {
      // No error should be thrown
      expect(() => breaker.destroy()).not.toThrow()
    })
  })
})

/**
 * Circuit Breaker Tests
 *
 * Test circuit breaker state machine and failure protection.
 *
 * @module utils/__tests__/circuitBreaker.test
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CircuitBreaker } from '../circuitBreaker'
import { NetworkError } from '../errors/ApplicationErrors'

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 100, // Short timeout for testing
      successThreshold: 2,
      name: 'TestBreaker',
    })
  })

  describe('CLOSED state (normal operation)', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe('CLOSED')
    })

    it('should execute function successfully', async () => {
      const fn = vi.fn().mockResolvedValue('success')

      const result = await breaker.execute(fn)

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
      expect(breaker.getState()).toBe('CLOSED')
    })

    it('should transition to OPEN after threshold failures', async () => {
      const fn = vi.fn().mockRejectedValue(new NetworkError())

      // Fail 3 times (threshold)
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow()
      }

      expect(breaker.getState()).toBe('OPEN')
      expect(fn).toHaveBeenCalledTimes(3)
    })
  })

  describe('OPEN state (fast-fail)', () => {
    beforeEach(async () => {
      // Open the circuit
      const fn = vi.fn().mockRejectedValue(new NetworkError())
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow()
      }
    })

    it('should fast-fail without executing function', async () => {
      const fn = vi.fn().mockResolvedValue('success')

      await expect(breaker.execute(fn)).rejects.toThrow(/Circuit breaker is OPEN/)

      // Function should NOT be called (fast-fail)
      expect(fn).not.toHaveBeenCalled()
    })

    it('should transition to HALF_OPEN after timeout', async () => {
      expect(breaker.getState()).toBe('OPEN')

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150))

      const fn = vi.fn().mockResolvedValue('success')
      await breaker.execute(fn)

      expect(breaker.getState()).toBe('HALF_OPEN')
    })
  })

  describe('HALF_OPEN state (testing recovery)', () => {
    beforeEach(async () => {
      // Open circuit
      const fn = vi.fn().mockRejectedValue(new NetworkError())
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow()
      }

      // Wait for reset
      await new Promise((resolve) => setTimeout(resolve, 150))
    })

    it('should transition to CLOSED after success threshold', async () => {
      const fn = vi.fn().mockResolvedValue('success')

      // Need 2 successes (successThreshold)
      await breaker.execute(fn)
      expect(breaker.getState()).toBe('HALF_OPEN')

      await breaker.execute(fn)
      expect(breaker.getState()).toBe('CLOSED')

      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should transition back to OPEN on any failure', async () => {
      const fn = vi.fn().mockResolvedValueOnce('success').mockRejectedValueOnce(new NetworkError())

      // First success
      await breaker.execute(fn)
      expect(breaker.getState()).toBe('HALF_OPEN')

      // Second call fails
      await expect(breaker.execute(fn)).rejects.toThrow()
      expect(breaker.getState()).toBe('OPEN')
    })
  })

  describe('getStats', () => {
    it('should return current statistics', async () => {
      const fn = vi.fn().mockResolvedValueOnce('success').mockRejectedValueOnce(new NetworkError())

      await breaker.execute(fn)
      await expect(breaker.execute(fn)).rejects.toThrow()

      const stats = breaker.getStats()

      expect(stats.state).toBe('CLOSED')
      expect(stats.totalCalls).toBe(2)
      expect(stats.failures).toBe(1)
      // Success counter resets on failure (tracks consecutive successes in HALF_OPEN)
      expect(stats.successes).toBe(0)
      expect(stats.lastSuccessTime).toBeInstanceOf(Date)
      expect(stats.lastFailureTime).toBeInstanceOf(Date)
    })
  })

  describe('reset', () => {
    it('should manually reset to CLOSED state', async () => {
      // Open circuit
      const fn = vi.fn().mockRejectedValue(new NetworkError())
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow()
      }

      expect(breaker.getState()).toBe('OPEN')

      breaker.reset()

      expect(breaker.getState()).toBe('CLOSED')
      expect(breaker.getStats().failures).toBe(0)
    })
  })

  describe('destroy', () => {
    it('should clear timers', () => {
      // No error should be thrown
      expect(() => breaker.destroy()).not.toThrow()
    })
  })
})
