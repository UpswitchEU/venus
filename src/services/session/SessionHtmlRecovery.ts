import type { ValuationSessionResponse } from '../../types/api-responses'
import type { ValuationSession } from '../../types/valuation'
import { getErrorMessage } from '../../utils/errors/errorConverter'
import { isSessionKey, isUuid } from '../../utils/identifiers'
import { createContextLogger } from '../../utils/logger'
import {
  orderedValuationSessionLookupIds,
  resolveEnsureHtmlAlternateReportId,
  resolveEnsureHtmlSessionKey,
} from '../../utils/sessionHelpers'
import { extractStableSessionKeyFromMergedSession } from '../../utils/sessionReportIdentity'
import { backendAPI } from '../backendApi'

const logger = createContextLogger('SessionService')

/** Deduplicate concurrent self-heal calls per Titan report identifier */
const ensureHtmlInFlight = new Set<string>()
const ensureHtmlRecentFailures = new Map<string, number>()
// Per-tab permanent failures: dedupeKeys where retry is pointless until the
// underlying engine config / payload changes (e.g. 413 from ValuationIQ).
// Cleared on full page reload — that's the only signal we have that the
// operator may have raised the engine size limit or trimmed the payload.
const ensureHtmlPermanentFailures = new Set<string>()
const ENSURE_HTML_FAILURE_COOLDOWN_MS = 5 * 60 * 1000

function hasRecentEnsureHtmlFailure(dedupeKey: string): boolean {
  if (ensureHtmlPermanentFailures.has(dedupeKey)) return true
  const failedAt = ensureHtmlRecentFailures.get(dedupeKey)
  if (!failedAt) return false
  if (Date.now() - failedAt > ENSURE_HTML_FAILURE_COOLDOWN_MS) {
    ensureHtmlRecentFailures.delete(dedupeKey)
    return false
  }
  return true
}

function markEnsureHtmlFailure(dedupeKey: string): void {
  ensureHtmlRecentFailures.set(dedupeKey, Date.now())
}

function markEnsureHtmlPermanentFailure(dedupeKey: string): void {
  ensureHtmlPermanentFailures.add(dedupeKey)
  ensureHtmlRecentFailures.delete(dedupeKey)
}

function clearEnsureHtmlFailure(dedupeKey: string): void {
  ensureHtmlRecentFailures.delete(dedupeKey)
  ensureHtmlPermanentFailures.delete(dedupeKey)
}

/**
 * Test-only: reset the module-level dedupe / cooldown / permanent-failure
 * tracking. Keeping these Sets at module scope is intentional (they
 * deduplicate concurrent self-heal calls across the tab lifetime), but tests
 * that exercise the recovery flow must reset state to avoid order-dependent
 * pollution. Do NOT call this from production code paths.
 */
export function __resetEnsureHtmlStateForTests(): void {
  ensureHtmlInFlight.clear()
  ensureHtmlRecentFailures.clear()
  ensureHtmlPermanentFailures.clear()
}

function shouldRefetchAfterEnsureResponse(response: Record<string, unknown>): boolean {
  const status = typeof response.status === 'string' ? response.status : null
  if (!status) {
    return response.success !== false
  }
  return status === 'recovered' || status === 'already_present'
}

function isPayloadTooLargeStatus(response: Record<string, unknown>): boolean {
  return (
    typeof response.status === 'string' &&
    (response.status === 'payload_too_large' || response.status === 'PAYLOAD_TOO_LARGE')
  )
}

function valuationSnapshotHasRange(valuationResult: unknown): boolean {
  if (!valuationResult || typeof valuationResult !== 'object') return false
  const record = valuationResult as Record<string, unknown>
  return (
    record.equity_value_mid != null ||
    record.equity_value_low != null ||
    record.equity_value_high != null
  )
}

function sessionUsableHtmlMissing(session: ValuationSession): boolean {
  const htmlReport = session.htmlReport
  if (typeof htmlReport === 'string' && htmlReport.trim().length >= 100) return false

  const valuationResult = session.valuationResult as Record<string, unknown> | null | undefined
  if (!valuationResult) return true

  const topLevelHtml =
    typeof valuationResult.html_report === 'string' ? valuationResult.html_report : ''
  const detailsHtml =
    typeof valuationResult.details === 'object' && valuationResult.details !== null
      ? (valuationResult.details as { html_report?: string }).html_report
      : undefined
  const nestedHtml = typeof detailsHtml === 'string' ? detailsHtml : ''

  return Math.max(topLevelHtml.trim().length, nestedHtml.trim().length) < 100
}

function pickTitanReportIdForEnsure(urlId: string, session: ValuationSession): string | null {
  const sessionKey = extractStableSessionKeyFromMergedSession(session)
  const mergedReport =
    typeof session.reportId === 'string' &&
    (isUuid(session.reportId) || isSessionKey(session.reportId))
      ? session.reportId.trim()
      : undefined

  // Prefer stable handles: session key resolves to the current row even when the URL
  // still carries an older valuation_reports.id after re-save / version link-updates.
  if (sessionKey) return sessionKey
  if (isSessionKey(urlId)) return urlId
  if (mergedReport) return mergedReport
  if (isUuid(urlId)) return urlId
  return null
}

function sessionNeedsHtmlRecovery(session: ValuationSession): boolean {
  if (!session?.valuationResult) return false
  if (!valuationSnapshotHasRange(session.valuationResult)) return false
  return sessionUsableHtmlMissing(session)
}

/**
 * Titan self-heal: when persisted valuation has a range but no usable HTML, render and store HTML.
 * Refetches the session on success so cache + Zustand pick up the report body.
 */
export async function tryRefetchAfterEnsureHtml(
  reportId: string,
  mergedSession: ValuationSession
): Promise<ValuationSessionResponse | null> {
  if (!sessionNeedsHtmlRecovery(mergedSession)) {
    return null
  }

  const ensureTargetId = pickTitanReportIdForEnsure(reportId, mergedSession)
  if (!ensureTargetId) {
    logger.debug(
      'HTML self-heal skipped: no Titan report identifier (need session key or report UUID)',
      {
        reportId: reportId?.substring(0, 24),
      }
    )
    return null
  }

  const sessionKeyBody = resolveEnsureHtmlSessionKey({
    urlReportId: reportId,
    mergedSession,
    ensureTargetId,
  })
  const alternateReportId = resolveEnsureHtmlAlternateReportId({
    urlReportId: reportId,
    mergedSession,
  })
  const dedupeKey = `${ensureTargetId}|${sessionKeyBody ?? ''}|${alternateReportId ?? ''}`

  if (hasRecentEnsureHtmlFailure(dedupeKey)) {
    logger.debug('HTML self-heal skipped: recent render attempt failed', {
      reportId: reportId?.substring(0, 24),
      cooldownMs: ENSURE_HTML_FAILURE_COOLDOWN_MS,
    })
    return null
  }

  if (ensureHtmlInFlight.has(dedupeKey)) {
    return null
  }
  ensureHtmlInFlight.add(dedupeKey)

  try {
    const res = await backendAPI.ensureReportHtml(ensureTargetId, {
      sync: true,
      ...(sessionKeyBody ? { sessionKey: sessionKeyBody } : {}),
      ...(alternateReportId ? { alternateReportId } : {}),
    })
    if (res == null) {
      logger.debug(
        'ensureReportHtml returned null (upstream error or self-heal disabled) — not refetching',
        {
          reportId: reportId?.substring(0, 24),
        }
      )
      markEnsureHtmlFailure(dedupeKey)
      return null
    }
    // Check the terminal `payload_too_large` status BEFORE the generic
    // success-flag check. The current Titan contract returns success:true
    // alongside this status, but we must not depend on that — flipping the
    // flag later would otherwise downgrade a permanent failure into the
    // transient 5-minute cooldown path and resume the retry loop.
    if (isPayloadTooLargeStatus(res)) {
      logger.error(
        'ensureReportHtml aborted — render payload exceeds engine size limit (413). ' +
          'Operator must raise VALUATION_IQ_MAX_REQUEST_SIZE_MB or trim the report payload. ' +
          'Suppressing further retries for this report in this tab.',
        {
          reportId: reportId?.substring(0, 24),
          status: typeof res.status === 'string' ? res.status : undefined,
        }
      )
      markEnsureHtmlPermanentFailure(dedupeKey)
      // Surface to the report viewer so it can replace the generic
      // "report not available" fallback with an actionable message.
      // Dynamic import avoids a static cycle (store -> services -> store).
      try {
        const { useSessionStore } = await import('../../store/useSessionStore')
        useSessionStore.getState().setRenderError('payload_too_large')
      } catch (storeError) {
        logger.warn('Failed to set renderError on session store', {
          reportId: reportId?.substring(0, 24),
          error: getErrorMessage(storeError),
        })
      }
      return null
    }
    if ((res as { success?: boolean }).success === false) {
      markEnsureHtmlFailure(dedupeKey)
      return null
    }
    if (!shouldRefetchAfterEnsureResponse(res)) {
      logger.debug('ensureReportHtml did not recover usable HTML yet; skipping refetch', {
        reportId: reportId?.substring(0, 24),
        status: typeof res.status === 'string' ? res.status : undefined,
      })
      markEnsureHtmlFailure(dedupeKey)
      return null
    }
    clearEnsureHtmlFailure(dedupeKey)

    const lookupIds = orderedValuationSessionLookupIds({
      ensureResponseReportId: (res as { reportId?: unknown }).reportId,
      sessionKeyFallback: sessionKeyBody,
      mergedSessionReportId: mergedSession.reportId,
      urlReportId: reportId,
    })
    for (const id of lookupIds) {
      const next = await backendAPI.getValuationSession(id)
      if (next?.session) {
        return next
      }
    }
    return null
  } catch (error) {
    logger.warn('tryRefetchAfterEnsureHtml failed', {
      reportId,
      error: getErrorMessage(error),
    })
    markEnsureHtmlFailure(dedupeKey)
    return null
  } finally {
    ensureHtmlInFlight.delete(dedupeKey)
  }
}
