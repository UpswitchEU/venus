// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  getManualSessionKey,
  manualSessionMatchesReport,
  resolveManualPersistedReportLookupId,
  resolveManualReportHydrationLookupId,
  resolveManualReportId,
} from './manualSessionIdentifiers'

const uuid = '123e4567-e89b-12d3-a456-426614174000'
const otherUuid = '223e4567-e89b-12d3-a456-426614174000'
const sessionKey = 'val_abcdefgh'

describe('manualSessionIdentifiers', () => {
  it('resolves new report routes to the hydrated session report id first', () => {
    expect(resolveManualReportId('new', { reportId: uuid, key: sessionKey })).toBe(uuid)
  })

  it('falls back to a session key for new report routes before a report id exists', () => {
    expect(resolveManualReportId('new', { key: sessionKey })).toBe(sessionKey)
    expect(resolveManualReportId('new', { session_key: sessionKey })).toBe(sessionKey)
  })

  it('upgrades val session keys to UUID report ids when available', () => {
    expect(resolveManualReportId(sessionKey, { reportId: uuid })).toBe(uuid)
  })

  it('chooses the first UUID for persisted report lookups', () => {
    expect(
      resolveManualPersistedReportLookupId({
        session: { reportId: uuid },
        resolvedReportId: otherUuid,
        reportId: sessionKey,
      })
    ).toBe(uuid)
    expect(
      resolveManualPersistedReportLookupId({
        session: { key: sessionKey },
        resolvedReportId: sessionKey,
        reportId: sessionKey,
      })
    ).toBeNull()
  })

  it('chooses UUIDs or val session keys for hydration lookups', () => {
    expect(
      resolveManualReportHydrationLookupId({
        session: { key: sessionKey },
        resolvedReportId: null,
        reportId: 'new',
      })
    ).toBe(sessionKey)
    expect(
      resolveManualReportHydrationLookupId({
        session: { reportId: uuid, key: sessionKey },
        resolvedReportId: otherUuid,
        reportId: sessionKey,
      })
    ).toBe(uuid)
  })

  it('matches sessions by report id or either session key spelling', () => {
    expect(manualSessionMatchesReport({ reportId: uuid }, uuid)).toBe(true)
    expect(manualSessionMatchesReport({ key: sessionKey }, sessionKey)).toBe(true)
    expect(manualSessionMatchesReport({ session_key: sessionKey }, sessionKey)).toBe(true)
    expect(manualSessionMatchesReport(null, sessionKey)).toBe(false)
  })

  it('reads either session key spelling', () => {
    expect(getManualSessionKey({ key: sessionKey })).toBe(sessionKey)
    expect(getManualSessionKey({ session_key: sessionKey })).toBe(sessionKey)
    expect(getManualSessionKey({ key: '   ' })).toBeNull()
  })
})
