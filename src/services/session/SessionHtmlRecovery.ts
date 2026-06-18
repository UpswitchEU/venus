import type { ValuationSessionResponse } from '../../types/api-responses'
import type { ValuationSession } from '../../types/valuation'
import { getErrorMessage } from '../../utils/errors/errorConverter'
import { isSessionKey, isUuid } from '../../utils/identifiers'
import { createContextLogger } from '../../utils/logger'
import {
  extractRenderableHtmlFromSessionPayload,
  extractRenderableHtmlFromSources,
  isTransientEnsureHtmlSkipStatus,
  mergeRecoveredHtmlIntoValuationSnapshot,
  sessionNeedsRenderableHtmlRecovery,
} from '../../utils/reportHtmlRecovery'
import {
  orderedValuationSessionLookupIds,
  resolveEnsureHtmlAlternateReportId,
  resolveEnsureHtmlSessionKey,
} from '../../utils/sessionHelpers'
import { extractStableSessionKeyFromMergedSession } from '../../utils/sessionReportIdentity'
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
const REFETCH_AFTER_ENSURE_RETRY_DELAY_MS = 600
const REFETCH_AFTER_ENSURE_MAX_PASSES = 2

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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

function extractRenderableHtmlFromEnsureResponse(
  response: Record<string, unknown>
): string | undefined {
  return extractRenderableHtmlFromSources(
    typeof response.html_report_view === 'string' ? response.html_report_view : undefined,
    typeof response.html_report === 'string' ? response.html_report : undefined
  )
}

function buildSessionResponseWithInlineHtml(
  mergedSession: ValuationSession,
  html: string,
  reportId: string
): ValuationSessionResponse {
  const valuationResult = mergedSession.valuationResult
  const mergedValuationResult = valuationResult
    ? mergeRecoveredHtmlIntoValuationSnapshot(
        valuationResult as unknown as Record<string, unknown>,
        html
      )
    : mergeRecoveredHtmlIntoValuationSnapshot({}, html)
  const sessionData =
    mergedSession.sessionData && typeof mergedSession.sessionData === 'object'
      ? {
          ...(mergedSession.sessionData as Record<string, unknown>),
          _htmlReport: html,
          htmlReport: html,
          html_report: html,
        }
      : {
          _htmlReport: html,
          htmlReport: html,
          html_report: html,
        }

  return {
    success: true,
    session: {
      ...mergedSession,
      htmlReport: html,
      reportReady: true,
      valuationResult: mergedValuationResult,
      sessionData: sessionData as ValuationSession['sessionData'],
      reportId: mergedSession.reportId ?? reportId,
    },
  } as ValuationSessionResponse
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

export { sessionNeedsRenderableHtmlRecovery } from '../../utils/reportHtmlRecovery'

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

    const ensureResponse = res as Record<string, unknown>
    const inlineHtml = extractRenderableHtmlFromEnsureResponse(ensureResponse)

    if ((ensureResponse as { success?: boolean }).success === false) {
      if (inlineHtml) {
        clearEnsureHtmlFailure(dedupeKey)
        logger.info(
          'HTML self-heal applying inline html from ensure-html response (success=false)',
          {
            reportId: reportId?.substring(0, 24),
            htmlLength: inlineHtml.length,
          }
        )
        return buildSessionResponseWithInlineHtml(mergedSession, inlineHtml, reportId)
      }
      markEnsureHtmlFailure(dedupeKey)
      return null
    }

    if (!shouldRefetchAfterEnsureResponse(ensureResponse)) {
      if (inlineHtml) {
        clearEnsureHtmlFailure(dedupeKey)
        logger.info('HTML self-heal applying inline html from ensure-html response', {
          reportId: reportId?.substring(0, 24),
          status: typeof ensureResponse.status === 'string' ? ensureResponse.status : undefined,
          htmlLength: inlineHtml.length,
        })
        return buildSessionResponseWithInlineHtml(mergedSession, inlineHtml, reportId)
      }
      if (isTransientEnsureHtmlSkipStatus(ensureResponse)) {
        logger.debug('ensureReportHtml skipped by Titan render cooldown; allowing retry', {
          reportId: reportId?.substring(0, 24),
          status: ensureResponse.status,
        })
        return null
      }
      logger.debug('ensureReportHtml did not recover usable HTML yet; skipping refetch', {
        reportId: reportId?.substring(0, 24),
        status: typeof ensureResponse.status === 'string' ? ensureResponse.status : undefined,
      })
      markEnsureHtmlFailure(dedupeKey)
      return null
    }
    clearEnsureHtmlFailure(dedupeKey)

    const lookupIds = orderedValuationSessionLookupIds({
      ensureResponseReportId: ensureResponse.reportId,
      sessionKeyFallback: sessionKeyBody,
      mergedSessionReportId: mergedSession.reportId,
      urlReportId: reportId,
    })
    for (const id of lookupIds) {
      for (let pass = 0; pass < REFETCH_AFTER_ENSURE_MAX_PASSES; pass++) {
        if (pass > 0) {
          await sleep(REFETCH_AFTER_ENSURE_RETRY_DELAY_MS)
        }
        const next = await backendAPI.getValuationSession(id)
        if (!next?.session) continue

        const renderableHtml = extractRenderableHtmlFromSessionPayload(next.session)
        if (renderableHtml) {
          return next
        }
      }

      logger.warn('HTML self-heal refetch returned session without renderable HTML', {
        reportId: reportId?.substring(0, 24),
        lookupId: id?.substring(0, 24),
      })
    }

    if (inlineHtml) {
      clearEnsureHtmlFailure(dedupeKey)
      logger.info('HTML self-heal applying inline html after refetch miss', {
        reportId: reportId?.substring(0, 24),
        htmlLength: inlineHtml.length,
      })
      return buildSessionResponseWithInlineHtml(mergedSession, inlineHtml, reportId)
    }

    markEnsureHtmlFailure(dedupeKey)
    return null
  } catch (error) {
    logger.warn('tryRefetchAfterEnsureHtml failed', {
      reportId,
      error: getErrorMessage(error),
    })
    return null
  }
}

/**
 * Titan self-heal: when persisted valuation has a range but no usable HTML, render and store HTML.
 * Refetches the session on success so cache + Zustand pick up the report body.
 */
export async function tryRefetchAfterEnsureHtml(
  reportId: string,
  mergedSession: ValuationSession,
  options?: { bypassCooldown?: boolean }
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

  if (!options?.bypassCooldown && hasRecentEnsureHtmlFailure(dedupeKey)) {
    logger.debug('HTML self-heal skipped: recent render attempt failed', {
      reportId: reportId?.substring(0, 24),
      cooldownMs: ENSURE_HTML_FAILURE_COOLDOWN_MS,
    })
    return null
  }

  if (!options?.bypassCooldown) {
    const coalesced = ensureHtmlCoalesced.get(dedupeKey)
    if (coalesced) {
      return coalesced
    }
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
