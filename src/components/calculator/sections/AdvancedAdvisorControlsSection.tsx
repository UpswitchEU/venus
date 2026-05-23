'use client'

import { Info, RotateCcw, Sparkles } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'
import {
  equalWeightsFor,
  normalizeRemainderWeights,
  rebalanceMethodWeights,
} from '@/constants/methodFieldConfig'
import { AuroraButton } from '@/design-system/components/Button'
import { AuroraInput, AuroraTextarea } from '@/design-system/components/Input'
import { SegmentedControl } from '@/design-system/components/SegmentedControl'
import { Slider } from '@/design-system/components/Slider'
import { Switch } from '@/design-system/components/Switch'
import { ValuationSectionHeader } from './ValuationSectionHeader'

type WeightingMode = 'standard' | 'weighted'

type AdvisorDefaultAppliedField =
  | 'multiple_calibration_adjustment'
  | 'historical_ebitda_weighting_mode'
  | 'show_enterprise_to_equity_bridge'

interface AdvancedAdvisorControlsSectionProps {
  step: string | number
  sectorAverageMultiple?: number | null
  multipleCalibrationAdjustment?: number
  multipleCalibrationNote?: string
  historicalYears: number[]
  historicalEbitdaWeightingMode?: WeightingMode
  historicalEbitdaWeights?: Record<number, number>
  showEnterpriseToEquityBridge?: boolean
  /**
   * Fields on this step that were seeded from the advisor's saved defaults
   * (Mercury settings → Titan `accountant_settings`). Renders a small
   * "prefilled from your settings" hint with a link back to Mercury so the
   * advisor knows the value is a starting point, not a hard rule.
   */
  advisorDefaultsAppliedFields?: ReadonlyArray<AdvisorDefaultAppliedField>
  onFieldChange: (field: string, value: unknown) => void
  disabled?: boolean
}

function getMercuryAppOrigin(): string | null {
  if (typeof window === 'undefined') return null
  const explicit = process.env.NEXT_PUBLIC_MERCURY_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  // Mercury and Venus typically sit on sibling subdomains in production; fall
  // back to swapping the host prefix when no explicit env var is set.
  const { protocol, host } = window.location
  if (host.startsWith('venus.')) return `${protocol}//${host.replace(/^venus\./, '')}`
  if (host.startsWith('calculator.'))
    return `${protocol}//${host.replace(/^calculator\./, '')}`
  return null
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function sortedDistinctYears(years: number[]): number[] {
  return Array.from(new Set(years.filter((year) => Number.isFinite(year)))).sort((a, b) => a - b)
}

export function AdvancedAdvisorControlsSection({
  step,
  sectorAverageMultiple,
  multipleCalibrationAdjustment,
  multipleCalibrationNote,
  historicalYears,
  historicalEbitdaWeightingMode,
  historicalEbitdaWeights,
  showEnterpriseToEquityBridge,
  advisorDefaultsAppliedFields,
  onFieldChange,
  disabled,
}: AdvancedAdvisorControlsSectionProps) {
  const t = useTranslations('manualInput.methodSelector.advancedAdvisorControls')
  const locale = useLocale()
  const showPrefilledHint =
    (advisorDefaultsAppliedFields?.length ?? 0) > 0
  const mercuryAppOrigin = useMemo(() => getMercuryAppOrigin(), [])
  const prefilledSettingsHref = mercuryAppOrigin
    ? `${mercuryAppOrigin}/${locale}/advisor/settings?tab=valuation`
    : null

  const years = useMemo(() => sortedDistinctYears(historicalYears).slice(-5), [historicalYears])
  const yearKeys = useMemo(() => years.map(String), [years])
  const mode = historicalEbitdaWeightingMode ?? 'standard'
  const canWeight = years.length >= 3
  const rawWeights = useMemo(() => {
    const out: Record<string, number> = {}
    const fallback = equalWeightsFor(yearKeys)
    for (const year of years) {
      const existing = historicalEbitdaWeights?.[year]
      out[String(year)] = Number.isFinite(Number(existing))
        ? Number(existing)
        : fallback[String(year)]
    }
    return normalizeRemainderWeights(yearKeys, out)
  }, [yearKeys, years, historicalEbitdaWeights])

  const adjustment = multipleCalibrationAdjustment ?? 0
  const calibratedMultiple =
    sectorAverageMultiple != null && Number.isFinite(sectorAverageMultiple)
      ? sectorAverageMultiple + adjustment
      : null
  const requiresCalibrationNote = adjustment !== 0
  const noteComplete = !requiresCalibrationNote || Boolean(multipleCalibrationNote?.trim())
  const complete = noteComplete && (mode !== 'weighted' || !canWeight || years.length >= 3)

  const updateWeight = (year: number, nextValue: number) => {
    const next = rebalanceMethodWeights(rawWeights, String(year), Math.round(nextValue))
    onFieldChange(
      'historical_ebitda_weights',
      Object.fromEntries(Object.entries(next).map(([key, value]) => [Number(key), value]))
    )
  }

  const resetWeights = () => {
    const next = equalWeightsFor(yearKeys)
    onFieldChange(
      'historical_ebitda_weights',
      Object.fromEntries(Object.entries(next).map(([key, value]) => [Number(key), value]))
    )
  }

  const switchWeightingMode = (nextMode: WeightingMode) => {
    onFieldChange('historical_ebitda_weighting_mode', nextMode)
    if (nextMode === 'weighted') {
      resetWeights()
    } else {
      onFieldChange('historical_ebitda_weights', undefined)
    }
  }

  return (
    <section className="space-y-4">
      <ValuationSectionHeader step={step} title={t('title')} complete={complete} />

      {showPrefilledHint && (
        <div
          className="flex items-start gap-2 rounded-lg border border-primary/15 bg-primary/[0.04] px-3 py-2 text-[11px] text-foreground/70"
          role="note"
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary/80" aria-hidden />
          <p className="leading-relaxed">
            {t('prefilledFromSettings')}{' '}
            {prefilledSettingsHref ? (
              <a
                href={prefilledSettingsHref}
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                {t('prefilledFromSettingsLink')}
              </a>
            ) : null}
          </p>
        </div>
      )}

      <div className="rounded-lg border border-foreground/10 bg-foreground/[0.025] p-4 space-y-4">
        <Switch
          checked={showEnterpriseToEquityBridge ?? true}
          onChange={(checked) => onFieldChange('show_enterprise_to_equity_bridge', checked)}
          label={t('waterfallToggle')}
          disabled={disabled}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-foreground/10 bg-background/40 px-3 py-2">
            <div className="text-[11px] text-foreground/50">{t('sectorMultiple')}</div>
            <div className="mt-1 font-mono text-sm text-foreground">
              {sectorAverageMultiple != null && Number.isFinite(sectorAverageMultiple)
                ? `${sectorAverageMultiple.toFixed(2)}x`
                : '-'}
            </div>
          </div>
          <AuroraInput
            type="number"
            min="-10"
            max="10"
            step="0.1"
            label={t('specificPremium')}
            size="sm"
            value={multipleCalibrationAdjustment ?? ''}
            onChange={(event) => {
              const value = toFiniteNumber(event.target.value)
              onFieldChange('multiple_calibration_adjustment', value ?? undefined)
            }}
            disabled={disabled}
          />
          <div className="rounded-lg border border-foreground/10 bg-background/40 px-3 py-2">
            <div className="text-[11px] text-foreground/50">{t('calibratedMultiple')}</div>
            <div className="mt-1 font-mono text-sm text-foreground">
              {calibratedMultiple != null ? `${calibratedMultiple.toFixed(2)}x` : '-'}
            </div>
          </div>
        </div>

        {requiresCalibrationNote && (
          <AuroraTextarea
            id="multiple-calibration-note"
            name="multiple_calibration_note"
            label={t('calibrationNote')}
            value={multipleCalibrationNote ?? ''}
            onChange={(event) => onFieldChange('multiple_calibration_note', event.target.value)}
            size="sm"
            rows={3}
            required
            touched={requiresCalibrationNote}
            error={!noteComplete ? t('calibrationNoteRequired') : undefined}
            disabled={disabled}
          />
        )}

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
            <div className="inline-flex items-center gap-2 text-[11px] text-foreground/45">
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
      </div>
    </section>
  )
}
