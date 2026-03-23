/**
 * Error Detection Utilities Tests
 *
 * @module utils/__tests__/errorDetection.test
 */

import { describe, expect, it } from 'vitest'
import { ApplicationError, AuthenticationError } from '../../types/errors'
import {
  collectErrorChain,
  extractErrorMessage,
  extractStatusCode,
  is401Unauthorized,
  is404NotFound,
  is409Conflict,
  is429RateLimit,
  isAuthError,
} from '../errorDetection'

describe('errorDetection', () => {
  describe('is409Conflict', () => {
    it('should detect AxiosError with 409 status', () => {
      const error = {
        response: { status: 409 },
        message: 'Conflict',
      }
      expect(is409Conflict(error)).toBe(true)
    })

    it('should detect APIError with statusCode 409', () => {
      const error = {
        statusCode: 409,
        message: 'Session conflict',
      }
      expect(is409Conflict(error)).toBe(true)
    })

    it('should detect generic error with status 409', () => {
      const error = {
        status: 409,
        message: 'Conflict',
      }
      expect(is409Conflict(error)).toBe(true)
    })

    it('should return false for non-409 errors', () => {
      expect(is409Conflict({ status: 404 })).toBe(false)
      expect(is409Conflict({ statusCode: 500 })).toBe(false)
      expect(is409Conflict(null)).toBe(false)
      expect(is409Conflict(undefined)).toBe(false)
    })
  })

  describe('is404NotFound', () => {
    it('should detect 404 errors', () => {
      expect(is404NotFound({ response: { status: 404 } })).toBe(true)
      expect(is404NotFound({ status: 404 })).toBe(true)
      expect(is404NotFound({ statusCode: 404 })).toBe(true)
    })

    it('should return false for non-404 errors', () => {
      expect(is404NotFound({ status: 409 })).toBe(false)
    })
  })

  describe('is401Unauthorized', () => {
    it('should detect 401 errors', () => {
      expect(is401Unauthorized({ response: { status: 401 } })).toBe(true)
      expect(is401Unauthorized({ status: 401 })).toBe(true)
      expect(is401Unauthorized({ statusCode: 401 })).toBe(true)
    })
  })

  describe('collectErrorChain', () => {
    it('should include nested context.originalError', () => {
      const inner = { response: { status: 401 } }
      const wrapped = new ApplicationError('wrapped', 'X', { originalError: inner })
      const chain = collectErrorChain(wrapped)
      expect(chain).toHaveLength(2)
      expect(chain[1]).toBe(inner)
    })
  })

  describe('isAuthError', () => {
    it('should detect AuthenticationError without HTTP fields', () => {
      expect(isAuthError(new AuthenticationError('Session invalid'))).toBe(true)
    })

    it('should unwrap ApplicationError.context.originalError for 401', () => {
      const axiosLike = { response: { status: 401 } }
      const wrapped = new ApplicationError('fail', 'VALUATION_CALCULATION_FAILED', {
        originalError: axiosLike,
      })
      expect(isAuthError(wrapped)).toBe(true)
    })

    it('should unwrap ApplicationError.context.originalError for AuthenticationError', () => {
      const inner = new AuthenticationError('auth')
      const wrapped = new ApplicationError('fail', 'X', { originalError: inner })
      expect(isAuthError(wrapped)).toBe(true)
    })
  })

  describe('is429RateLimit', () => {
    it('should detect 429 errors', () => {
      expect(is429RateLimit({ response: { status: 429 } })).toBe(true)
      expect(is429RateLimit({ status: 429 })).toBe(true)
      expect(is429RateLimit({ statusCode: 429 })).toBe(true)
    })
  })

  describe('extractErrorMessage', () => {
    it('should extract message from Error instance', () => {
      const error = new Error('Test error')
      expect(extractErrorMessage(error)).toBe('Test error')
    })

    it('should return string errors directly', () => {
      expect(extractErrorMessage('String error')).toBe('String error')
    })

    it('should extract message from object', () => {
      expect(extractErrorMessage({ message: 'Object error' })).toBe('Object error')
      expect(extractErrorMessage({ error: 'Error prop' })).toBe('Error prop')
    })

    it('should return default for unknown errors', () => {
      expect(extractErrorMessage(null)).toBe('Unknown error')
      expect(extractErrorMessage(undefined)).toBe('Unknown error')
      expect(extractErrorMessage({})).toBe('Unknown error')
    })
  })

  describe('extractStatusCode', () => {
    it('should extract status code from various error structures', () => {
      expect(extractStatusCode({ response: { status: 409 } })).toBe(409)
      expect(extractStatusCode({ status: 404 })).toBe(404)
      expect(extractStatusCode({ statusCode: 500 })).toBe(500)
    })

    it('should return undefined for errors without status', () => {
      expect(extractStatusCode({})).toBeUndefined()
      expect(extractStatusCode(null)).toBeUndefined()
    })
  })
})
