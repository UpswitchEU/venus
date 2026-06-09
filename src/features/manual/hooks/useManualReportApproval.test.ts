import { describe, expect, it } from 'vitest'
import { isTransientUpstreamFailure } from '@/utils/transientUpstreamMessage'

describe('useManualReportApproval gating', () => {
  it('documents that approve stays hidden until review state is loaded', () => {
    const canApprove = (
      enabled: boolean,
      reportId: string | null,
      reviewState: string | null,
      allowApproveWithoutReviewState: boolean
    ) =>
      enabled &&
      Boolean(reportId) &&
      reviewState !== 'accountant_approved' &&
      (reviewState !== null || allowApproveWithoutReviewState)

    expect(canApprove(true, 'report-1', null, false)).toBe(false)
    expect(canApprove(true, 'report-1', null, true)).toBe(true)
    expect(canApprove(true, 'report-1', 'auto_generated', false)).toBe(true)
    expect(canApprove(true, 'report-1', 'accountant_approved', false)).toBe(false)
  })

  it('documents transient-only background reload with immediate approve fallback', () => {
    const canApproveAfterTransientLoadFailure = (
      enabled: boolean,
      reportId: string | null,
      reviewState: string | null,
      allowApproveWithoutReviewState: boolean
    ) =>
      enabled &&
      Boolean(reportId) &&
      reviewState !== 'accountant_approved' &&
      (reviewState !== null || allowApproveWithoutReviewState)

    expect(canApproveAfterTransientLoadFailure(true, 'report-1', null, true)).toBe(true)
    expect(isTransientUpstreamFailure(new Response(null, { status: 503 }), {})).toBe(true)
  })
})
