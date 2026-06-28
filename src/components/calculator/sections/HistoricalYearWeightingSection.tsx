'use client'

import { Info, RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useMemo } from 'react'
import { AuroraButton } from '@/design-system/components/Button'
import { SegmentedControl } from '@/design-system/components/SegmentedControl'
import { Slider } from '@/design-system/components/Slider'
import {
  buildHistoricalWeightingModeUpdates,
  buildHistoricalWeightUpdate,
  buildRecencyHistoricalWeights,
  deriveHistoricalYearWeightingModel,
  type WeightingMode,
} from './advancedAdvisorControlsModel'

export interface HistoricalYearWeightingSectionProps {
  historicalYears: number[]
  historicalEbitdaWeightingMode?: WeightingMode
  historicalEbitdaWeights?: Record<number, number>
  onFieldChange: (field: string, value: unknown) => void
  disabled?: boolean
  /**
   * 'inline' renders a titled standalone section for the main calculator flow
   * (alongside the method/multiple weighting). 'modal' renders the bare controls
   * for the Advanced Advisor Controls modal, which supplies its own framing.
   */
  variant?: 'inline' | 'modal'
}

/**
 * Per-fiscal-year weighting control. The advisor weights the YEARS, and the same
 * split drives both the revenue and EBITDA aggregates the valuation is built on.
 * Default ('standard') is the engine's recency ramp (most recent year heaviest,
 * 50/33/17 for three years); 'weighted' opens per-year sliders. Shared by the
 * advisor controls modal and the inline calculator panel via one derived model.
 */
export function HistoricalYearWeightingSection({
  historicalYears,
  historicalEbitdaWeightingMode,
  historicalEbitdaWeights,
  onFieldChange,
  disabled,
  variant = 'modal',
}: HistoricalYearWeightingSectionProps) {
  const t = useTranslations('manualInput.methodSelector.advancedAdvisorControls')
  const needsYearsHintId = useId()
  const { mode, rawWeights, yearKeys, years, canWeight } = useMemo(
    () =>
      deriveHistoricalYearWeightingModel({
        historicalYears,
        historicalEbitdaWeightingMode,
        historicalEbitdaWeights,
      }),
    [historicalYears, historicalEbitdaWeightingMode, historicalEbitdaWeights]
  )

  const updateWeight = (year: number, nextValue: number) => {
    onFieldChange(
      'historical_ebitda_weights',
      buildHistoricalWeightUpdate({ rawWeights, year, nextValue })
    )
  }

  const resetWeights = () => {
    onFieldChange('historical_ebitda_weights', buildRecencyHistoricalWeights(yearKeys))
  }

  const switchWeightingMode = (nextMode: WeightingMode) => {
    for (const update of buildHistoricalWeightingModeUpdates({ nextMode, yearKeys })) {
      onFieldChange(update.field, update.value)
    }
  }

  const controls = (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl<WeightingMode>
          value={mode}
          onChange={switchWeightingMode}
          options={[
            { value: 'standard', label: t('standardAverage') },
            { value: 'weighted', label: t('weightedAverage'), disabled: !canWeight },
          ]}
          size="sm"
          variant="pills"
          disabled={disabled}
          aria-label={t('historicalWeighting')}
          aria-describedby={canWeight ? undefined : needsYearsHintId}
        />
        {mode === 'weighted' && (
          <AuroraButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={resetWeights}
            disabled={disabled}
            className="gap-1.5 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t('resetEqual')}
          </AuroraButton>
        )}
      </div>

      {!canWeight && (
        <div
          id={needsYearsHintId}
          className="inline-flex items-center gap-2 text-[11px] text-foreground/45"
        >
          <Info className="h-3.5 w-3.5" />
          {t('needsThreeYears')}
        </div>
      )}

      {mode === 'weighted' && canWeight && (
        <div className="space-y-3">
          {years.map((year) => {
            const value = rawWeights[String(year)] ?? 0
            return (
              <div key={year} className="grid grid-cols-[64px_1fr_48px] items-center gap-3">
                <span className="font-mono text-xs text-foreground/65">{year}</span>
                <Slider
                  value={value}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(next) => updateWeight(year, next)}
                  disabled={disabled}
                  showTooltip
                  formatValue={(v) => `${Math.round(v)}%`}
                  aria-label={`${year} ${t('historicalWeighting')}`}
                />
                <span className="font-mono text-xs text-foreground/65 tabular-nums">
                  {Math.round(value)}%
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  if (variant === 'modal') {
    return controls
  }

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground/55">
            {t('historicalWeightingTitle')}
          </span>
        </div>
        <p className="text-[11px] text-foreground/45">{t('historicalWeightingHint')}</p>
      </div>
      {controls}
    </section>
  )
}
