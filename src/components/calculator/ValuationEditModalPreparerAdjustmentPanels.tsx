'use client'

import { useTranslations } from 'next-intl'
import { AuroraButton } from '@/design-system/components/Button'
import { cn } from '@/design-system/utils'
import {
  type DossierSignal,
  projectSuggestedMultiple,
  SCENARIO_PRESETS,
  type SuggestedBand,
} from '../../store/manual/preparerCalibrationSuggestions'
import type { PreparerEbitdaReasonKey } from '../../store/manual/usePreparerMultipleStore'
import type { ValuationResponse } from '../../types/valuation'
import { PercentileBandGauge } from './PercentileBandGauge'

export function clampToSliderRange(value: number, sliderMin: number, sliderMax: number): number {
  return Math.min(sliderMax, Math.max(sliderMin, value))
}

export function clampProjectedMultiple({
  band,
  benchmarkNum,
  sliderMax,
  sliderMin,
}: {
  band: SuggestedBand
  benchmarkNum: number
  sliderMin: number
  sliderMax: number
}): number {
  const projected = projectSuggestedMultiple(benchmarkNum, band)
  return clampToSliderRange(projected, sliderMin, sliderMax)
}

interface PreparerDossierSuggestionPanelProps {
  benchmarkNum: number | null
  dossierSignal: DossierSignal | null
  effectiveDisabled: boolean
  nonEbitdaMethodSelected: boolean
  reasonKey: PreparerEbitdaReasonKey | ''
  sliderMax: number
  sliderMin: number
  suggestionDismissed: boolean
  wasRestoredFromSave: boolean
  onApply: (value: number, reasonKey: PreparerEbitdaReasonKey) => void
  onDismiss: () => void
}

export function PreparerDossierSuggestionPanel({
  benchmarkNum,
  dossierSignal,
  effectiveDisabled,
  nonEbitdaMethodSelected,
  reasonKey,
  sliderMax,
  sliderMin,
  suggestionDismissed,
  wasRestoredFromSave,
  onApply,
  onDismiss,
}: PreparerDossierSuggestionPanelProps) {
  const tPrep = useTranslations('preparerMultiple')

  if (
    dossierSignal == null ||
    suggestionDismissed ||
    nonEbitdaMethodSelected ||
    benchmarkNum == null ||
    benchmarkNum <= 0 ||
    (wasRestoredFromSave && reasonKey === dossierSignal.reasonKey)
  ) {
    return null
  }

  const directionLabel =
    dossierSignal.band.direction === 'discount'
      ? tPrep('signalDirectionDiscount')
      : tPrep('signalDirectionPremium')

  return (
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
          direction_label: directionLabel,
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
            onApply(
              clampProjectedMultiple({
                benchmarkNum,
                band: dossierSignal.band,
                sliderMin,
                sliderMax,
              }),
              dossierSignal.reasonKey
            )
          }}
        >
          {tPrep('suggestionApplyCta', {
            percent: dossierSignal.band.midPct,
            direction_label: directionLabel,
          })}
        </AuroraButton>
        <AuroraButton
          type="button"
          variant="outline"
          size="sm"
          disabled={effectiveDisabled}
          className="text-[11px]"
          onClick={onDismiss}
        >
          {tPrep('suggestionDismissCta')}
        </AuroraButton>
      </div>
    </div>
  )
}

interface PreparerScenarioPresetGridProps {
  benchmarkNum: number | null
  effectiveDisabled: boolean
  nonEbitdaMethodSelected: boolean
  reasonKey: PreparerEbitdaReasonKey | ''
  sliderMax: number
  sliderMin: number
  onApply: (value: number, reasonKey: PreparerEbitdaReasonKey) => void
}

export function PreparerScenarioPresetGrid({
  benchmarkNum,
  effectiveDisabled,
  nonEbitdaMethodSelected,
  reasonKey,
  sliderMax,
  sliderMin,
  onApply,
}: PreparerScenarioPresetGridProps) {
  const tPrep = useTranslations('preparerMultiple')

  if (nonEbitdaMethodSelected || benchmarkNum == null || benchmarkNum <= 0) {
    return null
  }

  return (
    <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-2.5 space-y-2">
      <div className="space-y-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/55">
          {tPrep('presetsTitle')}
        </p>
        <p className="text-[10px] leading-snug text-foreground/45">{tPrep('presetsSubtitle')}</p>
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
                onApply(
                  clampProjectedMultiple({
                    benchmarkNum,
                    band: preset.band,
                    sliderMin,
                    sliderMax,
                  }),
                  preset.reasonKey
                )
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
                  {preset.band.direction === 'discount' ? '-' : '+'}
                  {preset.band.midPct}%
                </span>
              </span>
              <span className="text-[10px] leading-snug text-foreground/55">
                {tPrep(preset.hintI18nKey)}
              </span>
              <span className="text-[10px] font-mono tabular-nums text-foreground/45 mt-0.5">
                {'->'} {projected.toFixed(2)}x
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface PreparerAppliedMultipleControlProps {
  appliedMedian: number | null
  appliedNum: number | null
  bench: number
  benchmarkNum: number | null
  effectiveDisabled: boolean
  mv: ValuationResponse['multiples_valuation'] | undefined
  prepDeltaNum: number | null
  sliderMax: number
  sliderMin: number
  setAppliedMedian: (value: number | null) => void
}

export function PreparerAppliedMultipleControl({
  appliedMedian,
  appliedNum,
  bench,
  benchmarkNum,
  effectiveDisabled,
  mv,
  prepDeltaNum,
  sliderMax,
  sliderMin,
  setAppliedMedian,
}: PreparerAppliedMultipleControlProps) {
  const tPrep = useTranslations('preparerMultiple')
  const rangeValue =
    appliedMedian != null && Number.isFinite(appliedMedian)
      ? clampToSliderRange(appliedMedian, sliderMin, sliderMax)
      : clampToSliderRange(bench, sliderMin, sliderMax)

  return (
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
          if (Number.isFinite(parsed)) {
            setAppliedMedian(clampToSliderRange(parsed, sliderMin, sliderMax))
          }
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
        value={rangeValue}
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
  )
}
