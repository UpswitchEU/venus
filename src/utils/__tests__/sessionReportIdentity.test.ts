/**
 * @module utils/__tests__/sessionReportIdentity.test
 */

import { describe, expect, it } from 'vitest'
import {
  applyStableReportIdFromSessionKeys,
  extractStableSessionKeyFromMergedSession,
  mergeSessionDataEnvelopesFromRoot,
} from '../sessionReportIdentity'

describe('sessionReportIdentity', () => {
  describe('mergeSessionDataEnvelopesFromRoot', () => {
    it('does not let empty sessionData hide session_data', () => {
      expect(
        mergeSessionDataEnvelopesFromRoot({
          sessionData: {},
          session_data: { company_name: 'From snake' },
        }),
      ).toEqual({ company_name: 'From snake' })
    })

    it('lets camel sessionData win on conflict', () => {
      expect(
        mergeSessionDataEnvelopesFromRoot({
          sessionData: { company_name: 'Camel' },
          session_data: { company_name: 'Snake', revenue: 1 },
        }),
      ).toEqual({ company_name: 'Camel', revenue: 1 })
    })

    it('returns {} when both envelopes are empty objects', () => {
      expect(
        mergeSessionDataEnvelopesFromRoot({
          sessionData: {},
          session_data: {},
        }),
      ).toEqual({})
    })
  })

  describe('applyStableReportIdFromSessionKeys', () => {
    const valKey = 'val_1700000000_abc12'
    const staleUuid = 'a3bb189e-8bf9-3888-9242-7d234c596a4f'

    it('sets reportId from session_key when reportId is a conflicting UUID', () => {
      const p: Record<string, unknown> = {
        reportId: staleUuid,
        session_key: valKey,
      }
      applyStableReportIdFromSessionKeys(p)
      expect(p.reportId).toBe(valKey)
    })

    it('prefers sessionKey camelCase when session_key absent', () => {
      const p: Record<string, unknown> = {
        reportId: staleUuid,
        sessionKey: valKey,
      }
      applyStableReportIdFromSessionKeys(p)
      expect(p.reportId).toBe(valKey)
    })

    it('leaves non-session-key session_key as-is when no val_* candidate', () => {
      const p: Record<string, unknown> = { session_key: 'not-a-val-key' }
      applyStableReportIdFromSessionKeys(p)
      expect(p.reportId).toBe('not-a-val-key')
    })

    it('sets reportId from nested session_data.session_key when top-level keys are absent', () => {
      const staleUuid = 'a3bb189e-8bf9-3888-9242-7d234c596a4f'
      const valKey = 'val_1700000000_abc12'
      const p: Record<string, unknown> = {
        reportId: staleUuid,
        session_data: { session_key: valKey },
      }
      applyStableReportIdFromSessionKeys(p)
      expect(p.reportId).toBe(valKey)
    })
  })

  describe('extractStableSessionKeyFromMergedSession', () => {
    const valKey = 'val_1700000000_abc12'

    it('reads nested session_data.session_key', () => {
      expect(
        extractStableSessionKeyFromMergedSession({
          reportId: 'x',
          session_data: { session_key: valKey },
        }),
      ).toBe(valKey)
    })

    it('reads nested sessionData.sessionKey', () => {
      expect(
        extractStableSessionKeyFromMergedSession({
          sessionData: { sessionKey: valKey },
        }),
      ).toBe(valKey)
    })

    it('still reads session_data when sessionData is an empty object', () => {
      expect(
        extractStableSessionKeyFromMergedSession({
          sessionData: {},
          session_data: { session_key: valKey },
        }),
      ).toBe(valKey)
    })
  })
})
