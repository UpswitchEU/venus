import { describe, expect, it } from 'vitest'

import type { ValuationSession } from '../../../types/valuation'
import {
  createAuthenticatedSessionFromUpdate,
  mergeAuthenticatedSessionUpdate,
  normalizeAuthenticatedSessionReportId,
} from './AuthenticatedSessionState'

describe('AuthenticatedSessionState', () => {
  it('creates an authenticated session only when the update carries a report id', () => {
    const updatedAt = new Date('2026-06-22T10:00:00.000Z')

    expect(createAuthenticatedSessionFromUpdate({ sessionData: { revenue: 1 } }, updatedAt)).toBe(
      null
    )

    expect(
      createAuthenticatedSessionFromUpdate(
        {
          reportId: 'val_created',
          sessionData: { company_name: 'Created Co' },
          htmlReport: '<main>ready</main>',
        },
        updatedAt
      )
    ).toMatchObject({
      reportId: 'val_created',
      currentView: 'manual',
      dataSource: 'manual',
      updatedAt,
      sessionData: { company_name: 'Created Co' },
      htmlReport: '<main>ready</main>',
    })
  })

  it('merges sessionData and partialData without dropping existing local fields', () => {
    const createdAt = new Date('2026-06-22T10:05:00.000Z')
    const updatedAt = new Date('2026-06-22T10:06:00.000Z')
    const currentSession: ValuationSession = {
      reportId: 'val_merge',
      currentView: 'manual',
      dataSource: 'manual',
      createdAt,
      updatedAt: createdAt,
      sessionData: {
        company_name: 'Merge Co',
        revenue: 1_000_000,
      },
      partialData: {
        normalized: false,
      },
    }

    expect(
      mergeAuthenticatedSessionUpdate(
        currentSession,
        {
          sessionData: { revenue: 1_250_000, ebitda: 250_000 },
          partialData: { normalized: true },
        },
        updatedAt
      )
    ).toMatchObject({
      reportId: 'val_merge',
      updatedAt,
      sessionData: {
        company_name: 'Merge Co',
        revenue: 1_250_000,
        ebitda: 250_000,
      },
      partialData: {
        normalized: true,
      },
    })
  })

  it('pins a server canonical report id back to the requested URL report id', () => {
    const createdAt = new Date('2026-06-22T10:10:00.000Z')
    const session: ValuationSession = {
      reportId: 'val_canonical',
      currentView: 'manual',
      dataSource: 'manual',
      createdAt,
      updatedAt: createdAt,
      sessionData: {},
      partialData: {},
    }

    expect(normalizeAuthenticatedSessionReportId(session, 'url-report-id')).toMatchObject({
      ...session,
      reportId: 'url-report-id',
    })
    expect(normalizeAuthenticatedSessionReportId(session, 'val_canonical')).toBe(session)
    expect(normalizeAuthenticatedSessionReportId(session, null)).toBe(session)
  })
})
