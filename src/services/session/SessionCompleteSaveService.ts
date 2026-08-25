import { ApplicationError, NetworkError, ValidationError } from '../../types/errors'
import type { ValuationRequest, ValuationResponse, ValuationSession } from '../../types/valuation'
import { getErrorMessage } from '../../utils/errors/errorConverter'
import { createContextLogger } from '../../utils/logger'
import {
  businessTypeWeightsFromSegments,
  resolveBusinessTypeSegments,
} from '../../utils/normalizeBusinessTypeSegments'
import { promoteSavedReportIdentity } from '../../utils/reportIdentityPromotion'
import { globalSessionCache } from '../../utils/sessionCacheManager'
import { validateOptionalValuationCompanyGraphContext } from '../../utils/valuationCompanyGraphContext'
import {
  getEquityValueHigh,
  getEquityValueLow,
  getFinalValuation,
  getRecommendedAskingPrice,
} from '../../utils/valuationResultAccess'
import { VALUATION_OPERATION_TIMEOUT_MS } from '../api/valuationTimeouts'
import { backendAPI } from '../backendApi'

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

function optionalNumber(value: number | null): number | undefined {
  return value == null ? undefined : value
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
    let canonicalReportId = reportId
    const sessionUpdate: Partial<ValuationRequest> = {}

    if (data.formData) {
      validateOptionalValuationCompanyGraphContext(data.formData.company_graph_context)
      const businessTypeSegments = resolveBusinessTypeSegments({
        business_type_segments: data.formData.business_type_segments,
        business_type_mix: data.formData.business_type_mix,
        business_type_weights: data.formData.business_type_weights,
      })
      const businessTypeWeights =
        data.formData.business_type_weights ?? businessTypeWeightsFromSegments(businessTypeSegments)

      Object.assign(sessionUpdate, {
        ...data.formData,
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
        shares_for_sale: data.formData.shares_for_sale ?? 100,
        business_type_id: data.formData.business_type_id,
        business_type_segments:
          businessTypeSegments.length > 0
            ? businessTypeSegments
            : data.formData.business_type_segments,
        business_type_mix:
          businessTypeSegments.length > 0 ? businessTypeSegments : data.formData.business_type_mix,
        business_type_weights: businessTypeWeights,
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
      const saveResponse = await sessionAPI.saveValuationResult(reportId, {
        valuationResult: data.valuationResult,
        htmlReport: data.htmlReport,
      })
      const identity = promoteSavedReportIdentity({
        previousId: reportId,
        response: saveResponse,
        valuationResult: data.valuationResult,
      })
      canonicalReportId = identity.reportId ?? reportId

      logger.debug('Valuation result saved', {
        reportId,
        canonicalReportId,
        hasHtmlReport: !!data.htmlReport,
      })
    }

    let freshSession: ValuationSession | null = null
    const preSaveCache =
      globalSessionCache.get(canonicalReportId) ?? globalSessionCache.get(reportId)
    try {
      globalSessionCache.remove(canonicalReportId)
      freshSession = await loadSession(canonicalReportId)

      if (freshSession) {
        const canonicalSession = { ...freshSession, reportId: canonicalReportId }
        globalSessionCache.set(canonicalReportId, canonicalSession)
        if (canonicalReportId !== reportId) {
          globalSessionCache.set(reportId, canonicalSession)
        }

        logger.debug('Cache updated with fresh valuation data', {
          reportId: canonicalReportId,
          hasHtmlReport: !!freshSession.htmlReport,
          hasValuationResult: !!freshSession.valuationResult,
        })
      } else {
        if (preSaveCache) {
          globalSessionCache.set(canonicalReportId, preSaveCache)
        }
        logger.warn('Failed to reload session after save, previous cache restored', {
          reportId: canonicalReportId,
          hadPreSaveCache: !!preSaveCache,
        })
      }
    } catch (cacheError) {
      if (preSaveCache) {
        globalSessionCache.set(canonicalReportId, preSaveCache)
      }
      logger.error('Failed to update cache after save', {
        reportId,
        canonicalReportId,
        restoredPreviousCache: !!preSaveCache,
        error: getErrorMessage(cacheError),
      })
    }

    if (data.valuationResult && typeof window !== 'undefined') {
      try {
        const { broadcastReportUpdated } = await import('../../utils/auth/cross-domain-logout')
        const { useVersionHistoryStore } = await import('../../store/useVersionHistoryStore')
        const { useClientContext } = await import('../../stores/clientContext')

        const versionStore = useVersionHistoryStore.getState()
        const versions = versionStore.versions[canonicalReportId] || []
        const latestVersion = versionStore.getLatestVersion(canonicalReportId)
        const clientContext = useClientContext.getState()
        const broadcastValuationResult = data.valuationResult ?? {}
        const finalValuation = getFinalValuation(broadcastValuationResult)

        broadcastReportUpdated({
          reportId: canonicalReportId,
          reportName: freshSession?.name,
          updatedAt: new Date(),
          clientId: clientContext.isActingAsClient
            ? (clientContext.relationshipId ?? undefined)
            : undefined,
          valuationResult: {
            equity_value_low:
              optionalNumber(getEquityValueLow(broadcastValuationResult)) ??
              finiteNumber(data.valuationResult.equity_value_low),
            equity_value_mid: optionalNumber(finalValuation),
            equity_value_high:
              optionalNumber(getEquityValueHigh(broadcastValuationResult)) ??
              finiteNumber(data.valuationResult.equity_value_high),
            recommended_asking_price: optionalNumber(
              getRecommendedAskingPrice(broadcastValuationResult) ?? finalValuation
            ),
            confidence_score: finiteNumber(broadcastValuationResult.confidence_score),
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

        logger.debug('Report update broadcasted to Mercury', { reportId: canonicalReportId })
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
      canonicalReportId,
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
