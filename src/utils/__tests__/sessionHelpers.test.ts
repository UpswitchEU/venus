/**
 * Session Helper Utilities Tests
 *
 * @module utils/__tests__/sessionHelpers.test
 */

import { describe, expect, it } from 'vitest'
import {
  createBaseSession,
  mergePrefilledQuery,
  mergeSessionFields,
  normalizeSessionDates,
} from '../sessionHelpers'

describe('sessionHelpers', () => {
  describe('createBaseSession', () => {
    it('should create session with all required fields', () => {
      const session = createBaseSession('val_123', 'manual')

      expect(session.reportId).toBe('val_123')
      expect(session.currentView).toBe('manual')
      expect(session.dataSource).toBe('manual')
      expect(session.createdAt).toBeInstanceOf(Date)
      expect(session.updatedAt).toBeInstanceOf(Date)
      expect(session.partialData).toEqual({})
      expect(session.sessionData).toEqual({})
    })

    it('should include prefilled query when provided', () => {
      const session = createBaseSession('val_123', 'conversational', 'Restaurant')

      expect(session.partialData).toEqual({ _prefilledQuery: 'Restaurant' })
    })

    it('should handle null prefilled query', () => {
      const session = createBaseSession('val_123', 'manual', null)

      expect(session.partialData).toEqual({})
    })
  })

  describe('mergePrefilledQuery', () => {
    it('should add prefilled query to empty data', () => {
      const result = mergePrefilledQuery({}, 'Restaurant')
      expect(result).toEqual({ _prefilledQuery: 'Restaurant' })
    })

    it('should not override existing prefilled query', () => {
      const existing = { _prefilledQuery: 'Existing' }
      const result = mergePrefilledQuery(existing, 'New')
      expect(result._prefilledQuery).toBe('Existing')
    })

    it('should preserve other data', () => {
      const existing = { company_name: 'Test Co', revenue: 100000 }
      const result = mergePrefilledQuery(existing, 'Restaurant')
      expect(result).toEqual({
        company_name: 'Test Co',
        revenue: 100000,
        _prefilledQuery: 'Restaurant',
      })
    })

    it('should return data unchanged if no query provided', () => {
      const data = { company_name: 'Test' }
      expect(mergePrefilledQuery(data, null)).toEqual(data)
      expect(mergePrefilledQuery(data, undefined)).toEqual(data)
    })
  })

  describe('normalizeSessionDates', () => {
    it('should convert string dates to Date objects', () => {
      const session = {
        sessionId: 'test',
        reportId: 'val_123',
        createdAt: '2025-12-13T10:00:00Z',
        updatedAt: '2025-12-13T11:00:00Z',
        completedAt: '2025-12-13T12:00:00Z',
      }

      const result = normalizeSessionDates(session)

      expect(result.createdAt).toBeInstanceOf(Date)
      expect(result.updatedAt).toBeInstanceOf(Date)
      expect(result.completedAt).toBeInstanceOf(Date)
    })

    it('should handle undefined completedAt', () => {
      const session = {
        sessionId: 'test',
        reportId: 'val_123',
        createdAt: '2025-12-13T10:00:00Z',
        updatedAt: '2025-12-13T11:00:00Z',
        completedAt: undefined,
      }

      const result = normalizeSessionDates(session)

      expect(result.completedAt).toBeUndefined()
    })
  })

  describe('mergeSessionFields', () => {
    it('should keep the richer persisted valuation result when top-level data is partial', () => {
      const result = mergeSessionFields({
        reportId: 'val_123',
        sessionId: 'session_456',
        currentView: 'manual',
        dataSource: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        partialData: {},
        sessionData: {
          valuation_result: {
            equity_value_mid: 250000,
            details: {
              valuation_results: {
                ebitda_multiple: {
                  available: true,
                  value: 250000,
                },
              },
            },
          },
        } as any,
        valuationResult: {
          equity_value_mid: 250000,
        } as any,
      } as any)

      expect((result.valuationResult as any)?.details?.valuation_results).toMatchObject({
        ebitda_multiple: {
          available: true,
          value: 250000,
        },
      })
      expect((result.sessionData as any)?.valuation_result?.details?.valuation_results).toMatchObject({
        ebitda_multiple: {
          available: true,
          value: 250000,
        },
      })
    })
  })
})
