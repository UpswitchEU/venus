/**
 * Error Guards Tests
 *
 * Test type-safe error guards for instanceof checking.
 *
 * @module utils/__tests__/errorGuards.test
 */

import { describe, expect, it } from 'vitest'
import {
  NetworkError,
  NotFoundError,
  RateLimitError,
  SessionConflictError,
  ValidationError,
} from '../errors/ApplicationErrors'
import {
  isNetworkError,
  isNotFoundError,
  isRateLimitError,
  isRecoverable,
  isRetryable,
  isSessionConflictError,
  isValidationError,
} from '../errors/errorGuards'

describe('errorGuards', () => {
  describe('isValidationError', () => {
    it('should return true for ValidationError', () => {
      const error = new ValidationError('Invalid')
      expect(isValidationError(error)).toBe(true)
    })

    it('should return false for other errors', () => {
      expect(isValidationError(new NetworkError())).toBe(false)
      expect(isValidationError(new Error('Generic'))).toBe(false)
      expect(isValidationError(null)).toBe(false)
    })
  })

  describe('isSessionConflictError', () => {
    it('should return true for SessionConflictError', () => {
      const error = new SessionConflictError('Conflict', 'val_123')
      expect(isSessionConflictError(error)).toBe(true)
    })

    it('should return false for other errors', () => {
      expect(isSessionConflictError(new ValidationError('test'))).toBe(false)
    })
  })

  describe('isNetworkError', () => {
    it('should return true for NetworkError', () => {
      const error = new NetworkError()
      expect(isNetworkError(error)).toBe(true)
    })
  })

  describe('isRateLimitError', () => {
    it('should return true for RateLimitError', () => {
      const error = new RateLimitError()
      expect(isRateLimitError(error)).toBe(true)
    })
  })

  describe('isNotFoundError', () => {
    it('should return true for NotFoundError', () => {
      const error = new NotFoundError('Session', 'val_123')
      expect(isNotFoundError(error)).toBe(true)
    })
  })

  describe('isRetryable', () => {
    it('should identify retryable errors', () => {
      expect(isRetryable(new NetworkError())).toBe(true)
      expect(isRetryable(new RateLimitError())).toBe(true)
    })

    it('should identify non-retryable errors', () => {
      expect(isRetryable(new ValidationError('test'))).toBe(false)
      expect(isRetryable(new SessionConflictError('test', 'id'))).toBe(false)
    })
  })

  describe('isRecoverable', () => {
    it('should identify recoverable errors', () => {
      expect(isRecoverable(new ValidationError('test'))).toBe(true)
      expect(isRecoverable(new NetworkError())).toBe(true)
      expect(isRecoverable(new SessionConflictError('test', 'id'))).toBe(true)
    })
  })
})
