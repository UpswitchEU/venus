import { ApplicationError, NetworkError, ValidationError } from '../../types/errors'
import type { ValuationRequest, ValuationResponse, ValuationSession } from '../../types/valuation'
import { getErrorMessage } from '../../utils/errors/errorConverter'
import { createContextLogger } from '../../utils/logger'
import { globalSessionCache } from '../../utils/sessionCacheManager'
import { backendAPI } from '../backendApi'
import { VALUATION_OPERATION_TIMEOUT_MS } from '../api/valuationTimeouts'

const logger = createContextLogger('SessionService')

export type CompleteSessionSaveData = {
  formData?: Partial<ValuationRequest> & Record<string, unknown>
  valuationResult?: Partial<ValuationResponse>
  htmlReport?: string
}

type LoadSessionForCompleteSave = (reportId: string) => Promise<ValuationSession | null>

function finiteNumber(value: unknown): number | undefined {
  const numeric =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(numeric) ? numeric : undefined
}

export async function saveCompleteValuationSession(
  reportId: string,
  data: CompleteSessionSaveData,
  loadSession: LoadSessionForCompleteSave
): Promise<void> {
  const startTime = performance.now()

  try {
    logger.debug('Saving complete session', {
      reportId,
      hasFormData: !!data.formData,
      hasResult: !!data.valuationResult,
      hasHtmlReport: !!data.htmlReport,
    })

    const { SessionAPI } = await import('../api/session/SessionAPI')
    const sessionAPI = new SessionAPI()
    const sessionUpdate: Partial<ValuationRequest> = {}

    if (data.formData) {
      Object.assign(sessionUpdate, {
        company_name: data.formData.company_name,
        country_code: data.formData.country_code,
        industry: data.formData.industry,
        business_model: data.formData.business_model,
        founding_year: data.formData.founding_year,
        current_year_data: data.formData.current_year_data,
        historical_years_data: data.formData.historical_years_data,
        number_of_employees: data.formData.number_of_employees,
        number_of_owners: data.formData.number_of_owners,
        recurring_revenue_percentage: data.formData.recurring_revenue_percentage,
        shares_for_sale: 100,
        business_type_id: data.formData.business_type_id,
        business_context: data.formData.business_context,
        comparables: data.formData.comparables,
      })
    }

    if (Object.keys(sessionUpdate).length > 0) {
      const sessionUpdates: Partial<ValuationSession> = {
        sessionData: sessionUpdate,
      }
      await backendAPI.updateValuationSession(reportId, sessionUpdates, {
        timeout: VALUATION_OPERATION_TIMEOUT_MS,
      })
      logger.debug('Session data updated', { reportId })
    }

    if (data.valuationResult || data.htmlReport) {
      await sessionAPI.saveValuationResult(reportId, {
        valuationResult: data.valuationResult,
        htmlReport: data.htmlReport,
      })

      logger.debug('Valuation result saved', {
        reportId,
        hasHtmlReport: !!data.htmlReport,
      })
    }

    let freshSession: ValuationSession | null = null
    try {
      globalSessionCache.remove(reportId)
      freshSession = await loadSession(reportId)

      if (freshSession) {
        globalSessionCache.set(reportId, freshSession)

        logger.debug('Cache updated with fresh valuation data', {
          reportId,
          hasHtmlReport: !!freshSession.htmlReport,
          hasValuationResult: !!freshSession.valuationResult,
        })
      } else {
        logger.warn('Failed to reload session after save, cache remains cleared', { reportId })
      }
    } catch (cacheError) {
      logger.error('Failed to update cache after save', {
        reportId,
        error: getErrorMessage(cacheError),
      })
    }

    if (data.valuationResult && typeof window !== 'undefined') {
      try {
        const { broadcastReportUpdated } = await import('../../utils/auth/cross-domain-logout')
        const { useVersionHistoryStore } = await import('../../store/useVersionHistoryStore')
        const { useClientContext } = await import('../../stores/clientContext')

        const versionStore = useVersionHistoryStore.getState()
        const versions = versionStore.versions[reportId] || []
        const latestVersion = versionStore.getLatestVersion(reportId)
        const clientContext = useClientContext.getState()

        broadcastReportUpdated({
          reportId,
          reportName: freshSession?.name,
          updatedAt: new Date(),
          clientId: clientContext.isActingAsClient
            ? (clientContext.relationshipId ?? undefined)
            : undefined,
          valuationResult: {
            equity_value_low: finiteNumber(data.valuationResult.equity_value_low),
            equity_value_mid: finiteNumber(data.valuationResult.equity_value_mid),
            equity_value_high: finiteNumber(data.valuationResult.equity_value_high),
            recommended_asking_price: finiteNumber(data.valuationResult.recommended_asking_price),
            confidence_score: finiteNumber(data.valuationResult.confidence_score),
            methodology: data.valuationResult.methodology,
          },
          versionCount: versions.length,
          latestVersion: latestVersion
            ? {
                versionNumber: latestVersion.versionNumber,
                createdAt: latestVersion.createdAt,
                changes: latestVersion.changesSummary,
              }
            : undefined,
        })

        logger.debug('Report update broadcasted to Mercury', { reportId })
      } catch (broadcastError) {
        logger.warn('Failed to broadcast report update', {
          reportId,
          error: getErrorMessage(broadcastError),
        })
      }
    }

    const duration = performance.now() - startTime

    logger.debug('Complete session saved successfully', {
      reportId,
      duration_ms: duration.toFixed(2),
    })
  } catch (error) {
    const duration = performance.now() - startTime

    if (error instanceof ValidationError) {
      logger.warn('Failed to save complete session - validation error', {
        error: error.message,
        field: error.field,
        reportId,
        duration_ms: duration.toFixed(2),
      })
      throw error
    }
    if (error instanceof NetworkError && error.retryable) {
      logger.warn('Failed to save complete session - network error (retryable)', {
        error: error.message,
        reportId,
        duration_ms: duration.toFixed(2),
      })
      throw error
    }

    logger.error('Failed to save complete session - unknown error', {
      error: getErrorMessage(error),
      reportId,
      duration_ms: duration.toFixed(2),
    })
    throw new ApplicationError(
      `Failed to save complete session: ${getErrorMessage(error)}`,
      'SESSION_SAVE_COMPLETE_FAILED',
      {
        originalError: error,
        reportId,
        duration_ms: duration.toFixed(2),
      }
    )
  }
}
