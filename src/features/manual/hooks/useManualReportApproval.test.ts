import { describe, expect, it } from 'vitest'

describe('useManualReportApproval gating', () => {
  it('documents that approve stays hidden until review state is loaded', () => {
    const canApprove = (
      enabled: boolean,
      reportId: string | null,
      reviewState: string | null
    ) =>
      enabled &&
      Boolean(reportId) &&
      reviewState !== null &&
      reviewState !== 'accountant_approved'

    expect(canApprove(true, 'report-1', null)).toBe(false)
    expect(canApprove(true, 'report-1', 'auto_generated')).toBe(true)
    expect(canApprove(true, 'report-1', 'accountant_approved')).toBe(false)
  })
})
