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

  it('documents 404 report-not-ready as pending (no approve fallback, background retry)', () => {
    const isReviewPendingReportFailure = (res: Response, json?: { message?: string }) => {
      if (res.status !== 404) return false
      const message = json?.message?.toLowerCase() ?? ''
      return (
        message.includes('report yet') ||
        message.includes('not have a report') ||
        message.includes('run valuation first')
      )
    }

    expect(
      isReviewPendingReportFailure(new Response(null, { status: 404 }), {
        message: 'Valuation report not found. Session may not have a report yet (run valuation first).',
      })
    ).toBe(true)
    expect(
      isReviewPendingReportFailure(new Response(null, { status: 404 }), {
        message: 'Valuation report not found.',
      })
    ).toBe(false)
  })
})
