import { describe, expect, it, vi } from 'vitest'
import { buildPostDeleteNewValuationUrl, deleteValuationEntry } from '../deleteValuationEntry'

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
      '/nl/reports/new?clientId=client-123&prefilledQuery=Metaalbewerking+Upswitch&source=mercury&flow=advisor'
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
