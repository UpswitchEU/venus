import { useTransitionRouter } from 'next-view-transitions'
import { type Dispatch, type SetStateAction, useCallback } from 'react'
import { trackFullscreenOpen, trackPreviewOpen, trackVersionHistoryOpen } from '@/lib/analytics'
import type { RightPanelView, ValuationReportData } from '../../../components/calculator'
import { useManualMercuryNavigationActions } from './useManualMercuryNavigationActions'
import { useManualNewValuationFlow } from './useManualNewValuationFlow'
import {
  type UseManualPdfExportControllerParams,
  useManualPdfExportController,
} from './useManualPdfExportController'
import { useManualRecentValuationDeletion } from './useManualRecentValuationDeletion'
import { useManualRecentValuations } from './useManualRecentValuations'

interface ManualNavigationSession {
  reportId?: string | null
  name?: string | null
  updatedAt?: unknown
  createdAt?: unknown
}

type ManualNavigationReport = UseManualPdfExportControllerParams['report'] & {
  generatedAt?: Date | null
}

export interface UseManualNavigationControllerParams {
  activeSessionKey?: string | null
  canDownloadPdf: boolean
  clientCompanyName?: string | null
  clientContextId?: string | null
  collectedCompanyName?: string | null
  contextRelationshipId?: string | null
  currentLocale: string
  downloadPdf: UseManualPdfExportControllerParams['downloadPdf']
  isAccountantFlow: boolean
  isAccountantMode: boolean
  openStarterPaywall: (reason: 'pdf_download') => void
  pdfStale: boolean
  isPdfGenerating?: boolean
  report: ManualNavigationReport | null
  reportId: string
  resolvedReportId?: string | null
  session?: ManualNavigationSession | null
  setChatDrawerOpen: Dispatch<SetStateAction<boolean>>
  setReport: Dispatch<SetStateAction<ValuationReportData | null>>
  setRightPanelView: Dispatch<SetStateAction<RightPanelView>>
  setShowFullscreenModal: Dispatch<SetStateAction<boolean>>
  isMobile?: boolean
  translate: (key: string) => string
  translateReport: (key: string) => string
}

export function useManualNavigationController({
  activeSessionKey,
  canDownloadPdf,
  clientCompanyName,
  clientContextId,
  collectedCompanyName,
  contextRelationshipId,
  currentLocale,
  downloadPdf,
  isAccountantFlow,
  isAccountantMode,
  openStarterPaywall,
  pdfStale,
  isPdfGenerating,
  report,
  reportId,
  resolvedReportId,
  session,
  setChatDrawerOpen,
  setReport,
  setRightPanelView,
  setShowFullscreenModal,
  isMobile = false,
  translate,
  translateReport,
}: UseManualNavigationControllerParams) {
  const router = useTransitionRouter()

  const { isExporting, downloadHistory, handleExport } = useManualPdfExportController({
    report,
    reportId,
    resolvedReportId,
    canDownloadPdf,
    pdfStale,
    isPdfGenerating,
    downloadPdf,
    openPdfPaywall: () => openStarterPaywall('pdf_download'),
    defaultFilename: translateReport('defaultFilename'),
    pdfSuffix: translateReport('pdfSuffix'),
    staleHint: translate('downloadPdfStaleHint'),
    transientDownloadHint: translate('pdfPollDegradedHint'),
    exportFailedTitle: translate('pdfExportFailed'),
    exportFailedDescription: translate('pdfExportFailedDesc'),
    generatingTitle: translate('pdfGenerating'),
    downloadedTitle: translate('pdfDownloaded'),
  })

  const handlePreview = useCallback(() => {
    trackPreviewOpen()
    setRightPanelView('preview')
    if (isMobile) {
      setShowFullscreenModal(true)
    }
  }, [isMobile, setRightPanelView, setShowFullscreenModal])

  const handleShowHistory = useCallback(() => {
    trackVersionHistoryOpen()
    setRightPanelView('history')
  }, [setRightPanelView])

  const handleShowGraph = useCallback(() => {
    setRightPanelView('graph')
    // On mobile the report panel lives in the fullscreen modal — mirror preview
    // so opening the curve actually surfaces it.
    if (isMobile) {
      setShowFullscreenModal(true)
    }
  }, [isMobile, setRightPanelView, setShowFullscreenModal])

  const handleFullscreen = useCallback(() => {
    trackFullscreenOpen()
    setShowFullscreenModal(true)
  }, [setShowFullscreenModal])

  const handleOpenAssistant = useCallback(() => {
    setChatDrawerOpen((prev) => !prev)
  }, [setChatDrawerOpen])

  const { rawRecentValuations, setRawRecentValuations, fetchRecentValuations, recentValuations } =
    useManualRecentValuations({
      reportId,
      resolvedReportId,
      sessionReportId: session?.reportId,
      activeSessionKey,
      sessionName: session?.name,
      sessionUpdatedAt: session?.updatedAt,
      sessionCreatedAt: session?.createdAt,
      currentReport: report,
      collectedCompanyName,
      isAccountantFlow,
      clientCompanyName,
      unnamedLabel: translate('unnamed'),
    })

  const {
    showNewValuationModal,
    isConfirmingNewValuation,
    handleNewValuation,
    handleConfirmNewValuation,
    handleCancelNewValuation,
  } = useManualNewValuationFlow({
    currentLocale,
    reportId,
    collectedCompanyName,
    isAccountantFlow,
    clientCompanyName,
    isAccountantMode,
    clientContextId,
  })

  const handleSelectValuation = useCallback(
    (id: string) => {
      router.push(`/${currentLocale}/reports/${id}`)
    },
    [currentLocale, router]
  )

  const { deletingValuationId, handleDeleteValuation } = useManualRecentValuationDeletion({
    reportId,
    resolvedReportId,
    sessionReportId: session?.reportId,
    activeSessionKey,
    rawRecentValuations,
    setRawRecentValuations,
    fetchRecentValuations,
    isAccountantMode,
    clientContextId,
    collectedCompanyName,
    clientCompanyName,
    router,
    currentLocale,
    deleteReportFailedTitle: translateReport('deleteReportFailed'),
    setReport,
    setRightPanelView,
    setShowFullscreenModal,
  })

  const {
    mercuryLocale,
    handleBack,
    handleExitClientView,
    handleContinueImportReview,
    handleContinueToListing,
    handleLogout,
    handleAccountSettings,
    handleSwitchWorkspace,
    handleNavigateToDashboard,
    handleNavigateToBilling,
    handleNavigateToHelp,
    handleOpenMercuryClientForInvite,
  } = useManualMercuryNavigationActions({
    clientContextId,
    contextRelationshipId,
    currentLocale,
    report,
    session,
    resolvedReportId,
    router,
  })

  return {
    deletingValuationId,
    downloadHistory,
    handleAccountSettings,
    handleBack,
    handleCancelNewValuation,
    handleConfirmNewValuation,
    handleContinueImportReview,
    handleContinueToListing,
    handleDeleteValuation,
    handleExitClientView,
    handleExport,
    handleFullscreen,
    handleLogout,
    handleNavigateToBilling,
    handleNavigateToDashboard,
    handleNavigateToHelp,
    handleNewValuation,
    handleOpenAssistant,
    handleOpenMercuryClientForInvite,
    handlePreview,
    handleSelectValuation,
    handleShowGraph,
    handleShowHistory,
    handleSwitchWorkspace,
    isConfirmingNewValuation,
    isExporting,
    mercuryLocale,
    recentValuations,
    showNewValuationModal,
  }
}
