'use client'

import { Download, Loader2, Pencil } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { METHOD_LABEL_KEYS } from '@/constants/methodLabels'
import { AuroraButton } from '@/design-system/components/Button'
import { Modal, ModalContent, ModalHeader, ModalTitle } from '@/design-system/components/Modal'
import { SegmentedControl } from '@/design-system/components/SegmentedControl'
import { AuroraSelect } from '@/design-system/components/Select'
import { cn } from '@/design-system/utils'
import { getValuationMethodResultForKey } from '@/utils/extractValuationResultsMap'
import { mergePlanGatedOmniPanoramaResults } from '@/utils/omniPlanPanorama'
import { buildZeroDraftCsv, downloadZeroDraftCsv } from '@/utils/zeroDraftCsv'
import { usePreparerMultipleStore } from '../../store/manual/usePreparerMultipleStore'
import type { ValuationMethodResult, ValuationResponse } from '../../types/valuation'
import { OmniMethodPanorama } from './omni/OmniMethodPanorama'
import { MethodBreakdownSection, StakeCalculatorSection } from './ValuationEditModalBreakdown'
import { formatCurrency } from './ValuationEditModalFormatting'
import { buildValuationEditPreparerModel } from './ValuationEditModalPreparerModel'
import { ValuationEditModalPreparerSection } from './ValuationEditModalPreparerSection'

const METHOD_OVERRIDE_REASON_KEYS = [
  'fiscal_compliance',
  'asset_heavy_business',
  'internal_transfer',
  'conservative_anchor',
  'client_preference',
  'regulatory_requirement',
  'other',
] as const

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

  const adaptiveLabel = t('currentMethodAdaptive')
  const [mode, setMode] = useState<'ai' | 'manual'>(
    selectedMethod !== 'upswitch_adaptive' ? 'manual' : 'ai'
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
    const newMode = selectedMethod === 'upswitch_adaptive' ? 'ai' : 'manual'
    setMode(newMode)
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
  const pendingOverrideRow =
    pendingMethod && pendingMethod !== 'upswitch_adaptive'
      ? getValuationMethodResultForKey(valuationResults, pendingMethod)
      : null

  // Method selection helpers
  const getSelectedMethodLabel = (method: string) =>
    method === 'upswitch_adaptive'
      ? adaptiveLabel
      : getValuationMethodResultForKey(valuationResults, method)?.label || adaptiveLabel

  const currentMethodLabel = getSelectedMethodLabel(selectedMethod)

  const methodSelectionLocked = isMethodPersisting

  const handleModeChange = (newMode: 'ai' | 'manual') => {
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

  const showMethodList = mode === 'manual'
  const guidanceTone = pendingMethod
    ? 'border-primary/20 bg-primary/[0.04] text-primary/80'
    : mode === 'manual'
      ? 'border-amber-300/30 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400'
      : 'border-border/60 bg-background/60 text-foreground/60'
  const guidanceText = pendingMethod
    ? t('stepExplainReason')
    : mode === 'manual'
      ? t('stepChooseMethod')
      : t('stepAiActive')

  const availableCount = panoramaEntries.filter(([, m]) => m.available).length

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
    const title = isHydratingMethods
      ? tModal('loadingTitle')
      : methodDataLoadError === 'transient'
        ? t('transientLoadTitle')
        : methodDataLoadError === 'report_pending'
          ? t('unavailableTitleReportPending')
          : t('unavailableTitleLegacy')
    const blurb = isHydratingMethods
      ? tModal('loadingBlurb')
      : methodDataLoadError === 'transient'
        ? t('transientLoadBlurb')
        : methodDataLoadError === 'report_pending'
          ? t('unavailableBlurbReportPending')
          : t('unavailableBlurbLegacy')
    return (
      <Modal open={open} onOpenChange={(v) => !v && onClose()}>
        <ModalContent
          size="2xl"
          description={tModal('description')}
          className="max-h-[92vh] flex flex-col overflow-hidden"
        >
          <ModalHeader className="shrink-0">
            <ModalTitle>{tModal('title')}</ModalTitle>
          </ModalHeader>
          <div className="rounded-lg border border-dashed border-border/60 bg-background/60 px-4 py-5 text-center space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
              {title}
            </p>
            <p className="text-[11px] leading-snug text-foreground/50">{blurb}</p>
            {methodDataLoadError === 'report_pending' && onContinueImportReview ? (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                <AuroraButton
                  type="button"
                  variant="primary"
                  size="sm"
                  className="text-xs"
                  disabled={isHydratingMethods}
                  onClick={onContinueImportReview}
                >
                  {tModal('continueImportReview')}
                </AuroraButton>
                {onRetryMethodDataLoad ? (
                  <AuroraButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="text-xs"
                    disabled={isHydratingMethods}
                    onClick={onRetryMethodDataLoad}
                  >
                    {tModal('retryMethodDataLoad')}
                  </AuroraButton>
                ) : null}
              </div>
            ) : (methodDataLoadError === 'transient' || methodDataLoadError === 'report_pending') &&
              onRetryMethodDataLoad ? (
              <AuroraButton
                type="button"
                variant="primary"
                size="sm"
                className="text-xs"
                disabled={isHydratingMethods}
                onClick={onRetryMethodDataLoad}
              >
                {tModal('retryMethodDataLoad')}
              </AuroraButton>
            ) : null}
          </div>
        </ModalContent>
      </Modal>
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
          {/* Left: method mode, panorama selection, override */}
          <div className="space-y-3 min-h-0 min-w-0 flex-1 lg:max-h-[min(82vh,880px)] lg:overflow-y-auto lg:pr-2">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <h4 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                  {tModal('methodSection')}
                </h4>
                <p className="text-[11px] leading-snug text-foreground/50">{t('subtitle')}</p>
              </div>
              <div className="shrink-0 text-right max-w-[55%]">
                <span className="text-[10px] text-foreground/40 leading-tight block">
                  {t('methodsReadyBadge', {
                    available: availableCount,
                    total: panoramaEntries.length,
                  })}
                </span>
                <div className="mt-1 inline-flex items-center rounded-full border border-primary/15 bg-primary/[0.05] px-2 py-1 text-[10px] font-medium text-primary/80 max-w-full">
                  <span className="truncate">
                    {t('currentMethodLabel', { method: currentMethodLabel })}
                  </span>
                </div>
              </div>
            </div>

            <SegmentedControl
              options={[
                {
                  value: 'ai' as const,
                  label: t('modeAi'),
                },
                {
                  value: 'manual' as const,
                  label: t('modeManual'),
                  icon: <Pencil className="w-3 h-3" />,
                },
              ]}
              value={mode}
              onChange={handleModeChange}
              size="sm"
              fullWidth
              disabled={methodSelectionLocked}
              aria-label={t('modeLabel')}
            />

            <div
              role="status"
              aria-live="polite"
              className={cn('rounded-md border px-3 py-2 text-[11px] leading-snug', guidanceTone)}
            >
              {guidanceText}
            </div>

            {isMethodPersisting && (
              <p
                className="text-[11px] text-foreground/50 mt-2 flex items-center gap-2"
                role="status"
                aria-live="polite"
              >
                <Loader2
                  className="w-3.5 h-3.5 animate-spin shrink-0 text-primary/70"
                  aria-hidden
                />
                {tModal('persistingMethod')}
              </p>
            )}

            {showMethodList && (
              <OmniMethodPanorama
                valuationResults={panoramaValuationResults}
                selectedMethod={selectedMethod}
                pendingMethod={pendingMethod}
                methodSelectionLocked={methodSelectionLocked}
                onMethodClick={handleMethodClick}
                firmCountryCode={firmCountryCode}
                onPlanLockedMethodClick={onPlanLockedMethodClick}
                comparablesCount={
                  mv?.comparables_count != null ? Number(mv.comparables_count) : null
                }
                comparablesQuality={mv?.comparables_quality ?? null}
              />
            )}

            {pendingMethod && pendingMethod !== 'upswitch_adaptive' && (
              <div className="rounded-lg border border-primary/20 bg-primary/[0.03] px-3 py-3 space-y-2">
                {pendingOverrideRow?.label && (
                  <p className="text-[10px] font-medium text-foreground/55">
                    {t('overrideConfirmingFor', {
                      method: pendingOverrideRow.label,
                    })}
                  </p>
                )}
                <p className="text-[11px] font-semibold text-primary/80 uppercase tracking-wider">
                  {t('overrideJustificationTitle')}
                </p>
                <p className="text-[10px] text-foreground/50 leading-snug">
                  {t('overrideJustificationBlurb')}
                </p>
                <AuroraSelect
                  size="sm"
                  value={overrideReasonKey}
                  onChange={(v) => setOverrideReasonKey(v)}
                  label={t('overrideJustificationTitle')}
                  placeholder={t('overrideReasonPlaceholder')}
                  options={METHOD_OVERRIDE_REASON_KEYS.map((k) => ({
                    value: k,
                    label: t(`overrideReasons.${k}`),
                  }))}
                />
                <textarea
                  value={overrideNote}
                  onChange={(e) => setOverrideNote(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder={t('overrideNotePlaceholder')}
                  aria-label={t('overrideNotePlaceholder')}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs resize-none"
                />
                <div className="flex gap-2">
                  <AuroraButton
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={!overrideReasonKey || methodSelectionLocked}
                    className="flex-1 text-xs"
                    onClick={handleConfirmOverride}
                  >
                    {t('overrideConfirm')}
                  </AuroraButton>
                  <AuroraButton
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={methodSelectionLocked}
                    className="text-xs"
                    onClick={() => setPendingMethod(null)}
                  >
                    {t('overrideCancel')}
                  </AuroraButton>
                </div>
              </div>
            )}

            {showFiscalAnchorRow &&
              fiscalAnchor != null &&
              !getValuationMethodResultForKey(valuationResults, 'fiscal_4x') && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-foreground/[0.02] border border-dashed border-border/50">
                    <span className="text-[10px] font-medium text-foreground/50 uppercase tracking-wider">
                      {t('fiscalAnchor')}
                    </span>
                    <span className="text-xs font-mono font-medium text-foreground/60 tabular-nums">
                      {formatCurrency(Number(fiscalAnchor))}
                    </span>
                  </div>
                  <p className="text-[9px] text-foreground/40 leading-snug px-1">
                    {t('fiscalAnchorFootnote')}
                  </p>
                </div>
              )}
          </div>

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
                      const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_')
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
