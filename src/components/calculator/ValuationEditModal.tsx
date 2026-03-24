'use client'

import { useEffect, useState } from 'react'
import {
  Check,
  Download,
  ArrowRightLeft,
  Sparkles,
  Pencil,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { cn } from '@/design-system/utils'
import { AuroraButton } from '@/design-system/components/Button'
import { AuroraSelect } from '@/design-system/components/Select'
import { SegmentedControl } from '@/design-system/components/SegmentedControl'
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
} from '@/design-system/components/Modal'
import type { ValuationMethodResult, ValuationResponse } from '../../types/valuation'
import { getOmniMethodEquityRange } from '../../utils/omniCalcRange'
import { buildZeroDraftCsv, downloadZeroDraftCsv } from '@/utils/zeroDraftCsv'
import {
  PREPARER_EBITDA_REASON_KEYS,
  clientShouldWarnExtremeMultiple,
  usePreparerMultipleStore,
} from '../../store/manual/usePreparerMultipleStore'

const PRIMARY_METHOD_KEYS = new Set([
  'upswitch_adaptive',
  'ebitda_multiple',
  'adjusted_nav',
  'fiscal_4x',
])

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
  zeroDraftReportId?: string
  zeroDraftBusinessName?: string | null
  zeroDraftCreatedAt?: string | null
  showPreparerMultiple?: boolean
}

const formatCurrency = (amount: number) =>
  amount >= 1_000_000
    ? `€${(amount / 1_000_000).toFixed(1)}M`
    : amount >= 1_000
      ? `€${(amount / 1_000).toFixed(0)}K`
      : `€${Math.round(amount)}`

export function ValuationEditModal({
  open,
  onClose,
  valuationResults,
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
  zeroDraftReportId,
  zeroDraftBusinessName,
  zeroDraftCreatedAt,
  showPreparerMultiple = false,
}: ValuationEditModalProps) {
  const t = useTranslations('omniCalc')
  const tPrep = useTranslations('preparerMultiple')
  const tModal = useTranslations('valuationEditModal')
  const locale = useLocale()

  const adaptiveLabel = t('currentMethodAdaptive')
  const isManualMode = selectedMethod !== 'upswitch_adaptive'
  const [mode, setMode] = useState<'ai' | 'manual'>(isManualMode ? 'manual' : 'ai')
  const [pendingMethod, setPendingMethod] = useState<string | null>(null)
  const [overrideReasonKey, setOverrideReasonKey] = useState('')
  const [overrideNote, setOverrideNote] = useState('')
  const [showAllMethods, setShowAllMethods] = useState(false)

  useEffect(() => {
    const newMode = selectedMethod === 'upswitch_adaptive' ? 'ai' : 'manual'
    setMode(newMode)
    if (newMode === 'ai') {
      setPendingMethod(null)
      setOverrideReasonKey('')
      setOverrideNote('')
    }
  }, [selectedMethod])

  useEffect(() => {
    if (open) {
      setPendingMethod(null)
      setOverrideReasonKey('')
      setOverrideNote('')
      setShowAllMethods(false)
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
  }, [result, syncFromValuationResult])

  const entries = Object.entries(valuationResults)

  // Method selection helpers
  const getSelectedMethodLabel = (method: string) =>
    method === 'upswitch_adaptive'
      ? adaptiveLabel
      : valuationResults[method]?.label || adaptiveLabel

  const adaptiveValue =
    valuationResults['upswitch_adaptive']?.value != null
      ? Number(valuationResults['upswitch_adaptive'].value)
      : null
  const selectedValue =
    selectedMethod !== 'upswitch_adaptive' && valuationResults[selectedMethod]?.value != null
      ? Number(valuationResults[selectedMethod].value)
      : null
  const currentMethodLabel = getSelectedMethodLabel(selectedMethod)

  const handleModeChange = (newMode: 'ai' | 'manual') => {
    setMode(newMode)
    if (newMode === 'ai') {
      setPendingMethod(null)
      setOverrideReasonKey('')
      setOverrideNote('')
      onSelectMethod('upswitch_adaptive')
    }
  }

  const handleMethodClick = (key: string) => {
    if (key === 'upswitch_adaptive') {
      handleModeChange('ai')
      return
    }
    setPendingMethod(key)
    setOverrideReasonKey('')
    setOverrideNote('')
  }

  const handleConfirmOverride = () => {
    if (!pendingMethod || !overrideReasonKey) return
    onSelectMethod(pendingMethod, overrideReasonKey, overrideNote || undefined)
    setPendingMethod(null)
  }

  const showMethodList = mode === 'manual'
  const showComparisonCard = isManualMode && adaptiveValue != null && selectedValue != null
  const delta = showComparisonCard ? selectedValue! - adaptiveValue! : 0
  const deltaPercent =
    showComparisonCard && adaptiveValue! > 0 ? (delta / adaptiveValue!) * 100 : 0
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

  const availableCount = entries.filter(([, m]) => m.available).length

  // Preparer helpers
  const mv = result?.multiples_valuation
  const appliedNum = appliedMedian != null ? Number(appliedMedian) : null
  const benchmarkNum =
    benchmarkMedian ?? (mv?.ebitda_multiple != null ? Number(mv.ebitda_multiple) : null)
  const prepDeltaNum =
    appliedNum != null && benchmarkNum != null
      ? Math.round((appliedNum - benchmarkNum) * 100) / 100
      : null
  const showExtreme =
    appliedNum != null &&
    clientShouldWarnExtremeMultiple(
      appliedNum,
      mv?.p10_ebitda_multiple,
      mv?.p90_ebitda_multiple,
      benchmarkMedian,
      mv?.p25_ebitda_multiple,
      mv?.p75_ebitda_multiple,
    )
  const bench = benchmarkNum ?? 5

  let regionName: string | null = null
  if (countryCode && countryCode.length === 2) {
    try {
      const loc = locale === 'nl' ? 'nl-BE' : 'en-GB'
      regionName =
        new Intl.DisplayNames([loc], { type: 'region' }).of(countryCode.toUpperCase()) ?? null
    } catch {
      regionName = countryCode.toUpperCase()
    }
  }
  const contextSegments = [businessTypeLabel, industryLabel, regionName].filter(
    (s): s is string => typeof s === 'string' && s.trim().length > 0,
  )
  const benchmarkContext =
    contextSegments.length > 0 ? contextSegments.join(tPrep('contextSeparator')) : null

  const qualityRaw = `${mv?.comparables_quality ?? ''} ${mv?.confidence ?? ''}`.toUpperCase()
  let confidenceKey:
    | 'confidenceHigh'
    | 'confidenceMedium'
    | 'confidenceLow'
    | 'confidenceDefault' = 'confidenceDefault'
  if (qualityRaw.includes('HIGH')) confidenceKey = 'confidenceHigh'
  else if (qualityRaw.includes('MEDIUM') || qualityRaw.includes('MODERATE'))
    confidenceKey = 'confidenceMedium'
  else if (qualityRaw.includes('LOW')) confidenceKey = 'confidenceLow'

  const hasPrepData = !!(result?.multiples_valuation?.ebitda_multiple || benchmarkMedian != null)
  const nonEbitdaMethodSelected =
    selectedMethod !== 'upswitch_adaptive' && selectedMethod !== 'ebitda_multiple'
  const effectiveDisabled = preparerDisabled || nonEbitdaMethodSelected

  const savedSummary = result?.multiple_adjustment_summary
  const livePreview =
    benchmarkNum != null &&
    appliedNum != null &&
    reasonKey &&
    Math.abs(appliedNum - benchmarkNum) >= 0.005
      ? tPrep('previewTemplate', {
          benchmark: benchmarkNum.toFixed(2),
          applied: appliedNum.toFixed(2),
          delta: Math.abs(appliedNum - benchmarkNum).toFixed(2),
          adjustmentLabel:
            appliedNum >= benchmarkNum ? tPrep('adjustmentPremium') : tPrep('adjustmentDiscount'),
          reason: tPrep(`reasons.${reasonKey}`),
        }) + (note.trim() ? ` ${tPrep('previewNote', { note: note.trim() })}` : '')
      : null
  const savedPreview =
    locale === 'nl'
      ? (savedSummary?.generated_footnote_nl ?? savedSummary?.generated_footnote ?? null)
      : (savedSummary?.generated_footnote_en ?? savedSummary?.generated_footnote ?? null)
  const previewText = livePreview ?? savedPreview

  if (entries.length === 0) {
    return (
      <Modal open={open} onOpenChange={(v) => !v && onClose()}>
        <ModalContent size="lg" description={tModal('description')}>
          <ModalHeader>
            <ModalTitle>{tModal('title')}</ModalTitle>
          </ModalHeader>
          <div className="rounded-lg border border-dashed border-border/60 bg-background/60 px-4 py-5 text-center space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
              {t('unavailableTitle')}
            </p>
            <p className="text-[11px] leading-snug text-foreground/50">
              {t('unavailableBlurb')}
            </p>
          </div>
        </ModalContent>
      </Modal>
    )
  }

  const renderMethodButton = ([key, method]: [string, ValuationMethodResult]) => {
    const isSelected = key === selectedMethod
    const isPending = key === pendingMethod
    const isAvailable = method.available
    const value = method.value != null ? Number(method.value) : null
    const range =
      isAvailable && value != null
        ? getOmniMethodEquityRange({
            value: method.value,
            available: method.available,
            details: method.details,
          })
        : null

    return (
      <button
        key={key}
        type="button"
        disabled={!isAvailable}
        onClick={() => isAvailable && handleMethodClick(key)}
        className={cn(
          'w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-all border',
          isSelected
            ? 'border-primary/50 bg-primary/5'
            : isPending
              ? 'border-primary/30 bg-primary/[0.03] ring-1 ring-primary/20'
              : isAvailable
                ? 'border-border/50 hover:border-primary/30 hover:bg-primary/[0.02]'
                : 'border-border/30 opacity-50 cursor-not-allowed',
        )}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'text-sm font-medium truncate',
                isSelected || isPending ? 'text-primary' : 'text-foreground',
              )}
            >
              {method.label}
            </span>
            {isSelected && (
              <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                <Check className="w-2.5 h-2.5" />
                {t('selected')}
              </span>
            )}
          </div>
          {!isAvailable && method.unavailable_reason && (
            <p className="text-[10px] text-foreground/40 mt-0.5 truncate">
              {method.unavailable_reason}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          {isAvailable && value != null ? (
            <>
              <span
                className={cn(
                  'text-sm font-mono font-semibold tabular-nums',
                  isSelected || isPending ? 'text-primary' : 'text-foreground',
                )}
              >
                {formatCurrency(value)}
              </span>
              {range && (
                <>
                  <span className="block text-[10px] text-foreground/30 tabular-nums">
                    {formatCurrency(range.low)} – {formatCurrency(range.high)}
                  </span>
                  <span className="block text-[9px] text-foreground/25 uppercase tracking-wide">
                    {range.source === 'model' ? t('rangeModel') : t('rangeIllustrative')}
                  </span>
                </>
              )}
              {method.multiple_used != null && (
                <span className="block text-[10px] text-foreground/40 tabular-nums">
                  {Number(method.multiple_used).toFixed(1)}x
                </span>
              )}
              {method.wacc != null && (
                <span className="block text-[10px] text-foreground/40 tabular-nums">
                  WACC {(Number(method.wacc) * 100).toFixed(1)}%
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-foreground/30">&mdash;</span>
          )}
        </div>
      </button>
    )
  }

  const primaryEntries = entries.filter(([key]) => PRIMARY_METHOD_KEYS.has(key))
  const secondaryEntries = entries.filter(([key]) => !PRIMARY_METHOD_KEYS.has(key))
  const hasActiveSecondary = secondaryEntries.some(
    ([key]) => key === selectedMethod || key === pendingMethod,
  )

  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()}>
      <ModalContent
        size="lg"
        description={tModal('description')}
        className="max-h-[85vh] overflow-y-auto"
      >
        <ModalHeader>
          <ModalTitle>{tModal('title')}</ModalTitle>
        </ModalHeader>

        {/* ─── Section 1: Method Selection ─── */}
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <h4 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                {tModal('methodSection')}
              </h4>
              <p className="text-[11px] leading-snug text-foreground/50">{t('subtitle')}</p>
            </div>
            <div className="shrink-0 text-right max-w-[55%]">
              <span className="text-[10px] text-foreground/40 leading-tight block">
                {t('methodsReadyBadge', { available: availableCount, total: entries.length })}
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
                icon: <Sparkles className="w-3 h-3" />,
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
            aria-label={t('modeLabel')}
          />

          <div
            role="status"
            aria-live="polite"
            className={cn('rounded-md border px-3 py-2 text-[11px] leading-snug', guidanceTone)}
          >
            {guidanceText}
          </div>

          {showComparisonCard && !pendingMethod && (
            <div className="rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary/70">
                <ArrowRightLeft className="w-3 h-3" />
                {t('comparisonTitle')}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="block text-[10px] text-foreground/45">
                    {t('comparisonAi')}
                  </span>
                  <span className="text-sm font-mono font-semibold tabular-nums text-foreground/70">
                    {formatCurrency(adaptiveValue!)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="block text-[10px] text-foreground/45">
                    {t('comparisonManual')}
                  </span>
                  <span className="text-sm font-mono font-semibold tabular-nums text-primary">
                    {formatCurrency(selectedValue!)}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-primary/10">
                <span className="text-[10px] text-foreground/40">{t('comparisonDelta')}</span>
                <span
                  className={cn(
                    'text-xs font-mono font-medium tabular-nums',
                    delta >= 0 ? 'text-success' : 'text-warning',
                  )}
                >
                  {delta >= 0 ? '+' : ''}
                  {formatCurrency(Math.abs(delta))} ({deltaPercent >= 0 ? '+' : ''}
                  {deltaPercent.toFixed(1)}%)
                </span>
              </div>
            </div>
          )}

          {showMethodList && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-foreground/45 px-0.5">
                {t('methodsListHeading')}
              </p>
              <div className="grid gap-1.5 grid-cols-1">
                {primaryEntries.map(renderMethodButton)}
              </div>
              {secondaryEntries.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowAllMethods((v) => !v)}
                    className="w-full flex items-center gap-1.5 px-1 py-1 text-[10px] text-foreground/40 hover:text-foreground/60 transition-colors"
                  >
                    {showAllMethods || hasActiveSecondary ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                    {t('showAllMethods', { count: secondaryEntries.length })}
                  </button>
                  {(showAllMethods || hasActiveSecondary) && (
                    <div className="grid gap-1.5 grid-cols-1">
                      {secondaryEntries.map(renderMethodButton)}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {pendingMethod && pendingMethod !== 'upswitch_adaptive' && (
            <div className="rounded-lg border border-primary/20 bg-primary/[0.03] px-3 py-3 space-y-2">
              {valuationResults[pendingMethod]?.label && (
                <p className="text-[10px] font-medium text-foreground/55">
                  {t('overrideConfirmingFor', {
                    method: valuationResults[pendingMethod]!.label,
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
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs resize-none"
              />
              <div className="flex gap-2">
                <AuroraButton
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={!overrideReasonKey}
                  className="flex-1 text-xs"
                  onClick={handleConfirmOverride}
                >
                  {t('overrideConfirm')}
                </AuroraButton>
                <AuroraButton
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setPendingMethod(null)}
                >
                  {t('overrideCancel')}
                </AuroraButton>
              </div>
            </div>
          )}

          {showFiscalAnchorRow && fiscalAnchor != null && !valuationResults['fiscal_4x'] && (
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

        {/* ─── Section 2: EV/EBITDA Multiple Override ─── */}
        {showPreparerMultiple && hasPrepData && (
          <>
            <div className="my-5 border-t border-border/40" />
            <div className={cn('space-y-3', nonEbitdaMethodSelected && 'opacity-60')}>
              <h4 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                {tModal('multipleSection')}
              </h4>

              {nonEbitdaMethodSelected && (
                <div className="rounded-md border border-amber-300/30 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-2">
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
                    {selectedMethod === 'fiscal_4x'
                      ? tPrep('hintFiscalMethod')
                      : tPrep('hintOtherMethod')}
                  </p>
                </div>
              )}

              <div className="grid gap-1.5">
                <span className="text-[10px] font-medium text-foreground/45 uppercase">
                  {tPrep('benchmark')}
                </span>
                <p className="text-[12px] text-foreground/80 leading-snug font-medium">
                  {benchmarkContext
                    ? tPrep('benchmarkAnchored', {
                        context: benchmarkContext,
                        multiple: (benchmarkMedian ?? bench).toFixed(2),
                      })
                    : tPrep('benchmarkAnchoredShort', {
                        multiple: (benchmarkMedian ?? bench).toFixed(2),
                      })}
                </p>
                <span className="text-sm font-mono font-semibold tabular-nums text-primary">
                  {(benchmarkMedian ?? bench).toFixed(2)}×
                </span>
                <p className="text-[10px] text-foreground/45">
                  {tPrep('benchmarkConfidence', { level: tPrep(confidenceKey) })}
                  {mv?.confidence_score != null && Number.isFinite(Number(mv.confidence_score))
                    ? ` · ${tPrep('scoreLabel', { score: Math.round(Number(mv.confidence_score)) })}`
                    : ''}
                </p>
              </div>

              <div className="grid gap-1">
                <label
                  className="text-[10px] font-medium text-foreground/45 uppercase"
                  htmlFor="modal-prep-ev-ebitda"
                >
                  {tPrep('applied')}
                </label>
                {prepDeltaNum != null && Math.abs(prepDeltaNum) >= 0.005 && (
                  <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/60 px-2 py-1 text-[10px] text-foreground/55">
                    <span>{tPrep('deltaLabel')}</span>
                    <span className="font-mono tabular-nums text-foreground/75">
                      {prepDeltaNum > 0 ? '+' : ''}
                      {prepDeltaNum.toFixed(2)}×
                    </span>
                  </div>
                )}
                <input
                  id="modal-prep-ev-ebitda"
                  type="number"
                  step={0.1}
                  min={0.1}
                  max={20}
                  disabled={effectiveDisabled}
                  value={appliedMedian ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === '') {
                      setAppliedMedian(null)
                      return
                    }
                    const n = parseFloat(v)
                    if (Number.isFinite(n)) setAppliedMedian(n)
                  }}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono tabular-nums"
                />
                <input
                  type="range"
                  aria-label={tPrep('applied')}
                  disabled={effectiveDisabled}
                  min={0.1}
                  max={20}
                  step={0.1}
                  value={
                    appliedMedian != null && Number.isFinite(appliedMedian)
                      ? Math.min(20, Math.max(0.1, appliedMedian))
                      : Math.min(20, Math.max(0.1, bench))
                  }
                  onChange={(e) => {
                    const n = parseFloat(e.target.value)
                    if (Number.isFinite(n)) setAppliedMedian(n)
                  }}
                  className="w-full h-2 mt-1 accent-primary"
                />
                <p className="text-[10px] text-foreground/35">{tPrep('sliderHint')}</p>
              </div>

              <div className="grid gap-1">
                <label
                  className="text-[10px] font-medium text-foreground/45 uppercase"
                  htmlFor="modal-prep-reason"
                >
                  {tPrep('reason')}
                </label>
                <AuroraSelect
                  size="sm"
                  value={reasonKey}
                  onChange={(v) =>
                    setReasonKey(v as (typeof PREPARER_EBITDA_REASON_KEYS)[number] | '')
                  }
                  disabled={effectiveDisabled}
                  placeholder={tPrep('reasonPlaceholder')}
                  options={PREPARER_EBITDA_REASON_KEYS.map((k) => ({
                    value: k,
                    label: tPrep(`reasons.${k}`),
                  }))}
                  clearable
                />
              </div>

              <div className="grid gap-1">
                <label
                  className="text-[10px] font-medium text-foreground/45 uppercase"
                  htmlFor="modal-prep-note"
                >
                  {tPrep('noteOptional')}
                </label>
                <textarea
                  id="modal-prep-note"
                  disabled={effectiveDisabled}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  maxLength={500}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs resize-none"
                />
              </div>

              {previewText && (
                <div className="rounded-md border border-primary/20 bg-primary/[0.05] px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                      {tPrep('previewTitle')}
                    </span>
                    <span className="text-[10px] text-primary/65">
                      {livePreview ? tPrep('previewLive') : tPrep('previewSaved')}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-foreground/75">
                    {previewText}
                  </p>
                </div>
              )}

              {showExtreme && (
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={effectiveDisabled}
                    checked={acknowledgedExtreme}
                    onChange={(e) => setAcknowledgedExtreme(e.target.checked)}
                    className="mt-1"
                  />
                  <span className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
                    {tPrep('extremeWarning')}
                  </span>
                </label>
              )}

              <div className="flex flex-col gap-2">
                {onRecalculate && (
                  <AuroraButton
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={effectiveDisabled}
                    className="w-full text-xs"
                    onClick={() => {
                      onRecalculate()
                      onClose()
                    }}
                  >
                    {tPrep('recalculate')}
                  </AuroraButton>
                )}
                <AuroraButton
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={effectiveDisabled}
                  className="w-full text-xs"
                  onClick={() => resetToBenchmark()}
                >
                  {tPrep('resetBenchmark')}
                </AuroraButton>
              </div>
            </div>
          </>
        )}

        {/* ─── Zero Draft Export ─── */}
        {showZeroDraftExport && zeroDraftReportId && entries.length > 0 && (
          <>
            <div className="my-5 border-t border-border/40" />
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
                      showFiscalAnchorRow && fiscalAnchor != null
                        ? fiscalAnchor
                        : undefined,
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
          </>
        )}
      </ModalContent>
    </Modal>
  )
}
