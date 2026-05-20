'use client'

import { useTranslations } from 'next-intl'
import type { Dispatch, SetStateAction } from 'react'
import { AuroraButton } from '@/design-system/components/Button'
import { AuroraSelect } from '@/design-system/components/Select'
import { cn } from '@/design-system/utils'
import {
  type DossierSignal,
  projectSuggestedMultiple,
  SCENARIO_PRESETS,
  type SuggestedBand,
} from '../../store/manual/preparerCalibrationSuggestions'
import {
  PREPARER_EBITDA_REASON_KEYS,
  type PreparerEbitdaReasonKey,
} from '../../store/manual/usePreparerMultipleStore'
import type { ValuationResponse } from '../../types/valuation'
import { PercentileBandGauge } from './PercentileBandGauge'
import { formatCurrency } from './ValuationEditModalFormatting'

type ConfidenceKey = 'confidenceHigh' | 'confidenceMedium' | 'confidenceLow' | 'confidenceDefault'

interface EngineDiscountStep {
  name: string
  pct: number
}

interface ExtremeBoundInfo {
  direction: string
  directionLabel: string
  bound: 'p90' | 'p10'
  boundValue: string
}

interface ValuationEditModalPreparerSectionProps {
  showPreparerMultiple: boolean
  hasPrepData: boolean
  nonEbitdaMethodSelected: boolean
  selectedMethod: string
  wasRestoredFromSave: boolean
  benchmarkContext: string | null
  benchmarkMedian: number | null
  benchmarkNum: number | null
  bench: number
  confidenceKey: ConfidenceKey
  mv: ValuationResponse['multiples_valuation'] | undefined
  engineDiscountSteps: EngineDiscountStep[]
  dossierSignal: DossierSignal | null
  suggestionDismissed: boolean
  setSuggestionDismissed: Dispatch<SetStateAction<boolean>>
  sliderMin: number
  sliderMax: number
  effectiveDisabled: boolean
  appliedMedian: number | null
  appliedNum: number | null
  prepDeltaNum: number | null
  setAppliedMedian: (value: number | null) => void
  reasonKey: PreparerEbitdaReasonKey | ''
  setReasonKey: (value: PreparerEbitdaReasonKey | '') => void
  selectedReasonBand: SuggestedBand | null
  note: string
  setNote: (value: string) => void
  liveEquityPreview: number | null
  activeMetricValue: number | null
  previewText: string | null
  livePreview: string | null
  showExtreme: boolean
  extremeBoundInfo: ExtremeBoundInfo | null
  acknowledgedExtreme: boolean
  setAcknowledgedExtreme: (value: boolean) => void
  showResetConfirm: boolean
  setShowResetConfirm: Dispatch<SetStateAction<boolean>>
  resetToBenchmark: () => void
  onRecalculate?: () => void
  onClose: () => void
}

export function ValuationEditModalPreparerSection({
  showPreparerMultiple,
  hasPrepData,
  nonEbitdaMethodSelected,
  selectedMethod,
  wasRestoredFromSave,
  benchmarkContext,
  benchmarkMedian,
  benchmarkNum,
  bench,
  confidenceKey,
  mv,
  engineDiscountSteps,
  dossierSignal,
  suggestionDismissed,
  setSuggestionDismissed,
  sliderMin,
  sliderMax,
  effectiveDisabled,
  appliedMedian,
  appliedNum,
  prepDeltaNum,
  setAppliedMedian,
  reasonKey,
  setReasonKey,
  selectedReasonBand,
  note,
  setNote,
  liveEquityPreview,
  activeMetricValue,
  previewText,
  livePreview,
  showExtreme,
  extremeBoundInfo,
  acknowledgedExtreme,
  setAcknowledgedExtreme,
  showResetConfirm,
  setShowResetConfirm,
  resetToBenchmark,
  onRecalculate,
  onClose,
}: ValuationEditModalPreparerSectionProps) {
  const tPrep = useTranslations('preparerMultiple')
  const tModal = useTranslations('valuationEditModal')
  const tBreakdown = useTranslations('methodBreakdown')

  if (!showPreparerMultiple || !hasPrepData) return null

  return (
    <div className={cn('space-y-3', nonEbitdaMethodSelected && 'opacity-60')}>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h4 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">
            {tModal('multipleSection')}
          </h4>
          {wasRestoredFromSave && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/[0.06] px-2 py-0.5 text-[10px] font-medium text-primary/85"
              title={tPrep('restoredBadgeLabel')}
            >
              <svg
                className="w-2.5 h-2.5"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M6 1v4l2.5 1.5" />
                <circle cx="6" cy="6" r="5" />
              </svg>
              {tPrep('restoredBadgeLabel')}
            </span>
          )}
        </div>
        <p className="text-[11px] leading-snug text-foreground/55">
          {tModal('multipleSectionLead')}
        </p>
      </div>

      {nonEbitdaMethodSelected && (
        <div className="rounded-md border border-amber-300/30 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-2">
          <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
            {selectedMethod === 'fiscal_4x' ? tPrep('hintFiscalMethod') : tPrep('hintOtherMethod')}
          </p>
        </div>
      )}

      <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-foreground/45">
          {tPrep('benchmark')}
        </p>
        <p className="text-[11px] text-foreground/60 leading-snug mt-0.5">
          {benchmarkContext
            ? tPrep('benchmarkAnchored', {
                context: benchmarkContext,
                multiple: (benchmarkMedian ?? bench).toFixed(2),
              })
            : tPrep('benchmarkAnchoredShort', {
                multiple: (benchmarkMedian ?? bench).toFixed(2),
              })}
        </p>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="text-2xl font-mono font-semibold tabular-nums text-primary leading-none">
            {(benchmarkMedian ?? bench).toFixed(2)}×
          </span>
          <span className="text-[10px] text-foreground/45">
            {tPrep('benchmarkConfidence', { level: tPrep(confidenceKey) })}
            {mv?.confidence_score != null && Number.isFinite(Number(mv.confidence_score))
              ? ` · ${tPrep('scoreLabel', { score: Math.round(Number(mv.confidence_score)) })}`
              : ''}
          </span>
        </div>
      </div>

      <details
        className="rounded-lg border border-border/50 bg-background/40 group"
        open={engineDiscountSteps.length > 0 && engineDiscountSteps.length <= 3}
      >
        <summary className="cursor-pointer px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-foreground/55 marker:hidden flex items-center justify-between gap-2 select-none">
          <span>{tPrep('alreadyInBenchmarkTitle')}</span>
          <span className="font-mono tabular-nums text-foreground/40">
            {engineDiscountSteps.length > 0 ? `${engineDiscountSteps.length}` : '—'}
          </span>
        </summary>
        <div className="px-3 pb-2.5 pt-1 space-y-1.5 border-t border-border/30">
          <p className="text-[10px] leading-snug text-foreground/50">
            {tPrep('alreadyInBenchmarkSubtitle')}
          </p>
          {engineDiscountSteps.length === 0 ? (
            <p className="text-[10px] italic text-foreground/45 pt-1">
              {tPrep('alreadyInBenchmarkEmpty')}
            </p>
          ) : (
            <ul className="space-y-1 text-[11px]">
              {engineDiscountSteps.map((step, idx) => (
                <li
                  key={`${step.name}-${idx}`}
                  className="flex items-baseline justify-between gap-2 font-mono tabular-nums"
                >
                  <span className="font-sans text-foreground/70 truncate">{step.name}</span>
                  <span
                    className={cn(
                      'shrink-0 font-semibold',
                      step.pct < 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    )}
                  >
                    {step.pct > 0 ? '+' : '−'}
                    {Math.abs(step.pct).toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      {dossierSignal != null &&
        !suggestionDismissed &&
        !nonEbitdaMethodSelected &&
        benchmarkNum != null &&
        benchmarkNum > 0 &&
        !(wasRestoredFromSave && reasonKey === dossierSignal.reasonKey) && (
          <div className="rounded-lg border border-amber-300/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                {tPrep('suggestedBadgeLabel')}
              </span>
            </div>
            <p className="text-[11px] font-semibold text-amber-900 dark:text-amber-200 leading-snug">
              {tPrep('suggestionPanelTitle')}
            </p>
            <p className="text-[11px] leading-snug text-amber-800/85 dark:text-amber-200/85">
              {tPrep('suggestionPanelBody', {
                signal: tPrep(dossierSignal.i18nKey, dossierSignal.i18nValues ?? {}),
                direction_label:
                  dossierSignal.band.direction === 'discount'
                    ? tPrep('signalDirectionDiscount')
                    : tPrep('signalDirectionPremium'),
                low: dossierSignal.band.lowPct,
                high: dossierSignal.band.highPct,
              })}
            </p>
            <div className="flex gap-2 pt-0.5">
              <AuroraButton
                type="button"
                variant="primary"
                size="sm"
                disabled={effectiveDisabled}
                className="flex-1 text-[11px]"
                onClick={() => {
                  const projected = projectSuggestedMultiple(benchmarkNum, dossierSignal.band)
                  const clamped = Math.min(sliderMax, Math.max(sliderMin, projected))
                  setAppliedMedian(clamped)
                  setReasonKey(dossierSignal.reasonKey)
                  setSuggestionDismissed(true)
                }}
              >
                {tPrep('suggestionApplyCta', {
                  percent: dossierSignal.band.midPct,
                  direction_label:
                    dossierSignal.band.direction === 'discount'
                      ? tPrep('signalDirectionDiscount')
                      : tPrep('signalDirectionPremium'),
                })}
              </AuroraButton>
              <AuroraButton
                type="button"
                variant="outline"
                size="sm"
                disabled={effectiveDisabled}
                className="text-[11px]"
                onClick={() => setSuggestionDismissed(true)}
              >
                {tPrep('suggestionDismissCta')}
              </AuroraButton>
            </div>
          </div>
        )}

      {!nonEbitdaMethodSelected && benchmarkNum != null && benchmarkNum > 0 && (
        <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-2.5 space-y-2">
          <div className="space-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/55">
              {tPrep('presetsTitle')}
            </p>
            <p className="text-[10px] leading-snug text-foreground/45">
              {tPrep('presetsSubtitle')}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {SCENARIO_PRESETS.map((preset) => {
              const projected = projectSuggestedMultiple(benchmarkNum, preset.band)
              const isActive = reasonKey === preset.reasonKey
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={effectiveDisabled}
                  aria-pressed={isActive}
                  className={cn(
                    'group flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 text-left transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    isActive
                      ? 'border-primary/40 bg-primary/[0.08]'
                      : preset.band.direction === 'discount'
                        ? 'border-rose-500/20 bg-rose-500/[0.04] hover:border-rose-500/35 hover:bg-rose-500/[0.06]'
                        : 'border-emerald-500/20 bg-emerald-500/[0.04] hover:border-emerald-500/35 hover:bg-emerald-500/[0.06]'
                  )}
                  onClick={() => {
                    const clamped = Math.min(sliderMax, Math.max(sliderMin, projected))
                    setAppliedMedian(clamped)
                    setReasonKey(preset.reasonKey)
                    setSuggestionDismissed(true)
                  }}
                >
                  <span
                    className={cn(
                      'flex items-center justify-between w-full text-[11px] font-semibold',
                      isActive ? 'text-primary' : 'text-foreground/85'
                    )}
                  >
                    <span className="truncate">{tPrep(preset.labelI18nKey)}</span>
                    <span
                      className={cn(
                        'shrink-0 ml-2 text-[10px] font-mono tabular-nums',
                        preset.band.direction === 'discount'
                          ? 'text-rose-700 dark:text-rose-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      )}
                    >
                      {preset.band.direction === 'discount' ? '−' : '+'}
                      {preset.band.midPct}%
                    </span>
                  </span>
                  <span className="text-[10px] leading-snug text-foreground/55">
                    {tPrep(preset.hintI18nKey)}
                  </span>
                  <span className="text-[10px] font-mono tabular-nums text-foreground/45 mt-0.5">
                    → {projected.toFixed(2)}×
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid gap-1">
        <label
          className="text-[10px] font-medium text-foreground/45 uppercase"
          htmlFor="modal-prep-ev-ebitda"
        >
          {tPrep('applied')}
        </label>
        {prepDeltaNum != null &&
          Math.abs(prepDeltaNum) >= 0.005 &&
          benchmarkNum != null &&
          benchmarkNum > 0 && (
            <div
              className={cn(
                'flex items-center justify-between rounded-md border px-2.5 py-1.5 text-[11px]',
                prepDeltaNum > 0
                  ? 'border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-700 dark:text-emerald-300'
                  : 'border-rose-500/25 bg-rose-500/[0.06] text-rose-700 dark:text-rose-300'
              )}
            >
              <span className="font-semibold uppercase tracking-wide text-[10px]">
                {prepDeltaNum > 0 ? tPrep('deltaPremiumLabel') : tPrep('deltaDiscountLabel')}
              </span>
              <span className="font-mono tabular-nums">
                {prepDeltaNum > 0 ? '+' : '−'}
                {Math.abs(prepDeltaNum).toFixed(2)}×
                <span className="opacity-70 ml-2">
                  ({prepDeltaNum > 0 ? '+' : '−'}
                  {((Math.abs(prepDeltaNum) / benchmarkNum) * 100).toFixed(1)}%)
                </span>
              </span>
            </div>
          )}
        <input
          id="modal-prep-ev-ebitda"
          type="number"
          step={0.05}
          min={sliderMin}
          max={sliderMax}
          disabled={effectiveDisabled}
          value={appliedMedian ?? ''}
          onChange={(event) => {
            const value = event.target.value
            if (value === '') {
              setAppliedMedian(null)
              return
            }
            const parsed = parseFloat(value)
            if (Number.isFinite(parsed))
              setAppliedMedian(Math.min(sliderMax, Math.max(sliderMin, parsed)))
          }}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono tabular-nums"
        />
        <input
          type="range"
          aria-label={tPrep('applied')}
          disabled={effectiveDisabled}
          min={sliderMin}
          max={sliderMax}
          step={0.05}
          value={
            appliedMedian != null && Number.isFinite(appliedMedian)
              ? Math.min(sliderMax, Math.max(sliderMin, appliedMedian))
              : Math.min(sliderMax, Math.max(sliderMin, bench))
          }
          onChange={(event) => {
            const parsed = parseFloat(event.target.value)
            if (Number.isFinite(parsed)) setAppliedMedian(parsed)
          }}
          className="w-full h-2 mt-1 accent-primary"
        />
        <PercentileBandGauge
          band={{
            p10: mv?.p10_ebitda_multiple ?? null,
            p25: mv?.p25_ebitda_multiple ?? null,
            p50: mv?.p50_ebitda_multiple ?? benchmarkNum,
            p75: mv?.p75_ebitda_multiple ?? null,
            p90: mv?.p90_ebitda_multiple ?? null,
          }}
          benchmark={benchmarkNum}
          applied={appliedNum}
          domainMin={sliderMin}
          domainMax={sliderMax}
          caption={tPrep('gaugeCaption')}
          labels={{
            legend: tPrep('gaugeLegend'),
            benchmark: tPrep('gaugeBenchmarkLabel'),
            applied: tPrep('gaugeAppliedLabel'),
            typicalBand: tPrep('gaugeTypicalBandLabel'),
            outOfBand: tPrep('gaugeOutOfBandLabel'),
          }}
          className="mt-2"
        />
        <p className="text-[10px] text-foreground/35">{tPrep('sliderHint')}</p>
      </div>

      {liveEquityPreview != null && (
        <div className="rounded-md border border-primary/20 bg-primary/[0.05] px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-primary/80">
              {tBreakdown('previewEquity')}
            </span>
            <span className="text-[10px] text-primary/65">{tBreakdown('previewLabel')}</span>
          </div>
          <div className="mt-1 flex items-end justify-between gap-3">
            <div>
              <p className="text-lg font-mono font-semibold tabular-nums text-primary">
                {formatCurrency(liveEquityPreview)}
              </p>
              <p className="text-[11px] leading-snug text-foreground/55">
                {tBreakdown('previewBlurb')}
              </p>
            </div>
            {activeMetricValue != null && (
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wide text-foreground/45">
                  {tBreakdown('deltaToHeadline')}
                </p>
                <p
                  className={cn(
                    'text-[11px] font-mono tabular-nums',
                    liveEquityPreview - activeMetricValue === 0
                      ? 'text-foreground/55'
                      : liveEquityPreview - activeMetricValue > 0
                        ? 'text-success'
                        : 'text-warning'
                  )}
                >
                  {liveEquityPreview - activeMetricValue === 0
                    ? '±'
                    : liveEquityPreview - activeMetricValue > 0
                      ? '+'
                      : '−'}
                  {formatCurrency(Math.abs(liveEquityPreview - activeMetricValue))}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

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
          onChange={(value) => setReasonKey(value as PreparerEbitdaReasonKey | '')}
          disabled={effectiveDisabled}
          placeholder={tPrep('reasonPlaceholder')}
          options={PREPARER_EBITDA_REASON_KEYS.map((key) => ({
            value: key,
            label: tPrep(`reasons.${key}`),
          }))}
          clearable
        />
        {selectedReasonBand != null && (
          <p className="text-[10px] leading-snug text-foreground/50 font-mono tabular-nums">
            {tPrep('reasonBandTooltip', {
              direction:
                selectedReasonBand.direction === 'discount'
                  ? tPrep('signalDirectionDiscount')
                  : tPrep('signalDirectionPremium'),
              low: selectedReasonBand.lowPct,
              high: selectedReasonBand.highPct,
            })}
          </p>
        )}
      </div>

      <div className="grid gap-1">
        <div className="flex items-center justify-between gap-2">
          <label
            className="text-[10px] font-medium text-foreground/45 uppercase"
            htmlFor="modal-prep-note"
          >
            {tPrep('noteOptional')}
          </label>
          <span
            className={cn(
              'text-[10px] font-mono tabular-nums',
              note.length > 450 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground/40'
            )}
            aria-live="polite"
          >
            {tModal('noteCharCounter', { count: note.length, max: 500 })}
          </span>
        </div>
        <textarea
          id="modal-prep-note"
          disabled={effectiveDisabled}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          maxLength={500}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs resize-none"
        />
      </div>

      {previewText && (
        <div className="rounded-lg border border-primary/30 bg-primary/[0.06] px-3.5 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-primary/85">
                {tPrep('previewTitle')}
              </p>
              <p className="text-[10px] text-primary/60">{tPrep('previewSubtitle')}</p>
            </div>
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-primary/70 bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-full">
              {livePreview ? tPrep('previewLive') : tPrep('previewSaved')}
            </span>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-foreground/85 italic">
            {previewText}
          </p>
        </div>
      )}

      {showExtreme && (
        <div className="rounded-md border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2.5 space-y-2">
          <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 leading-snug">
            {extremeBoundInfo && appliedNum != null
              ? tPrep('extremeWarningDetailed', {
                  applied: appliedNum.toFixed(2),
                  direction: extremeBoundInfo.direction,
                  bound: extremeBoundInfo.bound,
                  boundValue: extremeBoundInfo.boundValue,
                  direction_label: extremeBoundInfo.directionLabel,
                })
              : tPrep('extremeWarning')}
          </p>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              disabled={effectiveDisabled}
              checked={acknowledgedExtreme}
              onChange={(event) => setAcknowledgedExtreme(event.target.checked)}
              className="mt-1"
            />
            <span className="text-[11px] text-amber-700 dark:text-amber-300/90 leading-snug">
              {tPrep('extremeWarning')}
            </span>
          </label>
        </div>
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
        {!showResetConfirm ? (
          <AuroraButton
            type="button"
            variant="outline"
            size="sm"
            disabled={effectiveDisabled}
            className="w-full text-xs"
            onClick={() => setShowResetConfirm(true)}
          >
            {tPrep('resetBenchmark')}
          </AuroraButton>
        ) : (
          <div className="rounded-md border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2.5 space-y-2">
            <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
              {tModal('resetConfirmTitle')}
            </p>
            <p className="text-[11px] leading-snug text-amber-700/90 dark:text-amber-300/85">
              {tModal('resetConfirmBody')}
            </p>
            <div className="flex gap-2">
              <AuroraButton
                type="button"
                variant="outline"
                size="sm"
                disabled={effectiveDisabled}
                className="flex-1 text-xs"
                onClick={() => setShowResetConfirm(false)}
              >
                {tModal('resetConfirmCancel')}
              </AuroraButton>
              <AuroraButton
                type="button"
                variant="primary"
                size="sm"
                disabled={effectiveDisabled}
                className="flex-1 text-xs"
                onClick={() => {
                  resetToBenchmark()
                  setShowResetConfirm(false)
                }}
              >
                {tModal('resetConfirmCta')}
              </AuroraButton>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
