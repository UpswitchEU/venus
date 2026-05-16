/**
 * Application Errors Tests
 *
 * Comprehensive test coverage for custom error classes.
 *
 * @module utils/__tests__/ApplicationErrors.test
 */

import { describe, expect, it } from 'vitest'
import {
  ApplicationError,
  CalculationError,
  createErrorFromStatus,
  DatabaseError,
  DataQualityError,
  IntegrationError,
  isRetryableError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  RestorationError,
  SessionConflictError,
  TimeoutError,
  UnauthorizedError,
  ValidationError,
} from '../errors/ApplicationErrors'

describe('ApplicationErrors', () => {
  describe('ApplicationError', () => {
    it('should create error with all properties', () => {
      const error = new ApplicationError('Test error', 'TEST_CODE', { foo: 'bar' })

      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe('Test error')
      expect(error.code).toBe('TEST_CODE')
      expect(error.context).toEqual({ foo: 'bar' })
      expect(error.timestamp).toBeInstanceOf(Date)
      expect(error.name).toBe('ApplicationError')
    })

    it('should serialize to JSON', () => {
      const error = new ApplicationError('Test', 'TEST', { id: '123' })
      const json = error.toJSON()

      expect(json.name).toBe('ApplicationError')
      expect(json.message).toBe('Test')
      expect(json.code).toBe('TEST')
      expect(json.context).toEqual({ id: '123' })
      expect(json.timestamp).toBeDefined()
      expect(json.stack).toBeDefined()
    })

    it('should capture stack trace', () => {
      const error = new ApplicationError('Test', 'TEST')
      expect(error.stack).toBeDefined()
      expect(error.stack).toContain('ApplicationErrors.test')
    })
  })

  describe('ValidationError', () => {
    it('should extend ApplicationError', () => {
      const error = new ValidationError('Invalid email')

      expect(error).toBeInstanceOf(ApplicationError)
      expect(error).toBeInstanceOf(ValidationError)
      expect(error.code).toBe('VALIDATION_ERROR')
    })

    it('should include context', () => {
      const error = new ValidationError('Invalid email', { email: 'invalid' })
      expect(error.context).toEqual({ email: 'invalid' })
    })
  })

  describe('SessionConflictError', () => {
    it('should include reportId', () => {
      const error = new SessionConflictError('Session exists', 'val_123')

      expect(error.reportId).toBe('val_123')
      expect(error.code).toBe('SESSION_CONFLICT')
      expect(error.context?.reportId).toBe('val_123')
    })

    it('should merge context with reportId', () => {
      const error = new SessionConflictError('Session exists', 'val_123', { user: 'test' })

      expect(error.context).toEqual({
        reportId: 'val_123',
        user: 'test',
      })
    })
  })

  describe('NetworkError', () => {
    it('should have default message', () => {
      const error = new NetworkError()
      expect(error.message).toBe('Network request failed')
      expect(error.code).toBe('NETWORK_ERROR')
    })

    it('should accept custom message', () => {
      const error = new NetworkError('Connection timeout')
      expect(error.message).toBe('Connection timeout')
    })
  })

  describe('RestorationError', () => {
    it('should include sessionId', () => {
      const error = new RestorationError('Restoration failed', 'val_123')

      expect(error.sessionId).toBe('val_123')
      expect(error.code).toBe('RESTORATION_ERROR')
      expect(error.context?.sessionId).toBe('val_123')
    })
  })

  describe('RateLimitError', () => {
    it('should have default message', () => {
      const error = new RateLimitError()
      expect(error.message).toBe('Rate limit exceeded')
      expect(error.code).toBe('RATE_LIMIT_ERROR')
    })

    it('should include retry-after in context', () => {
      const error = new RateLimitError('Too many requests', { retryAfter: 60 })
      expect(error.context?.retryAfter).toBe(60)
    })
  })

  describe('NotFoundError', () => {
    it('should format message correctly', () => {
      const error = new NotFoundError('Session', 'val_123')

      expect(error.message).toBe('Session not found: val_123')
      expect(error.resourceType).toBe('Session')
      expect(error.resourceId).toBe('val_123')
      expect(error.code).toBe('NOT_FOUND')
    })

    it('should include resource info in context', () => {
      const error = new NotFoundError('Report', 'report_456')

      expect(error.context?.resourceType).toBe('Report')
      expect(error.context?.resourceId).toBe('report_456')
    })
  })

  describe('UnauthorizedError', () => {
    it('should have default message', () => {
      const error = new UnauthorizedError()
      expect(error.message).toBe('Authentication required')
      expect(error.code).toBe('UNAUTHORIZED')
    })
  })

  describe('TimeoutError', () => {
    it('should include timeout duration', () => {
      const error = new TimeoutError('Request timed out', 30000)

      expect(error.timeout_ms).toBe(30000)
      expect(error.context?.timeout_ms).toBe(30000)
      expect(error.code).toBe('TIMEOUT_ERROR')
    })
  })

  describe('isRetryableError', () => {
    it('should identify retryable errors', () => {
      expect(isRetryableError(new NetworkError())).toBe(true)
      expect(isRetryableError(new RateLimitError())).toBe(true)
      expect(isRetryableError(new TimeoutError('timeout', 5000))).toBe(true)
      expect(isRetryableError(new IntegrationError('API down', 'KBO'))).toBe(true)
    })

    it('should identify non-retryable errors', () => {
      expect(isRetryableError(new ValidationError('Invalid'))).toBe(false)
      expect(isRetryableError(new CalculationError('Math error'))).toBe(false)
      expect(isRetryableError(new DataQualityError('Bad data'))).toBe(false)
      expect(isRetryableError(new Error('Generic'))).toBe(false)
    })
  })

  describe('createErrorFromStatus', () => {
    it('should create ValidationError for 400', () => {
      const error = createErrorFromStatus(400, 'Invalid input')

      expect(error).toBeInstanceOf(ValidationError)
      expect(error.message).toBe('Invalid input')
    })

    it('should create UnauthorizedError for 401', () => {
      const error = createErrorFromStatus(401, 'Auth required')

      expect(error).toBeInstanceOf(UnauthorizedError)
    })

    it('should create NotFoundError for 404', () => {
      const error = createErrorFromStatus(404, 'Not found', {
        resourceType: 'Session',
        resourceId: 'val_123',
      })

      expect(error).toBeInstanceOf(NotFoundError)
      expect(error.resourceType).toBe('Session')
      expect(error.resourceId).toBe('val_123')
    })

    it('should create SessionConflictError for 409', () => {
      const error = createErrorFromStatus(409, 'Conflict', {
        reportId: 'val_123',
      })

      expect(error).toBeInstanceOf(SessionConflictError)
      expect(error.reportId).toBe('val_123')
    })

    it('should create RateLimitError for 429', () => {
      const error = createErrorFromStatus(429, 'Too many requests')

      expect(error).toBeInstanceOf(RateLimitError)
    })

    it('should create CalculationError for 500', () => {
      const error = createErrorFromStatus(500, 'Server error')

      expect(error).toBeInstanceOf(CalculationError)
    })

    it('should create IntegrationError for 502', () => {
      const error = createErrorFromStatus(502, 'Gateway error', {
        service: 'KBO',
      })

      expect(error).toBeInstanceOf(IntegrationError)
      expect(error.service).toBe('KBO')
    })

    it('should create DatabaseError for 503', () => {
      const error = createErrorFromStatus(503, 'Service unavailable')

      expect(error).toBeInstanceOf(DatabaseError)
    })

    it('should create TimeoutError for 504', () => {
      const error = createErrorFromStatus(504, 'Gateway timeout', {
        timeout_ms: 30000,
      })

      expect(error).toBeInstanceOf(TimeoutError)
      expect(error.timeout_ms).toBe(30000)
    })

    it('should create ApplicationError for unknown status', () => {
      const error = createErrorFromStatus(418, "I'm a teapot")

      expect(error).toBeInstanceOf(ApplicationError)
      expect(error.code).toBe('UNKNOWN_ERROR')
    })

    it('should preserve context in all error types', () => {
      const context = { userId: '123', attempt: 2 }
      const error = createErrorFromStatus(400, 'Test', context)

      expect(error.context).toMatchObject(context)
    })
  })

  describe('Error Inheritance Chain', () => {
    it('should maintain proper inheritance', () => {
      const validation = new ValidationError('test')
      const network = new NetworkError()
      const conflict = new SessionConflictError('test', 'val_123')

      // All should be ApplicationError
      expect(validation).toBeInstanceOf(ApplicationError)
      expect(network).toBeInstanceOf(ApplicationError)
      expect(conflict).toBeInstanceOf(ApplicationError)

      // But maintain specific types
      expect(validation).toBeInstanceOf(ValidationError)
      expect(network).toBeInstanceOf(NetworkError)
      expect(conflict).toBeInstanceOf(SessionConflictError)
    })

    it('should all extend Error', () => {
      const errors = [
        new ValidationError('test'),
        new NetworkError(),
        new SessionConflictError('test', 'id'),
        new RateLimitError(),
        new NotFoundError('type', 'id'),
      ]

      errors.forEach((error) => {
        expect(error).toBeInstanceOf(Error)
        expect(error).toBeInstanceOf(ApplicationError)
      })
    })
  })
})
