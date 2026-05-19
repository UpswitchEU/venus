import type { ValuationSession } from '../../types/valuation'
import { getErrorMessage } from '../../utils/errors/errorConverter'
import { isSessionKey, isUuid } from '../../utils/identifiers'
import { createContextLogger } from '../../utils/logger'
import { getFirstRenderableReportHtml } from '../../utils/safetyNetReportHtml'
import { globalSessionCache } from '../../utils/sessionCacheManager'
import { mergeSessionFields, normalizeSessionDates } from '../../utils/sessionHelpers'
import { validateSessionData } from '../../utils/sessionValidation'
import { backendAPI } from '../backendApi'
import { tryRefetchAfterEnsureHtml } from './SessionHtmlRecovery'
import { backfillSparseSessionFromStoreSeed } from './SessionSparseBackfill'

const logger = createContextLogger('SessionService')

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export async function revalidateSessionCacheInBackground(reportId: string): Promise<void> {
  try {
    logger.debug('Starting background revalidation', { reportId })

    let sessionResponse = await backendAPI.getValuationSession(reportId)

    if (sessionResponse?.session) {
      validateSessionData(sessionResponse.session)
      let normalizedSession = normalizeSessionDates(sessionResponse.session)
      let mergedSession = mergeSessionFields(normalizedSession)
      await backfillSparseSessionFromStoreSeed(reportId, mergedSession)

      const afterEnsure = await tryRefetchAfterEnsureHtml(reportId, mergedSession)
      if (afterEnsure?.session) {
        sessionResponse = afterEnsure
        validateSessionData(sessionResponse.session)
        normalizedSession = normalizeSessionDates(sessionResponse.session)
        mergedSession = mergeSessionFields(normalizedSession)
      }

      const mergedSessionData = asRecord(mergedSession.sessionData) ?? {}
      const companyName = optionalString(mergedSessionData.company_name)
      const hasCompanyName = companyName && companyName.trim() !== ''
      const hasBusinessCardData = !!(
        hasCompanyName ||
        mergedSessionData.business_type_id ||
        mergedSessionData.founding_year ||
        mergedSessionData.country_code
      )

      if (hasBusinessCardData && hasCompanyName) {
        logger.debug('Business card data preserved during background revalidation', {
          reportId,
          company_name: mergedSessionData.company_name,
          business_type_id: mergedSessionData.business_type_id,
          founding_year: mergedSessionData.founding_year,
          country_code: mergedSessionData.country_code,
        })
      } else {
        logger.warn('No business card data during background revalidation', {
          reportId,
          hasSessionData: !!mergedSession.sessionData,
          sessionDataKeys: mergedSession.sessionData ? Object.keys(mergedSession.sessionData) : [],
        })
      }

      const canonicalReportId =
        typeof mergedSession.reportId === 'string' && mergedSession.reportId.trim()
          ? mergedSession.reportId.trim()
          : null
      const canonicalIsValid =
        canonicalReportId != null && (isUuid(canonicalReportId) || isSessionKey(canonicalReportId))

      globalSessionCache.set(reportId, mergedSession)
      if (canonicalIsValid && canonicalReportId !== reportId) {
        globalSessionCache.set(canonicalReportId, mergedSession)
      }

      logger.debug('Cache revalidated in background', {
        reportId,
        canonicalReportId: canonicalReportId?.substring(0, 36),
        hasHtmlReport: !!mergedSession.htmlReport,
      })

      try {
        const { useSessionStore } = await import('../../store/useSessionStore')
        const currentStoreSession = useSessionStore.getState().session
        const storeRid = currentStoreSession?.reportId
        const shouldSyncStore =
          storeRid != null &&
          (storeRid === reportId ||
            (canonicalIsValid && canonicalReportId != null && storeRid === canonicalReportId))

        if (shouldSyncStore) {
          const { useManualResultsStore } = await import('../../store/manual/useManualResultsStore')
          const existingResult = useManualResultsStore.getState().result
          const revalidatedScreenHtml = getFirstRenderableReportHtml(
            mergedSession.htmlReport,
            (mergedSession.valuationResult as { html_report?: string } | null | undefined)
              ?.html_report,
            (
              mergedSession.valuationResult as
                | { details?: { html_report?: string } }
                | null
                | undefined
            )?.details?.html_report
          )
          const safeHtmlForStores =
            revalidatedScreenHtml ||
            getFirstRenderableReportHtml(
              (existingResult as { html_report?: string } | null | undefined)?.html_report,
              (existingResult as { details?: { html_report?: string } } | null | undefined)?.details
                ?.html_report
            )
          const hydratePayload: Partial<ValuationSession> = {
            htmlReport: safeHtmlForStores,
            valuationResult: mergedSession.valuationResult,
            sessionData: mergedSession.sessionData,
          }
          if (canonicalIsValid && canonicalReportId && storeRid && canonicalReportId !== storeRid) {
            hydratePayload.reportId = canonicalReportId
          }
          useSessionStore.getState().hydrateSession(hydratePayload)

          if (safeHtmlForStores || mergedSession.valuationResult) {
            try {
              const fullResult = {
                ...(existingResult || {}),
                ...(mergedSession.valuationResult || {}),
                html_report: safeHtmlForStores,
              }
              const manualResultsStore = useManualResultsStore.getState()
              manualResultsStore.setResult(
                fullResult as Parameters<typeof manualResultsStore.setResult>[0]
              )
              if (safeHtmlForStores) {
                manualResultsStore.setHtmlReport(safeHtmlForStores)
              }
            } catch (resultsStoreError) {
              logger.warn('Failed to hydrate results store after revalidation', {
                reportId,
                error:
                  resultsStoreError instanceof Error
                    ? resultsStoreError.message
                    : String(resultsStoreError),
              })
            }
          }

          logger.info('Session store updated with revalidated HTML reports', {
            reportId,
            hasHtmlReport: !!safeHtmlForStores,
          })
        } else {
          logger.debug('Skipping store update - active session does not match revalidated report', {
            revalidationKey: reportId,
            canonicalReportId,
            currentStoreReportId: storeRid,
          })
        }
      } catch (storeError) {
        logger.warn('Failed to update session store after revalidation', {
          reportId,
          error: storeError instanceof Error ? storeError.message : String(storeError),
        })
      }
    } else {
      logger.debug('Session not found during revalidation', { reportId })
    }
  } catch (error) {
    logger.warn('Background revalidation failed', {
      reportId,
      error: getErrorMessage(error),
    })
  }
}
