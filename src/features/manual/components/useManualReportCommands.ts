import { useManualReportApproval, useManualReportAttestation } from '../hooks'
import { useManualUrlActions } from './useManualUrlActions'

interface UseManualReportCommandsParams {
  canDownloadPdf: boolean
  handleExport: () => void
  handlePreview: () => void
  isAccountantMode: boolean
  isExporting: boolean
  isPdfGenerating: boolean
  pdfStale: boolean
  report: unknown
  reportId: string
  resolvedReportId?: string | null
  showFullAdvisorMethodNav: boolean
  translate: (key: string) => string
  urlAction?: string | null
}

export function useManualReportCommands({
  canDownloadPdf,
  handleExport,
  handlePreview,
  isAccountantMode,
  isExporting,
  isPdfGenerating,
  pdfStale,
  report,
  reportId,
  resolvedReportId,
  showFullAdvisorMethodNav,
  translate,
  urlAction,
}: UseManualReportCommandsParams) {
  const attestReportId = resolvedReportId ?? reportId ?? null
  const reportCommandEnabled =
    showFullAdvisorMethodNav && isAccountantMode && !!report && !!attestReportId

  const { canSignAttest, handleSignAttest, isAttesting } = useManualReportAttestation({
    reportId: attestReportId,
    enabled: reportCommandEnabled,
    startedTitle: translate('attestStarted'),
    successTitle: translate('attestSuccess'),
    successDescription: translate('attestSuccessDesc'),
    failedTitle: translate('attestFailed'),
    notFinalizedDescription: translate('attestReportNotFinalized'),
  })

  const { approveLabel, canApprove, handleApprove, isApproving } = useManualReportApproval({
    reportId: attestReportId,
    enabled: reportCommandEnabled,
    approveLabel: translate('approveValuation'),
    approvedTitle: translate('valuationApproved'),
    failedTitle: translate('approveValuationFailed'),
    transientFailedDescription: translate('approveValuationTransientFailed'),
  })

  useManualUrlActions({
    attestReportId,
    canDownloadPdf,
    handleExport,
    handlePreview,
    isExporting,
    isPdfGenerating,
    pdfStale,
    report,
    urlAction,
  })

  return {
    approveLabel,
    canApprove,
    canSignAttest,
    handleApprove,
    handleSignAttest,
    isApproving,
    isAttesting,
  }
}
