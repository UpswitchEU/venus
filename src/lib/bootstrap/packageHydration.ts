import { SessionRestorationService } from '../../services/session/SessionRestorationService'
import { generalLogger } from '../../utils/logger'
import type { ReportState, SessionBootstrapState, ValuationPackage } from './types'

export function shouldHydrateBootstrapPackage(
  report: Pick<ReportState, 'mode' | 'reportReady'>,
  valuationPackage?: ValuationPackage
): boolean {
  return report.mode === 'existing' && report.reportReady !== false && !!valuationPackage
}

/**
 * Synchronous package hydration for the deferred microtask in BootstrapProvider.
 * Must not await dynamic import — otherwise useBootstrapSync can run first.
 */
export function applyBootstrapPackageHydration(
  result: Pick<SessionBootstrapState, 'report' | 'valuationPackage' | 'ui'>
): void {
  if (shouldHydrateBootstrapPackage(result.report, result.valuationPackage)) {
    const valuationPackage = result.valuationPackage
    if (!valuationPackage) return

    try {
      SessionRestorationService.hydrateFromPackage(
        result.report.reportId,
        valuationPackage,
        result.ui.suggestedFlow || 'manual'
      )
      generalLogger.debug('[BootstrapProvider] Package hydration complete (deferred)', {
        reportId: result.report.reportId.substring(0, 30),
        hasHtmlReport: !!valuationPackage.htmlReport,
      })
    } catch (hydrationError) {
      generalLogger.warn(
        '[BootstrapProvider] Package hydration failed - triggering full restoration',
        {
          error:
            hydrationError instanceof Error ? hydrationError.message : String(hydrationError),
        }
      )

      try {
        if (result.report.hasExistingData) {
          generalLogger.debug('[BootstrapProvider] Marking report for fallback restoration...', {
            reportId: result.report.reportId.substring(0, 30),
          })
          SessionRestorationService.markForRestoration(result.report.reportId)
        }
      } catch (fallbackError) {
        generalLogger.error('[BootstrapProvider] Fallback restoration setup failed', {
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        })
      }
    }
    return
  }

  if (result.report.mode === 'existing' && result.report.hasExistingData) {
    try {
      SessionRestorationService.markForRestoration(result.report.reportId)
      generalLogger.debug(
        '[BootstrapProvider] Deferred package hydration until explicit report readiness',
        {
          reportId: result.report.reportId.substring(0, 30),
          reportReady: result.report.reportReady,
          hasPackage: !!result.valuationPackage,
        }
      )
    } catch (fallbackError) {
      generalLogger.error('[BootstrapProvider] Failed to mark pending restoration', {
        error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      })
    }
  }
}
