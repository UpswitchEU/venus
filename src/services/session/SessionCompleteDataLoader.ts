import type { ValuationSession } from '../../types/valuation'
import { getErrorMessage } from '../../utils/errors/errorConverter'
import { createContextLogger } from '../../utils/logger'
import { getFirstRenderableReportHtml } from '../../utils/safetyNetReportHtml'
import { backendAPI } from '../backendApi'

const logger = createContextLogger('SessionService')

type LoadSession = (reportId: string) => Promise<ValuationSession | null>

export interface CompleteValuationData {
  session: ValuationSession
  currentReport?: {
    html_report: string
    valuation_result: Record<string, unknown>
  }
  versions?: unknown[]
  pricingRange?: {
    min: number
    max: number
    suggested: number
  }
  previousPackages?: unknown[]
}

function finiteNumber(value: unknown): number | undefined {
  const numeric =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(numeric) ? numeric : undefined
}

function positiveFiniteNumber(value: unknown): number | undefined {
  const numeric = finiteNumber(value)
  return numeric !== undefined && numeric > 0 ? numeric : undefined
}

async function loadCurrentReport(
  reportId: string
): Promise<CompleteValuationData['currentReport'] | undefined> {
  try {
    const response = await backendAPI.getReport(reportId)
    const htmlReport = getFirstRenderableReportHtml(response?.html_report)
    if (htmlReport) {
      return {
        html_report: htmlReport,
        valuation_result: response as unknown as Record<string, unknown>,
      }
    }
    return undefined
  } catch (_error) {
    logger.debug('No current report found', { reportId })
    return undefined
  }
}

async function loadVersionHistory(reportId: string): Promise<unknown[] | undefined> {
  try {
    const { versionService } = await import('../version/VersionService')
    const response = await versionService.fetchVersions(reportId)
    return Array.isArray(response?.versions) ? response.versions : undefined
  } catch (_error) {
    logger.debug('No version history found', { reportId })
    return undefined
  }
}

async function loadPricingRange(
  reportId: string
): Promise<CompleteValuationData['pricingRange'] | undefined> {
  try {
    const report = await loadCurrentReport(reportId).catch(() => undefined)

    if (report?.valuation_result) {
      const result = report.valuation_result
      const low = finiteNumber(result.equity_value_low)
      const high = finiteNumber(result.equity_value_high)
      if (low !== undefined && high !== undefined) {
        return {
          min: low,
          max: high,
          suggested:
            positiveFiniteNumber(result.equity_value_mid) ??
            positiveFiniteNumber(result.recommended_asking_price) ??
            (low + high) / 2,
        }
      }
    }

    logger.debug('No pricing range available', { reportId })
    return undefined
  } catch (error) {
    logger.debug('Failed to load pricing range', { reportId, error: getErrorMessage(error) })
    return undefined
  }
}

async function loadPreviousPackages(): Promise<unknown[] | undefined> {
  try {
    const { useAuthStore } = await import('../../lib/auth')
    const authState = useAuthStore.getState()
    const userId = authState.user?.id

    if (!userId) {
      logger.debug('No user ID available for previous packages')
      return undefined
    }

    // TODO: Implement when backend API is available.
    logger.debug('Previous packages feature not yet fully implemented')
    return undefined
  } catch (error) {
    logger.debug('Failed to load previous packages', { error: getErrorMessage(error) })
    return undefined
  }
}

export async function loadCompleteValuationDataPackage(
  reportId: string,
  loadSession: LoadSession
): Promise<CompleteValuationData | null> {
  try {
    logger.debug('Loading complete valuation data package', { reportId })

    const session = await loadSession(reportId)
    if (!session) {
      logger.warn('Session not found, cannot load complete data', { reportId })
      return null
    }

    const [report, versions, pricing, packages] = await Promise.all([
      loadCurrentReport(reportId).catch((err) => {
        logger.warn('Failed to load current report', { reportId, error: err.message })
        return undefined
      }),
      loadVersionHistory(reportId).catch((err) => {
        logger.warn('Failed to load version history', { reportId, error: err.message })
        return undefined
      }),
      loadPricingRange(reportId).catch((err) => {
        logger.warn('Failed to load pricing range', { reportId, error: err.message })
        return undefined
      }),
      loadPreviousPackages().catch((err) => {
        logger.warn('Failed to load previous packages', { reportId, error: err.message })
        return undefined
      }),
    ])

    logger.debug('Complete valuation data loaded', {
      reportId,
      hasReport: !!report,
      versionsCount: versions?.length || 0,
      hasPricing: !!pricing,
      packagesCount: packages?.length || 0,
    })

    return {
      session,
      currentReport: report,
      versions,
      pricingRange: pricing,
      previousPackages: packages,
    }
  } catch (error) {
    logger.error('Failed to load complete valuation data', {
      reportId,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
