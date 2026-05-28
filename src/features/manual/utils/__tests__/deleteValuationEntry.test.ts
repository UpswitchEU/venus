// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import {
  buildCurrentReportDeletedMercuryMessage,
  buildPostDeleteCurrentReportRedirectUrl,
  buildPostDeleteNewValuationUrl,
  buildSidebarReportDeletedMercuryMessage,
  buildStaleReportRecoveryUrl,
  deleteValuationEntry,
} from '../deleteValuationEntry'

describe('deleteValuationEntry', () => {
  it('deletes draft valuations via the session cleanup path', async () => {
    const deleteDraftSession = vi.fn().mockResolvedValue(undefined)
    const deleteReport = vi.fn().mockResolvedValue(undefined)

    await deleteValuationEntry({
      valuation: {
        id: 'val_123',
        companyName: 'Draft Co',
        updatedAt: new Date(),
        isDraft: true,
        deleteMode: 'session',
      },
      deleteDraftSession,
      deleteReport,
    })

    expect(deleteDraftSession).toHaveBeenCalledWith('val_123')
    expect(deleteReport).not.toHaveBeenCalled()
  })

  it('deletes completed valuations via the report path', async () => {
    const deleteDraftSession = vi.fn().mockResolvedValue(undefined)
    const deleteReport = vi.fn().mockResolvedValue(undefined)

    await deleteValuationEntry({
      valuation: {
        id: 'report-123',
        companyName: 'Completed Co',
        updatedAt: new Date(),
        isDraft: false,
        deleteMode: 'report',
      },
      deleteDraftSession,
      deleteReport,
    })

    expect(deleteReport).toHaveBeenCalledWith('report-123')
    expect(deleteDraftSession).not.toHaveBeenCalled()
  })
})

describe('buildPostDeleteNewValuationUrl', () => {
  it('preserves client context and company identity after deleting the current report', () => {
    expect(
      buildPostDeleteNewValuationUrl({
        locale: 'nl',
        clientId: 'client-123',
        companyName: 'Metaalbewerking Upswitch',
        currentSearch: '?source=mercury&flow=advisor',
      })
    ).toBe(
      '/nl/reports/new?clientId=client-123&prefilledQuery=Metaalbewerking+Upswitch&flow=advisor&source=mercury'
    )
  })

  it('falls back to KBO or VAT when no company name is available', () => {
    expect(
      buildPostDeleteNewValuationUrl({
        locale: 'nl',
        kboNumber: '0123.456.789',
      })
    ).toBe('/nl/reports/new?prefilledQuery=0123.456.789')

    expect(
      buildPostDeleteNewValuationUrl({
        locale: 'nl',
        vatNumber: 'BE0123456789',
      })
    ).toBe('/nl/reports/new?prefilledQuery=BE0123456789')
  })

  it('copies only safe passthrough params and rejects unsafe return URLs', () => {
    expect(
      buildPostDeleteNewValuationUrl({
        locale: 'en',
        companyName: 'Safe Co',
        currentSearch:
          '?clientToken=tok_123&return_url=javascript:alert(1)&source=mercury&unknown=drop',
      })
    ).toBe('/en/reports/new?prefilledQuery=Safe+Co&clientToken=tok_123&source=mercury')

    expect(
      buildPostDeleteNewValuationUrl({
        locale: 'en',
        companyName: 'Safe Co',
        currentSearch: '?return_url=%2Fen%2Fadvisor%2Fclients%2Fclient-123',
      })
    ).toBe(
      '/en/reports/new?prefilledQuery=Safe+Co&return_url=%2Fen%2Fadvisor%2Fclients%2Fclient-123'
    )
  })
})

describe('buildPostDeleteCurrentReportRedirectUrl', () => {
  it('prefers the snapshotted fresh-valuation URL when available', () => {
    expect(
      buildPostDeleteCurrentReportRedirectUrl({
        postDeleteNewValuationUrl: '/nl/reports/new?clientId=c1',
        isAccountantMode: true,
        returnUrl: 'https://upswitch.app/nl/advisor/dashboard',
        currentLocale: 'nl',
      })
    ).toBe('/nl/reports/new?clientId=c1')
  })

  it('returns Mercury safely for accountant deletes without a fresh-valuation snapshot', () => {
    expect(
      buildPostDeleteCurrentReportRedirectUrl({
        isAccountantMode: true,
        returnUrl: 'https://upswitch.app/en/advisor/settings',
        sourceApp: 'mercury',
        clientContextId: 'client-1',
        currentLocale: 'nl',
      })
    ).toContain('/nl/advisor/settings')
  })

  it('returns a local new-report URL for non-accountant deletes without Mercury handoff', () => {
    expect(
      buildPostDeleteCurrentReportRedirectUrl({
        isAccountantMode: false,
        currentLocale: 'en',
      })
    ).toBe('/en/reports/new')
  })

  it('returns seller business dashboard when Mercury handoff is present', () => {
    const url = buildPostDeleteCurrentReportRedirectUrl({
      isAccountantMode: false,
      returnUrl: 'https://preview.upswitch.app/nl/business/dashboard',
      sourceApp: 'business_dashboard_orphaned_seller',
      currentLocale: 'nl',
    })
    expect(url).toContain('/nl/business/dashboard')
    expect(url).not.toContain('/advisor/')
  })
})

describe('Mercury report-deleted messages', () => {
  it('builds current-report delete messages with redirect and remaining-state intent', () => {
    expect(
      buildCurrentReportDeletedMercuryMessage({
        reportId: 'report-1',
        currentLocale: 'nl',
        clientContextId: 'client 1',
        hasRemainingValuations: false,
      })
    ).toEqual({
      type: 'venus-report-deleted',
      reportId: 'report-1',
      clientId: 'client 1',
      keepOpen: false,
      source: 'venus',
      redirectTo: '/nl/advisor/clients/client%201',
    })
  })

  it('builds sidebar delete messages without forcing parent navigation', () => {
    expect(
      buildSidebarReportDeletedMercuryMessage({
        reportId: 'report-2',
        clientContextId: 'client-1',
      })
    ).toEqual({
      type: 'venus-report-deleted',
      reportId: 'report-2',
      clientId: 'client-1',
      keepOpen: true,
      source: 'venus',
    })
  })
})

describe('buildStaleReportRecoveryUrl', () => {
  it('copies safe passthrough params from current search (explicit)', () => {
    const url = buildStaleReportRecoveryUrl(
      'nl',
      '?clientId=c1&prefilledQuery=Acme&source=mercury&flow=manual&mode=accountant&clientToken=tok&session_key=val_123&return_url=https%3A%2F%2Fwww.upswitch.app%2Fnl%2Fadvisor'
    )
    expect(url.startsWith('/nl/reports/new?')).toBe(true)
    const qs = new URLSearchParams(url.split('?')[1])
    expect(qs.get('clientId')).toBe('c1')
    expect(qs.get('prefilledQuery')).toBe('Acme')
    expect(qs.get('source')).toBe('mercury')
    expect(qs.get('flow')).toBe('manual')
    expect(qs.get('mode')).toBe('accountant')
    expect(qs.get('clientToken')).toBe('tok')
    expect(qs.get('session_key')).toBe('val_123')
    expect(qs.get('return_url')).toBe('https://www.upswitch.app/nl/advisor')
  })

  it('returns bare new report path when search empty', () => {
    expect(buildStaleReportRecoveryUrl('en', '')).toBe('/en/reports/new')
  })
})
