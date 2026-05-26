import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ValuationResponse } from '../../types/valuation'
import { pendingAssetSaves, ReportService } from './ReportService'

type ReportServiceInternals = ReportService & {
  _saveReportAssetsInternal: (
    reportId: string,
    assets: {
      sessionData?: Record<string, unknown>
      valuationResult?: ValuationResponse
      htmlReport?: string
      name?: string
    }
  ) => Promise<void>
}

describe('ReportService asset save queue', () => {
  afterEach(() => {
    pendingAssetSaves.clear()
    vi.restoreAllMocks()
  })

  it('serializes saves for the same report id without dropping the later payload', async () => {
    const service = ReportService.getInstance() as ReportServiceInternals
    const order: string[] = []
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const internalSave = vi
      .spyOn(service, '_saveReportAssetsInternal')
      .mockImplementation(async (_reportId, assets) => {
        const name = assets.name || 'unnamed'
        order.push(`start:${name}`)
        if (name === 'first') {
          await firstGate
        }
        order.push(`end:${name}`)
      })

    const first = service.saveReportAssets('report-1', { name: 'first' })
    await vi.waitFor(() => expect(internalSave).toHaveBeenCalledTimes(1))

    const second = service.saveReportAssets('report-1', { name: 'second' })
    await Promise.resolve()

    expect(internalSave).toHaveBeenCalledTimes(1)
    releaseFirst()

    await Promise.all([first, second])

    expect(order).toEqual(['start:first', 'end:first', 'start:second', 'end:second'])
    expect(pendingAssetSaves.has('report-1')).toBe(false)
  })

  it('does not poison the per-report queue when an earlier save fails', async () => {
    const service = ReportService.getInstance() as ReportServiceInternals
    const failure = new Error('first save failed')
    let rejectFirst!: (error: Error) => void
    const firstGate = new Promise<void>((_resolve, reject) => {
      rejectFirst = reject
    })
    const internalSave = vi
      .spyOn(service, '_saveReportAssetsInternal')
      .mockImplementationOnce(async () => firstGate)
      .mockResolvedValueOnce(undefined)

    const first = service.saveReportAssets('report-1', { name: 'first' })
    await vi.waitFor(() => expect(internalSave).toHaveBeenCalledTimes(1))

    const second = service.saveReportAssets('report-1', { name: 'second' })
    rejectFirst(failure)

    await expect(first).rejects.toBe(failure)
    await expect(second).resolves.toBeUndefined()

    expect(internalSave).toHaveBeenCalledTimes(2)
    expect(internalSave).toHaveBeenNthCalledWith(2, 'report-1', { name: 'second' })
    expect(pendingAssetSaves.has('report-1')).toBe(false)
  })

  it('snapshots queued assets so caller mutations cannot change an in-flight save', async () => {
    const service = ReportService.getInstance() as ReportServiceInternals
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const internalSave = vi
      .spyOn(service, '_saveReportAssetsInternal')
      .mockImplementationOnce(async () => firstGate)
      .mockResolvedValueOnce(undefined)

    const first = service.saveReportAssets('report-1', { name: 'first' })
    await vi.waitFor(() => expect(internalSave).toHaveBeenCalledTimes(1))

    const sessionData = { company_name: 'Snapshot Co', nested: { revenue: 100 } }
    const valuationResult = {
      valuation_id: 'val-snapshot',
      html_report: '<html>Original</html>',
    } as unknown as ValuationResponse
    const second = service.saveReportAssets('report-1', {
      name: 'second',
      sessionData,
      valuationResult,
      htmlReport: '<html>Original</html>',
    })

    sessionData.company_name = 'Mutated Co'
    sessionData.nested.revenue = 999
    valuationResult.html_report = '<html>Mutated</html>'
    releaseFirst()

    await Promise.all([first, second])

    expect(internalSave).toHaveBeenNthCalledWith(
      2,
      'report-1',
      expect.objectContaining({
        sessionData: { company_name: 'Snapshot Co', nested: { revenue: 100 } },
        valuationResult: expect.objectContaining({ html_report: '<html>Original</html>' }),
        htmlReport: '<html>Original</html>',
      })
    )
  })
})
