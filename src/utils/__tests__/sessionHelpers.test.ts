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
  orderedValuationSessionLookupIds,
  resolveEnsureHtmlAlternateReportId,
  resolveEnsureHtmlSessionKey,
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

    it('fills sessionData from session_data when sessionData is an empty object', () => {
      const session = {
        sessionId: 'test',
        reportId: 'val_123',
        createdAt: '2025-12-13T10:00:00Z',
        updatedAt: '2025-12-13T11:00:00Z',
        sessionData: {},
        session_data: { company_name: 'Nested Co' },
      }

      const result = normalizeSessionDates(session)

      expect((result.sessionData as Record<string, unknown>).company_name).toBe('Nested Co')
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
      expect(
        (result.sessionData as any)?.valuation_result?.details?.valuation_results
      ).toMatchObject({
        ebitda_multiple: {
          available: true,
          value: 250000,
        },
      })
    })

    it('merges valuation_result from session_data when sessionData is an empty object', () => {
      const result = mergeSessionFields({
        reportId: 'val_merge_fields',
        sessionId: 'session_456',
        currentView: 'manual',
        dataSource: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        partialData: {},
        sessionData: {},
        session_data: {
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
        },
      } as any)

      expect((result.valuationResult as any)?.details?.valuation_results).toMatchObject({
        ebitda_multiple: {
          available: true,
          value: 250000,
        },
      })
    })

    it('canonicalizes restored business_type_id aliases in session data', () => {
      const session = createBaseSession('val_alias_session', 'manual')
      session.sessionData = {
        company_name: 'Upswitch',
        business_type_id: 'fintech_lending_credit',
      } as typeof session.sessionData

      const result = mergeSessionFields(session)

      expect((result.sessionData as Record<string, unknown>)?.business_type_id).toBe(
        'fintech-lending'
      )
    })
  })

  describe('resolveEnsureHtmlSessionKey', () => {
    const staleUuid = 'a3bb189e-8bf9-3888-9242-7d234c596a4f'
    const sessionKey = 'val_1700000000_abc12'

    it('returns merged session key when path targets a stale UUID', () => {
      const k = resolveEnsureHtmlSessionKey({
        urlReportId: staleUuid,
        mergedSession: createBaseSession(sessionKey, 'manual'),
        ensureTargetId: staleUuid,
      })
      expect(k).toBe(sessionKey)
    })

    it('prefers authoritative merged reportId over url when both are session keys (differs from path)', () => {
      const otherKey = 'val_1700000000_xyz99'
      const k = resolveEnsureHtmlSessionKey({
        urlReportId: 'val_mismatch_wrong',
        mergedSession: { ...createBaseSession(otherKey, 'manual') },
        ensureTargetId: 'val_mismatch_wrong',
      })
      expect(k).toBe(otherKey)
    })

    it('returns undefined when session key would duplicate the ensure path id', () => {
      expect(
        resolveEnsureHtmlSessionKey({
          urlReportId: sessionKey,
          mergedSession: createBaseSession(sessionKey, 'manual'),
          ensureTargetId: sessionKey,
        })
      ).toBeUndefined()
    })

    it('reads session_key when reportId is missing', () => {
      const k = resolveEnsureHtmlSessionKey({
        urlReportId: staleUuid,
        mergedSession: {
          ...createBaseSession(sessionKey, 'manual'),
          reportId: staleUuid as any,
          session_key: sessionKey,
        } as any,
        ensureTargetId: staleUuid,
      })
      expect(k).toBe(sessionKey)
    })

    it('reads sessionKey (camelCase) when snake_case session_key is absent', () => {
      const k = resolveEnsureHtmlSessionKey({
        urlReportId: staleUuid,
        mergedSession: {
          ...createBaseSession(sessionKey, 'manual'),
          reportId: staleUuid as any,
          sessionKey,
        } as any,
        ensureTargetId: staleUuid,
      })
      expect(k).toBe(sessionKey)
    })

    it('reads nested session_data.session_key when top-level keys disagree with stale path', () => {
      const k = resolveEnsureHtmlSessionKey({
        urlReportId: staleUuid,
        mergedSession: {
          ...createBaseSession(staleUuid, 'manual'),
          reportId: staleUuid as any,
          session_data: { session_key: sessionKey },
        } as any,
        ensureTargetId: staleUuid,
      })
      expect(k).toBe(sessionKey)
    })
  })

  describe('resolveEnsureHtmlAlternateReportId', () => {
    const stale = 'bb03de8b-34f9-461e-bf33-1fea23eef21f'
    const canonical = 'd290f1ee-6c54-4b01-90e6-d701748f0851'

    it('returns merged report UUID when it differs from the URL id', () => {
      expect(
        resolveEnsureHtmlAlternateReportId({
          urlReportId: stale,
          mergedSession: { reportId: canonical } as any,
        })
      ).toBe(canonical)
    })

    it('returns undefined when merged id matches URL or is absent', () => {
      expect(
        resolveEnsureHtmlAlternateReportId({
          urlReportId: stale,
          mergedSession: { reportId: stale } as any,
        })
      ).toBeUndefined()
      expect(
        resolveEnsureHtmlAlternateReportId({
          urlReportId: stale,
          mergedSession: {} as any,
        })
      ).toBeUndefined()
    })

    it('returns undefined when URL is a session key (ensure target is val_*; alternate is UUID-only)', () => {
      expect(
        resolveEnsureHtmlAlternateReportId({
          urlReportId: 'val_1700000000_abc12',
          mergedSession: {
            reportId: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
          } as any,
        })
      ).toBeUndefined()
    })
  })

  describe('orderedValuationSessionLookupIds', () => {
    const canonical = 'd290f1ee-6c54-4b01-90e6-d701748f0851'
    const val = 'val_1700000000_abc12'
    const stale = 'a3bb189e-8bf9-3888-9242-7d234c596a4f'

    it('puts ensure response reportId first and dedupes', () => {
      expect(
        orderedValuationSessionLookupIds({
          ensureResponseReportId: canonical,
          sessionKeyFallback: val,
          mergedSessionReportId: val,
          urlReportId: stale,
        })
      ).toEqual([canonical, val, stale])
    })

    it('skips invalid ensureResponseReportId and junk merge values', () => {
      expect(
        orderedValuationSessionLookupIds({
          ensureResponseReportId: 'not-a-uuid',
          sessionKeyFallback: null,
          mergedSessionReportId: '',
          urlReportId: val,
        })
      ).toEqual([val])
    })
  })
})
