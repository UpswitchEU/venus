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
}

const REVIEW_STATE_BACKGROUND_RETRY_MS = 8_000
const REVIEW_STATE_BACKGROUND_MAX_ATTEMPTS = 5

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
    (error instanceof Error &&
      (error.name === 'AbortError' || error.message === 'Failed to fetch'))
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
    let sawTransientLoadFailure = false

    const loadReviewState = async (options?: {
      background?: boolean
    }): Promise<LoadReviewStateResult> => {
      try {
        const { res, json } = await fetchBffJsonWithTransientRetry<ReviewBffPayload>(
          `/api/valuations/${encodeURIComponent(reportId)}/review`
        )
        if (cancelled) return { loaded: true, transient: false }

        if (res.ok && isSuccessfulReviewPayload(json)) {
          setReviewState(json.data.reviewState)
          setAllowApproveWithoutReviewState(false)
          return { loaded: true, transient: false }
        }

        const transient = isTransientUpstreamFailure(res, json)
        if (transient) {
          sawTransientLoadFailure = true
        } else if (!options?.background) {
          setReviewState(null)
          setAllowApproveWithoutReviewState(false)
        }

        return { loaded: false, transient }
      } catch (error) {
        if (!cancelled && !options?.background) {
          setReviewState(null)
        }
        if (isNetworkFailure(error)) {
          sawTransientLoadFailure = true
          return { loaded: false, transient: true }
        }
        if (!cancelled && !options?.background) {
          setAllowApproveWithoutReviewState(false)
        }
        return { loaded: false, transient: false }
      }
    }

    const scheduleBackgroundReload = () => {
      if (cancelled || !sawTransientLoadFailure) return
      if (backgroundAttempts >= REVIEW_STATE_BACKGROUND_MAX_ATTEMPTS) return

      backgroundTimer = setTimeout(() => {
        backgroundAttempts += 1
        void (async () => {
          const result = await loadReviewState({ background: true })
          if (result.loaded || cancelled) return
          if (result.transient) {
            scheduleBackgroundReload()
          }
        })()
      }, REVIEW_STATE_BACKGROUND_RETRY_MS)
    }

    void (async () => {
      const result = await loadReviewState()
      if (!result.loaded && !cancelled && result.transient) {
        setAllowApproveWithoutReviewState(true)
        scheduleBackgroundReload()
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
