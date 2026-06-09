import type { MutableRefObject } from 'react'
import {
  FullscreenReportModal,
  type NormalizationItem,
  UnifiedNormalizationModal,
  type ValuationReportData,
} from '../../../components/calculator'
import { ValuationEditModal } from '../../../components/calculator/ValuationEditModal'
import { NewValuationModal } from '../../../components/NewValuationModal'
import { RecalculateConfirmationPopup } from '../../../components/normalization/RecalculateConfirmationPopup'
import type { ValuationResponse } from '../../../types/valuation'
import type { ManualReportMethodHydrationError } from '../hooks/useManualReportMethodHydration'
import { getManualHydratedValuationResults } from '../utils/manualLayoutAdapters'
import {
  ManualStarterPaywallModal,
  type ManualStarterPaywallReason,
} from './ManualStarterPaywallModal'
import type { CollectedData } from './manualLayoutDataTypes'

interface GuidedNormalizationPrefill {
  initialSearchQuery?: string
  initialYearFilter?: number | null
}

export interface ManualLayoutModalsProps {
  allowedMethodKeys: readonly string[] | null
  canDownloadPdf: boolean
  clientContextId?: string | null
  collectedData: CollectedData
  currentLocale: string
  currentVersionNumber: number
  ctxRelationshipId?: string | null
  effectiveIsRestoringExistingReport: boolean
  financialYears: number[]
  formCountry?: string | null
  guidedNormalizationPrefill: GuidedNormalizationPrefill | null
  handleCancelNewValuation: () => void
  handleCancelRecalculate: () => void
  handleConfirmNewValuation: () => void
  handleConfirmRecalculate: () => void
  handleContinueImportReview: () => void
  handleExport: () => void
  handleNormalizationsChange: (normalizations: NormalizationItem[]) => Promise<void> | void
  handleOpenMercuryClientForInvite: () => void
  handleSelectMethodWithOverride: (method: string, reason?: string, note?: string) => void
  handleUnifiedNormalizationModalOpenChange: (open: boolean) => void
  hasImportedNormalizationData: boolean
  isAccountantMode: boolean
  isCalculating: boolean
  isConfirmingNewValuation: boolean
  isExporting?: boolean
  isGenerating: boolean
  isHydratingEditModalData: boolean
  isMethodSwitchRendering: boolean
  lastFullYear: number
  latestFormDataRef: MutableRefObject<Record<string, unknown> | null>
  methodPaywallOpen: boolean
  methodPaywallReason: ManualStarterPaywallReason
  normalizationItems: NormalizationItem[]
  openStarterPaywall: (reason: ManualStarterPaywallReason) => void
  originalEBITDA: number
  originalEBITDAByYear: Record<number, number>
  recalculatePopupFlags: {
    hasFormChanges: boolean
    hasNormalizations: boolean
  }
  report: ValuationReportData | null
  reportId: string
  reportMethodHydrationError: ManualReportMethodHydrationError
  resolvedReportId?: string | null
  result: ValuationResponse | null
  retryReportMethodHydration: () => void
  selectedMethod: string
  setMethodPaywallOpen: (open: boolean) => void
  setShowFullscreenModal: (open: boolean) => void
  setShowValuationEditModal: (open: boolean) => void
  showFiscalReferenceForOmni: boolean | null
  showFullscreenModal: boolean
  showFullAdvisorMethodNav: boolean
  showNewValuationModal: boolean
  showPreparerMultiplePanel: boolean
  showRecalculateConfirmation: boolean
  showUnifiedNormalizationModal: boolean
  showValuationEditModal: boolean
  translate: (key: string) => string
  userFirmCountryCode?: string | null
}

export function ManualLayoutModals({
  allowedMethodKeys,
  canDownloadPdf,
  clientContextId,
  collectedData,
  currentLocale,
  currentVersionNumber,
  ctxRelationshipId,
  effectiveIsRestoringExistingReport,
  financialYears,
  formCountry,
  guidedNormalizationPrefill,
  handleCancelNewValuation,
  handleCancelRecalculate,
  handleConfirmNewValuation,
  handleConfirmRecalculate,
  handleContinueImportReview,
  handleExport,
  handleNormalizationsChange,
  handleOpenMercuryClientForInvite,
  handleSelectMethodWithOverride,
  handleUnifiedNormalizationModalOpenChange,
  hasImportedNormalizationData,
  isAccountantMode,
  isCalculating,
  isConfirmingNewValuation,
  isExporting = false,
  isGenerating,
  isHydratingEditModalData,
  isMethodSwitchRendering,
  lastFullYear,
  latestFormDataRef,
  methodPaywallOpen,
  methodPaywallReason,
  normalizationItems,
  openStarterPaywall,
  originalEBITDA,
  originalEBITDAByYear,
  recalculatePopupFlags,
  report,
  reportId,
  reportMethodHydrationError,
  resolvedReportId,
  result,
  retryReportMethodHydration,
  selectedMethod,
  setMethodPaywallOpen,
  setShowFullscreenModal,
  setShowValuationEditModal,
  showFiscalReferenceForOmni,
  showFullscreenModal,
  showFullAdvisorMethodNav,
  showNewValuationModal,
  showPreparerMultiplePanel,
  showRecalculateConfirmation,
  showUnifiedNormalizationModal,
  showValuationEditModal,
  translate,
  userFirmCountryCode,
}: ManualLayoutModalsProps) {
  return (
    <>
      <FullscreenReportModal
        open={showFullscreenModal}
        onOpenChange={setShowFullscreenModal}
        report={report}
        onDownload={handleExport}
        isExporting={isExporting}
        onShare={
          isAccountantMode && clientContextId
            ? () => {
                setShowFullscreenModal(false)
                handleOpenMercuryClientForInvite()
              }
            : undefined
        }
      />

      <RecalculateConfirmationPopup
        isOpen={showRecalculateConfirmation}
        currentVersion={currentVersionNumber}
        onConfirm={handleConfirmRecalculate}
        onCancel={handleCancelRecalculate}
        isCreating={isGenerating || isCalculating}
        hasFormChanges={recalculatePopupFlags.hasFormChanges}
        hasNormalizations={recalculatePopupFlags.hasNormalizations}
      />

      <NewValuationModal
        isOpen={showNewValuationModal}
        onConfirm={handleConfirmNewValuation}
        onCancel={handleCancelNewValuation}
        isConfirming={isConfirmingNewValuation}
      />

      <UnifiedNormalizationModal
        open={showUnifiedNormalizationModal}
        onOpenChange={handleUnifiedNormalizationModalOpenChange}
        companyName={collectedData.companyName || translate('company')}
        currentYear={lastFullYear}
        originalEBITDA={originalEBITDA}
        originalEBITDAByYear={originalEBITDAByYear}
        normalizations={normalizationItems}
        onNormalizationsChange={handleNormalizationsChange}
        countryCode={formCountry || 'BE'}
        hasUploadedData={hasImportedNormalizationData}
        onUploadClick={() => undefined}
        financialYears={financialYears}
        initialSearchQuery={guidedNormalizationPrefill?.initialSearchQuery ?? ''}
        initialYearFilter={guidedNormalizationPrefill?.initialYearFilter ?? null}
        fallbackFormDataRef={latestFormDataRef}
      />

      <ValuationEditModal
        open={showValuationEditModal}
        onClose={() => {
          if (isMethodSwitchRendering) return
          setShowValuationEditModal(false)
        }}
        valuationResults={getManualHydratedValuationResults(result) ?? {}}
        isHydratingMethods={isHydratingEditModalData}
        methodDataLoadError={reportMethodHydrationError}
        onRetryMethodDataLoad={retryReportMethodHydration}
        onContinueImportReview={
          reportMethodHydrationError === 'report_pending' && (clientContextId || ctxRelationshipId)
            ? handleContinueImportReview
            : undefined
        }
        selectedMethod={selectedMethod}
        onSelectMethod={handleSelectMethodWithOverride}
        fiscalAnchor={result?.fiscal_4x_anchor}
        showFiscalAnchorRow={showFiscalReferenceForOmni === true}
        result={result}
        preparerDisabled={isGenerating || isCalculating || effectiveIsRestoringExistingReport}
        industryLabel={collectedData.industry}
        businessTypeLabel={collectedData.businessType}
        countryCode={collectedData.country}
        showZeroDraftExport={showPreparerMultiplePanel}
        canExportZeroDraft={canDownloadPdf}
        zeroDraftReportId={resolvedReportId || reportId}
        zeroDraftBusinessName={collectedData.companyName ?? report?.companyName}
        zeroDraftCreatedAt={
          report?.generatedAt instanceof Date ? report.generatedAt.toISOString() : undefined
        }
        showPreparerMultiple={showPreparerMultiplePanel}
        isMethodPersisting={isMethodSwitchRendering}
        firmCountryCode={userFirmCountryCode ?? undefined}
        planAllowedMethodKeys={
          showFullAdvisorMethodNav && allowedMethodKeys ? [...allowedMethodKeys] : null
        }
        onPlanLockedMethodClick={
          showFullAdvisorMethodNav ? () => openStarterPaywall('methods') : undefined
        }
      />

      <ManualStarterPaywallModal
        currentLocale={currentLocale}
        isAdvisorAudience={showFullAdvisorMethodNav}
        onClose={() => setMethodPaywallOpen(false)}
        open={methodPaywallOpen}
        reason={methodPaywallReason}
      />
    </>
  )
}
