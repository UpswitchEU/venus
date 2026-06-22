'use client'

import { Download } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { METHOD_LABEL_KEYS } from '@/constants/methodLabels'
import { AuroraButton } from '@/design-system/components/Button'
import { Modal, ModalContent, ModalHeader, ModalTitle } from '@/design-system/components/Modal'
import { getValuationMethodResultForKey } from '@/utils/extractValuationResultsMap'
import { mergePlanGatedOmniPanoramaResults } from '@/utils/omniPlanPanorama'
import { buildZeroDraftCsv, downloadZeroDraftCsv } from '@/utils/zeroDraftCsv'
import { usePreparerMultipleStore } from '../../store/manual/usePreparerMultipleStore'
import type { ValuationMethodResult, ValuationResponse } from '../../types/valuation'
import { ValuationEditMethodSelectorPanel } from './ValuationEditMethodSelectorPanel'
import { MethodBreakdownSection, StakeCalculatorSection } from './ValuationEditModalBreakdown'
import { ValuationEditModalEmptyState } from './ValuationEditModalEmptyState'
import {
  getValuationEditModeForSelectedMethod,
  sanitizeZeroDraftFilename,
  type ValuationEditMode,
} from './ValuationEditModalModel'
import { buildValuationEditPreparerModel } from './ValuationEditModalPreparerModel'
import { ValuationEditModalPreparerSection } from './ValuationEditModalPreparerSection'

export interface ValuationEditModalProps {
  open: boolean
  onClose: () => void
  valuationResults: Record<string, ValuationMethodResult>
  isHydratingMethods?: boolean
  /** Set when report hydration failed after retries (e.g. 429) — distinct from missing payloads */
  methodDataLoadError?: 'transient' | 'report_pending' | null
  /** Re-fetch report method data (parent bumps hydration nonce); shown for transient errors */
  onRetryMethodDataLoad?: () => void
  /** Accountant recovery path: return to Mercury and open "Controleer & vul aan". */
  onContinueImportReview?: () => void
  selectedMethod: string
  onSelectMethod: (method: string, reason?: string, note?: string) => void
  fiscalAnchor?: number | null
  showFiscalAnchorRow?: boolean
  result: ValuationResponse | null
  preparerDisabled?: boolean
  onRecalculate?: () => void
  industryLabel?: string
  businessTypeLabel?: string
  countryCode?: string
  showZeroDraftExport?: boolean
  canExportZeroDraft?: boolean
  zeroDraftReportId?: string
  zeroDraftBusinessName?: string | null
  zeroDraftCreatedAt?: string | null
  showPreparerMultiple?: boolean
  /** True while PATCH + getReport merge runs after a method change (parent drives) */
  isMethodPersisting?: boolean
  /** Accountant firm country — hides BE-only fiscal method in method panorama */
  firmCountryCode?: string
  /** Null = all methods; list = plan restriction (shows locked rows as teasers) */
  planAllowedMethodKeys?: string[] | null
  onPlanLockedMethodClick?: () => void
}

export function ValuationEditModal({
  open,
  onClose,
  valuationResults,
  isHydratingMethods = false,
  methodDataLoadError = null,
  onRetryMethodDataLoad,
  onContinueImportReview,
  selectedMethod,
  onSelectMethod,
  fiscalAnchor,
  showFiscalAnchorRow = false,
  result,
  preparerDisabled,
  onRecalculate,
  industryLabel,
  businessTypeLabel,
  countryCode,
  showZeroDraftExport = false,
  canExportZeroDraft = true,
  zeroDraftReportId,
  zeroDraftBusinessName,
  zeroDraftCreatedAt,
  showPreparerMultiple = false,
  isMethodPersisting = false,
  firmCountryCode,
  planAllowedMethodKeys = null,
  onPlanLockedMethodClick,
}: ValuationEditModalProps) {
  const t = useTranslations('omniCalc')
  const tPrep = useTranslations('preparerMultiple')
  const tModal = useTranslations('valuationEditModal')
  const tMethodSelector = useTranslations('manualInput.methodSelector')
  const locale = useLocale()

  const getMethodLabel = useCallback(
    (key: string) => {
      const path = METHOD_LABEL_KEYS[key]
      if (!path) return key
      const short = path.replace('manualInput.methodSelector.', '') as Parameters<
        typeof tMethodSelector
      >[0]
      return tMethodSelector(short)
    },
    [tMethodSelector]
  )

  const panoramaValuationResults = useMemo(
    () =>
      mergePlanGatedOmniPanoramaResults(valuationResults, planAllowedMethodKeys ?? null, {
        hideFiscalForNl: firmCountryCode?.trim().toUpperCase().substring(0, 2) === 'NL',
        getLabel: getMethodLabel,
      }),
    [valuationResults, planAllowedMethodKeys, firmCountryCode, getMethodLabel]
  )

  const [mode, setMode] = useState<ValuationEditMode>(() =>
    getValuationEditModeForSelectedMethod(selectedMethod)
  )
  const [pendingMethod, setPendingMethod] = useState<string | null>(null)
  const [overrideReasonKey, setOverrideReasonKey] = useState('')
  const [overrideNote, setOverrideNote] = useState('')
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  // Per-modal-open "I dismissed the auto-suggestion" — keeps the suggestion
  // panel from re-appearing every render once the preparer made an
  // explicit decision (apply / dismiss). Reset on result change so a new
  // calculation can re-surface a fresh signal.
  const [suggestionDismissed, setSuggestionDismissed] = useState(false)

  useEffect(() => {
    setMode(getValuationEditModeForSelectedMethod(selectedMethod))
    setPendingMethod(null)
    setOverrideReasonKey('')
    setOverrideNote('')
  }, [selectedMethod])

  useEffect(() => {
    if (open) {
      setPendingMethod(null)
      setOverrideReasonKey('')
      setOverrideNote('')
    }
  }, [open])

  // Preparer store
  const benchmarkMedian = usePreparerMultipleStore((s) => s.benchmarkMedian)
  const appliedMedian = usePreparerMultipleStore((s) => s.appliedMedian)
  const reasonKey = usePreparerMultipleStore((s) => s.reasonKey)
  const note = usePreparerMultipleStore((s) => s.note)
  const acknowledgedExtreme = usePreparerMultipleStore((s) => s.acknowledgedExtreme)
  const syncFromValuationResult = usePreparerMultipleStore((s) => s.syncFromValuationResult)
  const setAppliedMedian = usePreparerMultipleStore((s) => s.setAppliedMedian)
  const setReasonKey = usePreparerMultipleStore((s) => s.setReasonKey)
  const setNote = usePreparerMultipleStore((s) => s.setNote)
  const setAcknowledgedExtreme = usePreparerMultipleStore((s) => s.setAcknowledgedExtreme)
  const resetToBenchmark = usePreparerMultipleStore((s) => s.resetToBenchmark)

  useEffect(() => {
    if (result) syncFromValuationResult(result)
    // Re-arm the suggestion panel each time a fresh result arrives — the
    // dossier signals can change between recalculations (e.g. owner role
    // changed → owner-dependency risk re-evaluated).
    setSuggestionDismissed(false)
  }, [result, syncFromValuationResult])

  const entries = Object.entries(valuationResults)
  const panoramaEntries = Object.entries(panoramaValuationResults)
  const activeMethodKey = pendingMethod ?? selectedMethod
  const activeMethod = getValuationMethodResultForKey(valuationResults, activeMethodKey) ?? null

  const methodSelectionLocked = isMethodPersisting

  const handleModeChange = (newMode: ValuationEditMode) => {
    if (methodSelectionLocked) return
    setMode(newMode)
    if (newMode === 'ai') {
      setPendingMethod(null)
      setOverrideReasonKey('')
      setOverrideNote('')
      onSelectMethod('upswitch_adaptive')
    }
  }

  const handleMethodClick = (key: string) => {
    if (methodSelectionLocked) return
    if (key === 'upswitch_adaptive') {
      handleModeChange('ai')
      return
    }
    setPendingMethod(key)
    setOverrideReasonKey('')
    setOverrideNote('')
  }

  const handleConfirmOverride = () => {
    if (methodSelectionLocked) return
    if (!pendingMethod || !overrideReasonKey) return
    onSelectMethod(pendingMethod, overrideReasonKey, overrideNote || undefined)
    setPendingMethod(null)
    setOverrideReasonKey('')
    setOverrideNote('')
  }

  const prepModel = useMemo(
    () =>
      buildValuationEditPreparerModel({
        result,
        benchmarkMedian,
        appliedMedian,
        reasonKey,
        note,
        locale,
        businessTypeLabel,
        industryLabel,
        countryCode,
        contextSeparator: tPrep('contextSeparator'),
        activeMethodValue: activeMethod?.value,
        selectedMethod,
        preparerDisabled,
        isMethodPersisting,
      }),
    [
      result,
      benchmarkMedian,
      appliedMedian,
      reasonKey,
      note,
      locale,
      businessTypeLabel,
      industryLabel,
      countryCode,
      tPrep,
      activeMethod?.value,
      selectedMethod,
      preparerDisabled,
      isMethodPersisting,
    ]
  )

  const {
    activeMetricValue,
    appliedNum,
    bench,
    benchmarkContext,
    benchmarkNum,
    confidenceKey,
    dossierSignal,
    effectiveDisabled,
    engineDiscountSteps,
    hasPrepData,
    liveEquityPreview,
    mv,
    nonEbitdaMethodSelected,
    prepDeltaNum,
    selectedReasonBand,
    showExtreme,
    sliderMax,
    sliderMin,
    wasRestoredFromSave,
  } = prepModel
  const extremeBoundInfo = prepModel.extremeBoundInfo
    ? {
        direction: tPrep(prepModel.extremeBoundInfo.directionKey),
        directionLabel: tPrep(prepModel.extremeBoundInfo.directionLabelKey),
        bound: prepModel.extremeBoundInfo.bound,
        boundValue: prepModel.extremeBoundInfo.boundValue,
      }
    : null
  const livePreview = prepModel.livePreview
    ? tPrep('previewTemplate', {
        benchmark: prepModel.livePreview.benchmark,
        applied: prepModel.livePreview.applied,
        delta: prepModel.livePreview.delta,
        adjustmentLabel:
          prepModel.livePreview.adjustment === 'premium'
            ? tPrep('adjustmentPremium')
            : tPrep('adjustmentDiscount'),
        reason: tPrep(`reasons.${prepModel.livePreview.reasonKey}`),
      }) +
      (prepModel.livePreview.note
        ? ` ${tPrep('previewNote', { note: prepModel.livePreview.note })}`
        : '')
    : null
  const previewText = livePreview ?? prepModel.savedPreview

  if (panoramaEntries.length === 0) {
    return (
      <ValuationEditModalEmptyState
        open={open}
        onClose={onClose}
        isHydratingMethods={isHydratingMethods}
        methodDataLoadError={methodDataLoadError}
        onRetryMethodDataLoad={onRetryMethodDataLoad}
        onContinueImportReview={onContinueImportReview}
      />
    )
  }

  return (
    <Modal
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) return
        if (isMethodPersisting) return
        onClose()
      }}
    >
      <ModalContent
        size="2xl"
        description={tModal('description')}
        className="max-h-[92vh] flex flex-col overflow-hidden"
        aria-busy={isMethodPersisting}
        closeDisabled={isMethodPersisting}
        onPointerDownOutside={(e) => {
          if (isMethodPersisting) e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          if (isMethodPersisting) e.preventDefault()
        }}
      >
        <ModalHeader className="shrink-0">
          <ModalTitle>{tModal('title')}</ModalTitle>
        </ModalHeader>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:items-stretch lg:gap-8">
          <ValuationEditMethodSelectorPanel
            valuationResults={valuationResults}
            panoramaValuationResults={panoramaValuationResults}
            selectedMethod={selectedMethod}
            pendingMethod={pendingMethod}
            mode={mode}
            overrideReasonKey={overrideReasonKey}
            overrideNote={overrideNote}
            showFiscalAnchorRow={showFiscalAnchorRow}
            fiscalAnchor={fiscalAnchor}
            methodSelectionLocked={methodSelectionLocked}
            firmCountryCode={firmCountryCode}
            comparablesCount={mv?.comparables_count != null ? Number(mv.comparables_count) : null}
            comparablesQuality={mv?.comparables_quality ?? null}
            onModeChange={handleModeChange}
            onMethodClick={handleMethodClick}
            onOverrideReasonChange={setOverrideReasonKey}
            onOverrideNoteChange={setOverrideNote}
            onConfirmOverride={handleConfirmOverride}
            onCancelOverride={() => setPendingMethod(null)}
            onPlanLockedMethodClick={onPlanLockedMethodClick}
          />

          {/* Right: calculation transparency, EV/EBITDA preparer, Zero Draft */}
          <div
            role="region"
            aria-label={t('detailsColumnTitle')}
            className="space-y-4 min-h-0 min-w-0 flex-1 border-t lg:border-t-0 lg:border-l border-border/40 pt-4 lg:pt-0 lg:pl-6 lg:max-h-[min(82vh,880px)] lg:overflow-y-auto"
          >
            <MethodBreakdownSection
              methodKey={activeMethodKey}
              method={activeMethod}
              result={result}
              fiscalAnchor={fiscalAnchor}
              benchmarkMultiple={benchmarkNum}
              appliedMultiple={appliedNum}
              previewEquity={showPreparerMultiple ? liveEquityPreview : null}
            />

            <ValuationEditModalPreparerSection
              showPreparerMultiple={showPreparerMultiple}
              hasPrepData={hasPrepData}
              nonEbitdaMethodSelected={nonEbitdaMethodSelected}
              selectedMethod={selectedMethod}
              wasRestoredFromSave={wasRestoredFromSave}
              benchmarkContext={benchmarkContext}
              benchmarkMedian={benchmarkMedian}
              benchmarkNum={benchmarkNum}
              bench={bench}
              confidenceKey={confidenceKey}
              mv={mv}
              engineDiscountSteps={engineDiscountSteps}
              dossierSignal={dossierSignal}
              suggestionDismissed={suggestionDismissed}
              setSuggestionDismissed={setSuggestionDismissed}
              sliderMin={sliderMin}
              sliderMax={sliderMax}
              effectiveDisabled={effectiveDisabled}
              appliedMedian={appliedMedian}
              appliedNum={appliedNum}
              prepDeltaNum={prepDeltaNum}
              setAppliedMedian={setAppliedMedian}
              reasonKey={reasonKey}
              setReasonKey={setReasonKey}
              selectedReasonBand={selectedReasonBand}
              note={note}
              setNote={setNote}
              liveEquityPreview={liveEquityPreview}
              activeMetricValue={activeMetricValue}
              previewText={previewText}
              livePreview={livePreview}
              showExtreme={showExtreme}
              extremeBoundInfo={extremeBoundInfo}
              acknowledgedExtreme={acknowledgedExtreme}
              setAcknowledgedExtreme={setAcknowledgedExtreme}
              showResetConfirm={showResetConfirm}
              setShowResetConfirm={setShowResetConfirm}
              resetToBenchmark={resetToBenchmark}
              onRecalculate={onRecalculate}
              onClose={onClose}
            />

            {/* ─── Stake Calculator (frontend-only pro-rata) ─── */}
            {showPreparerMultiple && <StakeCalculatorSection equityValue={activeMetricValue} />}

            {/* ─── Zero Draft Export ─── */}
            {showZeroDraftExport &&
              canExportZeroDraft &&
              zeroDraftReportId &&
              entries.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-foreground/45 leading-snug px-0.5">
                    {t('zeroDraftBlurb')}
                  </p>
                  <AuroraButton
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full text-xs gap-2"
                    onClick={() => {
                      const csv = buildZeroDraftCsv({
                        reportId: zeroDraftReportId,
                        businessName: zeroDraftBusinessName,
                        createdAt: zeroDraftCreatedAt ?? undefined,
                        fiscalAnchor:
                          showFiscalAnchorRow && fiscalAnchor != null ? fiscalAnchor : undefined,
                        selectedMethod,
                        methods: valuationResults,
                      })
                      const rawName = t('zeroDraftFilename', { reportId: zeroDraftReportId })
                      const safeName = sanitizeZeroDraftFilename(rawName)
                      downloadZeroDraftCsv(safeName, csv)
                    }}
                  >
                    <Download className="w-3.5 h-3.5" />
                    {t('exportZeroDraft')}
                  </AuroraButton>
                </div>
              )}
          </div>
        </div>
      </ModalContent>
    </Modal>
  )
}
