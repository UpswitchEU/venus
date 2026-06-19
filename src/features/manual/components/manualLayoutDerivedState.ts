import { shouldShowVenusAiDockFab } from '../../../components/calculator/venus-ai-dock-layout'
import { isReportDeleteInProgress } from '../utils/manualReportDeleteGuard'
import { hasManualRestorableReport } from '../utils/manualRestorableReport'

export function shouldRestoreExistingManualReport({
  isGenerating,
  report,
  reportId,
  resolvedReportId,
  session,
  sessionReportId,
}: {
  isGenerating: boolean
  report: unknown
  reportId?: string | null
  resolvedReportId?: string | null
  session: unknown
  sessionReportId?: string | null
}): boolean {
  return (
    !isReportDeleteInProgress(reportId) &&
    !isReportDeleteInProgress(resolvedReportId) &&
    !isReportDeleteInProgress(sessionReportId) &&
    !report &&
    !isGenerating &&
    !!session &&
    hasManualRestorableReport(session)
  )
}

export function shouldShowManualAssistantFab({
  chatDrawerOpen,
  isStartupAssistantRoute,
  methodPaywallOpen,
  showFullscreenModal,
  showNewValuationModal,
  showRecalculateConfirmation,
  showUnifiedNormalizationModal,
  showValuationEditModal,
}: {
  chatDrawerOpen: boolean
  isStartupAssistantRoute: boolean
  methodPaywallOpen: boolean
  showFullscreenModal: boolean
  showNewValuationModal: boolean
  showRecalculateConfirmation: boolean
  showUnifiedNormalizationModal: boolean
  showValuationEditModal: boolean
}): boolean {
  return shouldShowVenusAiDockFab({
    isStartupAssistantRoute,
    isAssistantOpen: chatDrawerOpen,
    isFullscreenModalOpen: showFullscreenModal,
    isBlockingModalOpen:
      showUnifiedNormalizationModal ||
      showValuationEditModal ||
      methodPaywallOpen ||
      showNewValuationModal ||
      showRecalculateConfirmation,
  })
}
