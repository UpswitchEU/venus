'use client'

import { Info, RotateCcw, Sparkles } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'
import {
  equalWeightsFor,
  normalizeRemainderWeights,
  rebalanceMethodWeights,
} from '@/constants/methodFieldConfig'
import { resolveMercuryAppOrigin } from '../../../utils/getMercuryAppOrigin'
import { AuroraButton } from '@/design-system/components/Button'
import { AuroraFormAlert } from '@/design-system/components/FormSection'
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

export interface AdvancedAdvisorControlsSectionProps {
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
  /**
   * `'section'` (default) renders the original wizard-flow section header
   * + body. `'bare'` strips the section chrome so the same body can be
   * mounted inside a Modal (the modal supplies its own header). Step 4a
   * graduated from inline to modal-only on 2026-05-23; the section variant
   * is preserved so any future "inline preview" surface can still embed it.
   */
  chrome?: 'section' | 'bare'
  onFieldChange: (field: string, value: unknown) => void
  disabled?: boolean
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
  chrome = 'section',
  onFieldChange,
  disabled,
}: AdvancedAdvisorControlsSectionProps) {
  const t = useTranslations('manualInput.methodSelector.advancedAdvisorControls')
  const locale = useLocale()
  const showPrefilledHint =
    (advisorDefaultsAppliedFields?.length ?? 0) > 0
  const mercuryAppOrigin = useMemo(() => resolveMercuryAppOrigin(), [])
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

  // AuroraFormAlert type='info' is the DS-canonical place for this kind
  // of contextual hint — it carries the same Aurora primary tint we were
  // hand-rolling, plus the motion + spacing tokens. The Sparkles glyph
  // signals "your saved baseline is in"; the deep-link to Mercury keeps
  // its underline-on-hover treatment so it stays recognisable as a link.
  const prefilledHint = showPrefilledHint ? (
    <AuroraFormAlert
      type="info"
      icon={<Sparkles className="h-3.5 w-3.5 text-primary/80" aria-hidden />}
    >
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
    </AuroraFormAlert>
  ) : null

  const Wrapper: 'section' | 'div' = chrome === 'section' ? 'section' : 'div'

  return (
    <Wrapper className="space-y-4">
      {chrome === 'section' && (
        <ValuationSectionHeader step={step} title={t('title')} complete={complete} />
      )}

      {prefilledHint}

      <div className="rounded-lg border border-foreground/10 bg-foreground/[0.025] p-4 space-y-4">
        <Switch
          checked={showEnterpriseToEquityBridge ?? true}
          onChange={(checked) => onFieldChange('show_enterprise_to_equity_bridge', checked)}
          label={t('waterfallToggle')}
          disabled={disabled}
        />

        {/*
         * Multiple calibration block.
         *
         * Previously a 3-col grid (sector | input | calibrated) which
         * truncated the long "Specifieke risico-/kwaliteitspremie" label and
         * gave equal visual weight to one editable field plus two read-only
         * derivations. The fields are *not* peers — they form an equation
         * (sector + premium = calibrated). Stacking the input above a
         * derivation "tape" makes the affordance unambiguous (one click
         * target) and reads top-to-bottom like the arithmetic it represents.
         */}
        <div className="space-y-3" data-testid="advisor-calibration-block">
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

          <dl
            className="rounded-lg border border-foreground/10 bg-background/40 px-4 py-3 text-sm space-y-1.5"
            data-testid="advisor-calibration-derivation"
          >
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-foreground/65">{t('sectorMultiple')}</dt>
              <dd className="font-mono tabular-nums text-foreground/80">
                {sectorAverageMultiple != null && Number.isFinite(sectorAverageMultiple)
                  ? `${sectorAverageMultiple.toFixed(2)}x`
                  : '—'}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-foreground/65">{t('plusYourPremium')}</dt>
              <dd className="font-mono tabular-nums text-foreground/80">
                {/*
                 * Treat undefined and exactly 0 identically: both display "—"
                 * because the audit-trail rule (calibrationNote required when
                 * adjustment !== 0) already collapses them — surfacing
                 * "+0.00" here would imply a deliberate zero-premium choice
                 * that the rest of the section does not enforce.
                 */}
                {multipleCalibrationAdjustment === undefined || adjustment === 0
                  ? '—'
                  : `${adjustment >= 0 ? '+' : ''}${adjustment.toFixed(2)}`}
              </dd>
            </div>
            <div className="border-t border-foreground/10 pt-2 flex items-baseline justify-between gap-3">
              <dt className="font-medium text-foreground">{t('calibratedMultiple')}</dt>
              <dd className="font-mono text-base font-semibold tabular-nums text-foreground">
                {calibratedMultiple != null ? `${calibratedMultiple.toFixed(2)}x` : '—'}
              </dd>
            </div>
          </dl>
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
    </Wrapper>
  )
}
