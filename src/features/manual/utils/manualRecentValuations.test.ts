// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { RecentValuation } from '@/components/calculator'
import {
  buildManualRecentValuations,
  filterRemainingRecentValuationsAfterDelete,
  mapReportsResponseToRecentValuations,
} from './manualRecentValuations'

const now = new Date('2026-05-15T10:00:00.000Z')
const uuid = '123e4567-e89b-12d3-a456-426614174000'
const sessionKey = 'val_abcdefgh'

describe('manualRecentValuations', () => {
  it('normalizes reports API response variants', () => {
    const valuations = mapReportsResponseToRecentValuations(
      {
        data: [
          {
            report_id: uuid,
            company_name: 'Acme',
            updated_at: '2026-05-01T12:00:00.000Z',
            status: 'draft',
          },
          {
            id: '',
            name: 'Missing id',
          },
          {
            reportId: 'rep-2',
            name: 'Fallback Co',
            status: 'complete',
          },
        ],
      },
      { unnamedLabel: 'Unnamed', now }
    )

    expect(valuations).toEqual([
      {
        id: uuid,
        companyName: 'Acme',
        updatedAt: new Date('2026-05-01T12:00:00.000Z'),
        isDraft: true,
        deleteMode: 'report',
      },
      {
        id: 'rep-2',
        companyName: 'Fallback Co',
        updatedAt: now,
        isDraft: false,
        deleteMode: 'report',
      },
    ])
  })

  it('prepends the current session when it is missing from recent reports', () => {
    const valuations = buildManualRecentValuations({
      rawRecentValuations: [{ id: 'other', companyName: 'Other', updatedAt: now }],
      reportId: 'new',
      resolvedReportId: null,
      sessionReportId: null,
      activeSessionKey: sessionKey,
      sessionName: 'Draft Session',
      sessionCreatedAt: now,
      currentReport: null,
      collectedCompanyName: null,
      isAccountantFlow: false,
      clientCompanyName: null,
      unnamedLabel: 'Unnamed',
      now,
    })

    expect(valuations[0]).toMatchObject({
      id: sessionKey,
      companyName: 'Draft Session',
      isDraft: true,
      deleteMode: 'session',
    })
    expect(valuations).toHaveLength(2)
  })

  it('does not prepend when the active report already appears under an equivalent id', () => {
    const raw: RecentValuation[] = [{ id: uuid, companyName: 'Acme', updatedAt: now }]

    expect(
      buildManualRecentValuations({
        rawRecentValuations: raw,
        reportId: sessionKey,
        resolvedReportId: uuid,
        sessionReportId: uuid,
        activeSessionKey: sessionKey,
        sessionName: 'Acme',
        currentReport: { companyName: 'Acme', generatedAt: now },
        collectedCompanyName: null,
        isAccountantFlow: false,
        clientCompanyName: null,
        unnamedLabel: 'Unnamed',
      })
    ).toBe(raw)
  })

  it('uses session delete for val_* even when the right panel still shows a ghost report', () => {
    const valuations = buildManualRecentValuations({
      rawRecentValuations: [],
      reportId: sessionKey,
      resolvedReportId: null,
      sessionReportId: null,
      activeSessionKey: sessionKey,
      sessionName: 'Draft Session',
      sessionCreatedAt: now,
      currentReport: { companyName: 'Ghost EV', generatedAt: now },
      collectedCompanyName: null,
      isAccountantFlow: false,
      clientCompanyName: null,
      unnamedLabel: 'Unnamed',
      now,
    })

    expect(valuations[0]).toMatchObject({
      id: sessionKey,
      deleteMode: 'session',
      isDraft: true,
    })
  })

  it('uses report and client fallbacks for the prepended row', () => {
    const valuations = buildManualRecentValuations({
      rawRecentValuations: [],
      reportId: uuid,
      resolvedReportId: uuid,
      sessionReportId: null,
      activeSessionKey: null,
      sessionName: null,
      currentReport: { companyName: '', generatedAt: now },
      collectedCompanyName: '',
      isAccountantFlow: true,
      clientCompanyName: 'Client Co',
      unnamedLabel: 'Unnamed',
    })

    expect(valuations[0]).toMatchObject({
      id: uuid,
      companyName: 'Client Co',
      isDraft: false,
      deleteMode: 'report',
    })
  })

  it('filters deleted reports using linked UUID/session-key identity', () => {
    const raw: RecentValuation[] = [
      { id: uuid, companyName: 'Current', updatedAt: now },
      { id: 'other', companyName: 'Other', updatedAt: now },
    ]

    expect(
      filterRemainingRecentValuationsAfterDelete({
        rawRecentValuations: raw,
        deletedId: sessionKey,
        sessionReportId: uuid,
        sessionKey,
      })
    ).toEqual([{ id: 'other', companyName: 'Other', updatedAt: now }])
  })
})
