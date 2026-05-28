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
import { getFirstRenderableReportHtml } from '../../utils/safetyNetReportHtml'
import { backendAPI } from '../backendApi'

const logger = createContextLogger('SessionService')

/** Coalesce concurrent self-heal calls per Titan report identifier (Strict Mode safe). */
const ensureHtmlCoalesced = new Map<string, Promise<ValuationSessionResponse | null>>()
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
  ensureHtmlCoalesced.clear()
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

function sessionHasRenderableHtml(session: ValuationSession): boolean {
  const valuationResult = session.valuationResult as Record<string, unknown> | null | undefined
  const detailsHtml =
    typeof valuationResult?.details === 'object' && valuationResult.details !== null
      ? (valuationResult.details as { html_report?: string }).html_report
      : undefined

  return !!getFirstRenderableReportHtml(
    session.htmlReport,
    typeof valuationResult?.html_report === 'string' ? valuationResult.html_report : undefined,
    detailsHtml
  )
}

function sessionUsableHtmlMissing(session: ValuationSession): boolean {
  return !sessionHasRenderableHtml(session)
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

export function sessionNeedsRenderableHtmlRecovery(session: ValuationSession): boolean {
  if (!session?.valuationResult) return false
  if (!valuationSnapshotHasRange(session.valuationResult)) return false
  return sessionUsableHtmlMissing(session)
}

function sessionNeedsHtmlRecovery(session: ValuationSession): boolean {
  return sessionNeedsRenderableHtmlRecovery(session)
}

async function executeEnsureHtmlRefetch(params: {
  reportId: string
  mergedSession: ValuationSession
  ensureTargetId: string
  sessionKeyBody: string | undefined
  alternateReportId: string | undefined
  dedupeKey: string
}): Promise<ValuationSessionResponse | null> {
  const { reportId, mergedSession, ensureTargetId, sessionKeyBody, alternateReportId, dedupeKey } =
    params
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
      if (!next?.session) continue

      const renderableHtml = getFirstRenderableReportHtml(
        next.session.htmlReport,
        (next.session.valuationResult as { html_report?: string } | null | undefined)
          ?.html_report,
        (
          next.session.valuationResult as
            | { details?: { html_report?: string } }
            | null
            | undefined
        )?.details?.html_report
      )
      if (renderableHtml) {
        return next
      }

      logger.warn('HTML self-heal refetch returned session without renderable HTML', {
        reportId: reportId?.substring(0, 24),
        lookupId: id?.substring(0, 24),
      })
    }

    markEnsureHtmlFailure(dedupeKey)
    return null
  } catch (error) {
    logger.warn('tryRefetchAfterEnsureHtml failed', {
      reportId,
      error: getErrorMessage(error),
    })
    markEnsureHtmlFailure(dedupeKey)
    return null
  }
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

  const coalesced = ensureHtmlCoalesced.get(dedupeKey)
  if (coalesced) {
    return coalesced
  }

  const run = executeEnsureHtmlRefetch({
    reportId,
    mergedSession,
    ensureTargetId,
    sessionKeyBody,
    alternateReportId,
    dedupeKey,
  })
  ensureHtmlCoalesced.set(dedupeKey, run)
  void run.finally(() => {
    ensureHtmlCoalesced.delete(dedupeKey)
  })
  return run
}
