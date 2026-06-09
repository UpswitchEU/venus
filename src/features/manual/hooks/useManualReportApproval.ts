import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

export type ReviewState =
  | 'auto_generated'
  | 'review_requested'
  | 'accountant_approved'
  | 'client_revised'

interface ReviewStateRow {
  reviewState: ReviewState
}

interface UseManualReportApprovalParams {
  reportId: string | null | undefined
  enabled: boolean
  approveLabel: string
  approvedTitle: string
  failedTitle: string
}

export function useManualReportApproval({
  reportId,
  enabled,
  approveLabel,
  approvedTitle,
  failedTitle,
}: UseManualReportApprovalParams) {
  const [reviewState, setReviewState] = useState<ReviewState | null>(null)
  const [isApproving, setIsApproving] = useState(false)
  const isApprovingRef = useRef(false)

  useEffect(() => {
    if (!enabled || !reportId) {
      setReviewState(null)
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/valuations/${encodeURIComponent(reportId)}/review`, {
          credentials: 'include',
        })
        const json = (await res.json().catch(() => ({}))) as {
          success?: boolean
          data?: ReviewStateRow
        }
        if (!cancelled) {
          if (res.ok && json.success && json.data?.reviewState) {
            setReviewState(json.data.reviewState)
          } else {
            setReviewState(null)
          }
        }
      } catch {
        if (!cancelled) setReviewState(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, reportId])

  const handleApprove = useCallback(async () => {
    if (!reportId || isApprovingRef.current || reviewState === 'accountant_approved') return

    isApprovingRef.current = true
    setIsApproving(true)
    try {
      const res = await fetch(
        `/api/valuations/${encodeURIComponent(reportId)}/review/approve`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      )
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean
        message?: string
        data?: ReviewStateRow
      }
      if (!res.ok || !json.success) {
        throw new Error(json.message || failedTitle)
      }
      setReviewState(json.data?.reviewState ?? 'accountant_approved')
      toast.success(approvedTitle)
    } catch (error) {
      toast.error(failedTitle, {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      isApprovingRef.current = false
      setIsApproving(false)
    }
  }, [approvedTitle, failedTitle, reportId, reviewState])

  const canApprove =
    enabled &&
    Boolean(reportId) &&
    reviewState !== null &&
    reviewState !== 'accountant_approved'

  return {
    approveLabel,
    canApprove,
    handleApprove,
    isApproving,
    reviewState,
  }
}
