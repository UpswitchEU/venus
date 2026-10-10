import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearReportRecovery,
  deferReportRecovery,
  resumeReportRecovery,
  useReportRecoveryStore,
} from './reportRecoveryStore'

beforeEach(() => useReportRecoveryStore.setState({ step: null }))
describe('report recovery continuation', () => {
  it('coalesces navigation and automatic retries of the same completed calculation', async () => {
    let finish!: () => void
    const resume = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    deferReportRecovery('report', 'result', new Error('offline'), resume)
    const first = resumeReportRecovery('report')
    const second = resumeReportRecovery('report')
    await Promise.resolve()
    expect(resume).toHaveBeenCalledOnce()
    finish()
    await Promise.all([first, second])
    expect(useReportRecoveryStore.getState().step).toBeNull()
  })
  it('retains a continuation that explicitly reports incomplete work', async () => {
    deferReportRecovery('report', 'inputs', new Error('offline'), async () => false)
    await expect(resumeReportRecovery('report')).rejects.toThrow('not completed')
    expect(useReportRecoveryStore.getState().step?.stage).toBe('inputs')
  })
  it('does not clear a newer result when an old continuation finishes', async () => {
    deferReportRecovery('report', 'result', new Error('offline'), async () => {
      deferReportRecovery('report', 'result', new Error('newer save failed'), async () => undefined)
    })
    await resumeReportRecovery('report')
    expect(useReportRecoveryStore.getState().step?.failure.message).toBe('newer save failed')
    clearReportRecovery('report')
  })
})
