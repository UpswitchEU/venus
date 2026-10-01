import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ValuationSession } from '../../types/valuation'
import { backendAPI } from '../backendApi'
import { reportService } from './ReportService'

const internals = reportService as unknown as {
  checkValuationLimit: () => Promise<void>
  logValuationUsage: (id: string) => Promise<void>
}
afterEach(() => vi.restoreAllMocks())
const prepare = () => {
  vi.spyOn(internals, 'checkValuationLimit').mockResolvedValue()
  vi.spyOn(internals, 'logValuationUsage').mockResolvedValue()
}

describe('durable report creation', () => {
  it('does not report a successful creation before the server acknowledgement', async () => {
    prepare()
    let acknowledge: (value: { session: ValuationSession }) => void = () => {
      throw new Error('Missing resolver')
    }
    vi.spyOn(backendAPI, 'createValuationSession').mockImplementation(
      () =>
        new Promise((resolve) => {
          acknowledge = resolve
        })
    )
    let finished = false
    const pending = reportService.createReport().then((value) => {
      finished = true
      return value
    })
    await vi.waitFor(() => expect(backendAPI.createValuationSession).toHaveBeenCalledOnce())
    expect(finished).toBe(false)
    const saved = {
      reportId: 'server-report-id',
      currentView: 'manual',
      dataSource: 'manual',
    } as ValuationSession
    acknowledge({ session: saved })
    expect(await pending).toBe(saved)
  })

  it('surfaces failure and never queues a raw report in browser storage', async () => {
    prepare()
    localStorage.clear()
    const failure = new Error('Save unavailable')
    vi.spyOn(backendAPI, 'createValuationSession').mockRejectedValue(failure)
    await expect(reportService.createReport({ company_name: 'Private company' })).rejects.toBe(
      failure
    )
    expect(localStorage.getItem('venus_pending_syncs')).toBeNull()
    expect(internals.logValuationUsage).not.toHaveBeenCalled()
  })
})
