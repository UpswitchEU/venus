import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  DEFAULT_BFF_TRANSIENT_RETRY_OPTIONS,
  fetchBffJsonWithTransientRetry,
} from '@/utils/fetchBffJsonWithTransientRetry'
import { isTransientUpstreamFailure } from '@/utils/transientUpstreamMessage'

export type ReviewState =
  | 'auto_generated'
  | 'review_requested'
  | 'accountant_approved'
  | 'client_revised'

interface ReviewStateRow {
  reviewState: ReviewState
}

interface ReviewBffPayload {
  success?: boolean
  message?: string
  data?: ReviewStateRow
}

interface UseManualReportApprovalParams {
  reportId: string | null | undefined
  enabled: boolean
  approveLabel: string
  approvedTitle: string
  failedTitle: string
  transientFailedDescription: string
}

type LoadReviewStateResult = {
  loaded: boolean
  transient: boolean
  pendingReport: boolean
}

const REVIEW_STATE_BACKGROUND_RETRY_MS = 8_000
/** Session key may hit review before Titan links report_id (~1s after calculate). */
const REVIEW_STATE_PENDING_REPORT_RETRY_MS = 2_000
const REVIEW_STATE_BACKGROUND_MAX_ATTEMPTS = 5

/** Titan 404 while valuation save is still linking session → report. */
function isReviewPendingReportFailure(res: Response, json?: ReviewBffPayload): boolean {
  if (res.status !== 404) return false
  const message = json?.message?.toLowerCase() ?? ''
  return (
    message.includes('report yet') ||
    message.includes('not have a report') ||
    message.includes('run valuation first')
  )
}

function isSuccessfulReviewPayload(json: ReviewBffPayload): json is ReviewBffPayload & {
  success: true
  data: ReviewStateRow
} {
  return Boolean(json.success && json.data?.reviewState)
}

function resolveApproveFailureMessage(
  res: Response,
  json: ReviewBffPayload,
  failedTitle: string,
  transientFailedDescription: string
): string {
  if (isTransientUpstreamFailure(res, json)) {
    return transientFailedDescription
  }
  return json.message || failedTitle
}

function isNetworkFailure(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof Error && (error.name === 'AbortError' || error.message === 'Failed to fetch'))
  )
}

export function useManualReportApproval({
  reportId,
  enabled,
  approveLabel,
  approvedTitle,
  failedTitle,
  transientFailedDescription,
}: UseManualReportApprovalParams) {
  const [reviewState, setReviewState] = useState<ReviewState | null>(null)
  const [allowApproveWithoutReviewState, setAllowApproveWithoutReviewState] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const isApprovingRef = useRef(false)

  useEffect(() => {
    if (!enabled || !reportId) {
      setReviewState(null)
      setAllowApproveWithoutReviewState(false)
      return
    }

    let cancelled = false
    let backgroundTimer: ReturnType<typeof setTimeout> | null = null
    let backgroundAttempts = 0

    const loadReviewState = async (options?: {
      background?: boolean
    }): Promise<LoadReviewStateResult> => {
      try {
        const { res, json } = await fetchBffJsonWithTransientRetry<ReviewBffPayload>(
          `/api/valuations/${encodeURIComponent(reportId)}/review`
        )
        if (cancelled) return { loaded: true, transient: false, pendingReport: false }

        if (res.ok && isSuccessfulReviewPayload(json)) {
          setReviewState(json.data.reviewState)
          setAllowApproveWithoutReviewState(false)
          return { loaded: true, transient: false, pendingReport: false }
        }

        const transient = isTransientUpstreamFailure(res, json)
        const pendingReport = isReviewPendingReportFailure(res, json)
        if (!transient && !pendingReport && !options?.background) {
          setReviewState(null)
          setAllowApproveWithoutReviewState(false)
        }

        return { loaded: false, transient, pendingReport }
      } catch (error) {
        if (!cancelled && !options?.background) {
          setReviewState(null)
        }
        if (isNetworkFailure(error)) {
          return { loaded: false, transient: true, pendingReport: false }
        }
        if (!cancelled && !options?.background) {
          setAllowApproveWithoutReviewState(false)
        }
        return { loaded: false, transient: false, pendingReport: false }
      }
    }

    const scheduleBackgroundReload = (delayMs: number) => {
      if (cancelled) return
      if (backgroundAttempts >= REVIEW_STATE_BACKGROUND_MAX_ATTEMPTS) return

      backgroundTimer = setTimeout(() => {
        backgroundAttempts += 1
        void (async () => {
          const result = await loadReviewState({ background: true })
          if (result.loaded || cancelled) return
          if (result.transient) {
            scheduleBackgroundReload(REVIEW_STATE_BACKGROUND_RETRY_MS)
          } else if (result.pendingReport) {
            scheduleBackgroundReload(REVIEW_STATE_PENDING_REPORT_RETRY_MS)
          }
        })()
      }, delayMs)
    }

    void (async () => {
      const result = await loadReviewState()
      if (result.loaded || cancelled) return
      if (result.transient) {
        setAllowApproveWithoutReviewState(true)
        scheduleBackgroundReload(REVIEW_STATE_BACKGROUND_RETRY_MS)
      } else if (result.pendingReport) {
        scheduleBackgroundReload(REVIEW_STATE_PENDING_REPORT_RETRY_MS)
      }
    })()

    return () => {
      cancelled = true
      if (backgroundTimer) {
        clearTimeout(backgroundTimer)
      }
    }
  }, [enabled, reportId])

  const handleApprove = useCallback(async () => {
    if (!reportId || isApprovingRef.current || reviewState === 'accountant_approved') return
    if (reviewState === null && !allowApproveWithoutReviewState) return

    isApprovingRef.current = true
    setIsApproving(true)

    try {
      const { res, json } = await fetchBffJsonWithTransientRetry<ReviewBffPayload>(
        `/api/valuations/${encodeURIComponent(reportId)}/review/approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
        DEFAULT_BFF_TRANSIENT_RETRY_OPTIONS
      )

      if (!res.ok || !json.success) {
        throw new Error(
          resolveApproveFailureMessage(res, json, failedTitle, transientFailedDescription)
        )
      }

      setReviewState(json.data?.reviewState ?? 'accountant_approved')
      setAllowApproveWithoutReviewState(false)
      toast.success(approvedTitle)
    } catch (error) {
      const description = isNetworkFailure(error)
        ? transientFailedDescription
        : error instanceof Error
          ? error.message
          : undefined
      toast.error(failedTitle, { description })
    } finally {
      isApprovingRef.current = false
      setIsApproving(false)
    }
  }, [
    allowApproveWithoutReviewState,
    approvedTitle,
    failedTitle,
    reportId,
    reviewState,
    transientFailedDescription,
  ])

  const canApprove =
    enabled &&
    Boolean(reportId) &&
    reviewState !== 'accountant_approved' &&
    (reviewState !== null || allowApproveWithoutReviewState)

  return {
    approveLabel,
    canApprove,
    handleApprove,
    isApproving,
    reviewState,
  }
}
