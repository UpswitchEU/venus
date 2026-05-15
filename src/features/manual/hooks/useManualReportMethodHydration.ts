import { useCallback, useEffect, useState } from 'react'
import { backendAPI } from '../../../services/backendApi'
import { useManualResultsStore } from '../../../store/manual'
import { APIError, NetworkError, RateLimitError } from '../../../types/errors'
import type { ValuationResponse } from '../../../types/valuation'
import { isSessionKey } from '../../../utils/identifiers'
import { generalLogger } from '../../../utils/logger'
import { getRenderableReportHtmlFromCurrentOrFallback } from '../../../utils/safetyNetReportHtml'
import { getManualHydratedValuationResults } from '../utils/manualLayoutAdapters'

export type ManualReportMethodHydrationError = 'transient' | 'report_pending' | null

export interface UseManualReportMethodHydrationParams {
  firmCountryCode?: string | null
  reportHydrationLookupId?: string | null
  restorationComplete: boolean
  setResult: (result: ValuationResponse | null) => void
}

export interface UseManualReportMethodHydrationResult {
  isHydratingEditModalData: boolean
  reportMethodHydrationError: ManualReportMethodHydrationError
  retryReportMethodHydration: () => void
  showFiscalReferenceForOmni: boolean | null
}

const REPORT_METHOD_HYDRATION_BACKOFF_MS = [400, 1000, 2200] as const

export function useManualReportMethodHydration({
  firmCountryCode,
  reportHydrationLookupId,
  restorationComplete,
  setResult,
}: UseManualReportMethodHydrationParams): UseManualReportMethodHydrationResult {
  const [showFiscalReferenceForOmni, setShowFiscalReferenceForOmni] = useState<boolean | null>(null)
  const [isHydratingEditModalData, setIsHydratingEditModalData] = useState(false)
  const [reportMethodHydrationError, setReportMethodHydrationError] =
    useState<ManualReportMethodHydrationError>(null)
  const [reportHydrationRetryNonce, setReportHydrationRetryNonce] = useState(0)

  useEffect(() => {
    // Read-only trigger: incrementing the nonce intentionally re-runs this hydration effect.
    void reportHydrationRetryNonce
    const id = reportHydrationLookupId
    if (!id || id === 'new') {
      setShowFiscalReferenceForOmni(false)
      setIsHydratingEditModalData(false)
      setReportMethodHydrationError(null)
      return
    }

    if (!restorationComplete) return

    const existingResult = useManualResultsStore.getState().result
    const needsMethodHydration = !getManualHydratedValuationResults(existingResult)
    setIsHydratingEditModalData(needsMethodHydration)
    setReportMethodHydrationError(null)

    let cancelled = false

    const applySuccess = (reportResult: ValuationResponse) => {
      setShowFiscalReferenceForOmni(!!reportResult.show_fiscal_reference)

      const latestExistingResult = useManualResultsStore.getState().result
      const nextValuationResults =
        getManualHydratedValuationResults(reportResult) ??
        getManualHydratedValuationResults(latestExistingResult)
      const mergedResult: ValuationResponse = {
        ...(latestExistingResult || {}),
        ...reportResult,
        html_report: getRenderableReportHtmlFromCurrentOrFallback(
          [reportResult.html_report],
          [latestExistingResult?.html_report],
          {
            currentRenderFingerprint: reportResult.render_fingerprint,
            fallbackRenderFingerprint: latestExistingResult?.render_fingerprint,
          }
        ),
        valuation_results: nextValuationResults ?? undefined,
        fiscal_4x_anchor:
          reportResult.fiscal_4x_anchor ?? latestExistingResult?.fiscal_4x_anchor ?? null,
        multiple_adjustment_summary:
          reportResult.multiple_adjustment_summary ||
          latestExistingResult?.multiple_adjustment_summary,
      }

      setResult(mergedResult)
      setIsHydratingEditModalData(false)
      setReportMethodHydrationError(null)
    }

    const finishFailure = (lastError: unknown) => {
      if (cancelled) return

      const current = useManualResultsStore.getState().result
      if (!getManualHydratedValuationResults(current)) {
        setShowFiscalReferenceForOmni(false)
      }
      setIsHydratingEditModalData(false)

      const stillMissingMethods = !getManualHydratedValuationResults(current)
      const transient = stillMissingMethods && isRetryableReportHydrationError(lastError)
      const status = getHttpStatusFromError(lastError)

      if (transient) {
        generalLogger.warn('[ManualLayout] Report method hydration failed after retries', {
          reportHydrationLookupId: id,
          status,
          errorName: lastError instanceof Error ? lastError.name : typeof lastError,
        })
        setReportMethodHydrationError('transient')
      } else if (stillMissingMethods && isSessionKey(id) && status === 404) {
        setReportMethodHydrationError('report_pending')
      } else {
        setReportMethodHydrationError(null)
      }
    }

    void hydrateReportMethodData({
      applySuccess,
      finishFailure,
      isCancelled: () => cancelled,
      reportId: id,
    })

    return () => {
      cancelled = true
    }
  }, [reportHydrationLookupId, reportHydrationRetryNonce, restorationComplete, setResult])

  useEffect(() => {
    const firm = firmCountryCode?.trim().toUpperCase().substring(0, 2)
    if (firm === 'NL') {
      setShowFiscalReferenceForOmni(false)
    }
  }, [firmCountryCode])

  const retryReportMethodHydration = useCallback(() => {
    setReportHydrationRetryNonce((nonce) => nonce + 1)
  }, [])

  return {
    isHydratingEditModalData,
    reportMethodHydrationError,
    retryReportMethodHydration,
    showFiscalReferenceForOmni,
  }
}

async function hydrateReportMethodData({
  applySuccess,
  finishFailure,
  isCancelled,
  reportId,
}: {
  applySuccess: (result: ValuationResponse) => void
  finishFailure: (error: unknown) => void
  isCancelled: () => boolean
  reportId: string
}) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (isCancelled()) return
    if (attempt > 0) {
      await sleep(REPORT_METHOD_HYDRATION_BACKOFF_MS[attempt - 1])
      if (isCancelled()) return
    }

    try {
      const reportResult = await backendAPI.getReport(reportId)
      if (isCancelled()) return
      applySuccess(reportResult)
      return
    } catch (error) {
      if (attempt < 3 && isRetryableReportHydrationError(error)) {
        continue
      }
      finishFailure(error)
      return
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getHttpStatusFromError(err: unknown): number | undefined {
  if (err instanceof APIError) return err.statusCode
  const ax = err as { response?: { status?: number } }
  return ax?.response?.status
}

function isRetryableReportHydrationError(err: unknown): boolean {
  if (err instanceof NetworkError || err instanceof RateLimitError) return true
  const status = getHttpStatusFromError(err)
  return status === 429 || status === 502 || status === 503 || status === 504 || status === 408
}
