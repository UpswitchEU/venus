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
import { AuroraFormAlert } from '@/design-system/components/FormSection'
import { AuroraInput, AuroraTextarea } from '@/design-system/components/Input'
import { SegmentedControl } from '@/design-system/components/SegmentedControl'
import { Slider } from '@/design-system/components/Slider'
import { Switch } from '@/design-system/components/Switch'
import { resolveMercuryAppOrigin } from '../../../utils/getMercuryAppOrigin'
import { ValuationSectionHeader } from './ValuationSectionHeader'

type WeightingMode = 'standard' | 'weighted'
type MultipleTypeKey = 'ev_ebitda' | 'ev_revenue' | 'pe'
type AdvisorDiscountKey =
  | 'size_discount'
  | 'liquidity_discount'
  | 'country_adjustment'
  | 'growth_premium'
  | 'owner_concentration'

type AdvisorDefaultAppliedField =
  | 'multiple_calibration_adjustment'
  | 'historical_ebitda_weighting_mode'
  | 'show_enterprise_to_equity_bridge'

export interface AdvancedAdvisorControlsSectionProps {
  step: string | number
  sectorAverageMultiple?: number | null
  multipleCalibrationAdjustment?: number
  multipleCalibrationNote?: string
  effectiveMultipleOverride?: number
  effectiveMultipleOverrideNote?: string
  multipleTypeWeights?: Record<string, number>
  riskAnalysisEnabled?: boolean
  advisorDiscountWeights?: Record<string, number>
  discountFloorFactor?: number
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

const ADVISOR_DISCOUNT_ROWS: Array<{
  key: AdvisorDiscountKey
  labelKey: string
}> = [
  { key: 'size_discount', labelKey: 'sizeDiscount' },
  { key: 'liquidity_discount', labelKey: 'liquidityDiscount' },
  { key: 'country_adjustment', labelKey: 'countryAdjustment' },
  { key: 'growth_premium', labelKey: 'growthPremium' },
  { key: 'owner_concentration', labelKey: 'ownerConcentration' },
]

const MULTIPLE_TYPE_ROWS: Array<{
  key: MultipleTypeKey
  labelKey: string
  defaultWeight: number
}> = [
  { key: 'ev_ebitda', labelKey: 'evEbitdaBlend', defaultWeight: 60 },
  { key: 'ev_revenue', labelKey: 'evRevenueBlend', defaultWeight: 30 },
  { key: 'pe', labelKey: 'peBlend', defaultWeight: 10 },
]

function clampDiscountWeight(value: unknown): number {
  const numeric = toFiniteNumber(value)
  if (numeric == null) return 1
  return Math.min(2, Math.max(0, Math.round(numeric * 100) / 100))
}

function clampDiscountFloorFactor(value: unknown): number {
  const numeric = toFiniteNumber(value)
  if (numeric == null) return 0.45
  return Math.min(1, Math.max(0, Math.round(numeric * 100) / 100))
}

function normalizeMultipleTypeWeight(value: unknown, fallback: number): number {
  const numeric = toFiniteNumber(value)
  if (numeric == null) return fallback
  const percent = Math.abs(numeric) <= 1.5 ? numeric * 100 : numeric
  return Math.min(100, Math.max(0, Math.round(percent)))
}

function normalizeMultipleTypeWeights(
  weights: Record<string, number> | undefined
): Record<MultipleTypeKey, number> {
  const hasAdvisorWeights = !!weights && Object.keys(weights).length > 0
  const raw: Record<MultipleTypeKey, number> = {
    ev_ebitda: normalizeMultipleTypeWeight(weights?.ev_ebitda, hasAdvisorWeights ? 0 : 60),
    ev_revenue: normalizeMultipleTypeWeight(weights?.ev_revenue, hasAdvisorWeights ? 0 : 30),
    pe: normalizeMultipleTypeWeight(weights?.pe, hasAdvisorWeights ? 0 : 10),
  }
  const total = raw.ev_ebitda + raw.ev_revenue + raw.pe
  if (total === 100) return raw
  if (total <= 0) return { ev_ebitda: 60, ev_revenue: 30, pe: 10 }

  const evEbitda = Math.round((raw.ev_ebitda / total) * 100)
  const evRevenue = Math.round((raw.ev_revenue / total) * 100)
  return {
    ev_ebitda: evEbitda,
    ev_revenue: evRevenue,
    pe: Math.max(0, 100 - evEbitda - evRevenue),
  }
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
  effectiveMultipleOverride,
  effectiveMultipleOverrideNote,
  multipleTypeWeights,
  riskAnalysisEnabled,
  advisorDiscountWeights,
  discountFloorFactor,
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
  const showPrefilledHint = (advisorDefaultsAppliedFields?.length ?? 0) > 0
  const mercuryAppOrigin = useMemo(() => resolveMercuryAppOrigin(), [])
  const prefilledSettingsHref = mercuryAppOrigin
    ? `${mercuryAppOrigin}/${locale}/advisor/settings?tab=valuation`
    : null

  const years = useMemo(() => sortedDistinctYears(historicalYears).slice(-5), [historicalYears])
  const yearKeys = useMemo(() => years.map(String), [years])
  const mode = historicalEbitdaWeightingMode ?? 'standard'
  const canWeight = years.length >= 3
  const multipleBlendWeights = useMemo(
    () => normalizeMultipleTypeWeights(multipleTypeWeights),
    [multipleTypeWeights]
  )
  const riskEnabled = riskAnalysisEnabled ?? true
  const floorFactor = clampDiscountFloorFactor(discountFloorFactor)
  const discountWeights = useMemo(() => {
    const out: Record<AdvisorDiscountKey, number> = {
      size_discount: 1,
      liquidity_discount: 1,
      country_adjustment: 1,
      growth_premium: 1,
      owner_concentration: 1,
    }
    for (const row of ADVISOR_DISCOUNT_ROWS) {
      out[row.key] = clampDiscountWeight(advisorDiscountWeights?.[row.key])
    }
    return out
  }, [advisorDiscountWeights])
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
  const requiresEffectiveOverrideNote = effectiveMultipleOverride != null
  const effectiveOverrideNoteComplete =
    !requiresEffectiveOverrideNote || Boolean(effectiveMultipleOverrideNote?.trim())
  const complete =
    noteComplete &&
    effectiveOverrideNoteComplete &&
    (mode !== 'weighted' || !canWeight || years.length >= 3)

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

  const updateMultipleTypeWeight = (key: MultipleTypeKey, nextValue: number) => {
    onFieldChange(
      'multiple_type_weights',
      rebalanceMethodWeights(multipleBlendWeights, key, Math.round(nextValue))
    )
  }

  const resetMultipleTypeWeights = () => {
    onFieldChange('multiple_type_weights', undefined)
  }

  const updateDiscountWeight = (key: AdvisorDiscountKey, nextValue: number) => {
    onFieldChange('advisor_discount_weights', {
      ...discountWeights,
      [key]: clampDiscountWeight(nextValue),
    })
  }

  const resetDiscountControls = () => {
    onFieldChange('advisor_discount_weights', undefined)
    onFieldChange('discount_floor_factor', undefined)
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

        <div className="space-y-3 rounded-lg border border-foreground/10 bg-background/40 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">
                {t('multipleTypeBlendTitle')}
              </div>
              <p className="text-xs text-foreground/55">{t('multipleTypeBlendSubtitle')}</p>
            </div>
            <AuroraButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetMultipleTypeWeights}
              disabled={disabled}
              className="gap-1.5 text-xs sm:self-start"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t('resetMultipleBlend')}
            </AuroraButton>
          </div>

          <div className="space-y-3">
            {MULTIPLE_TYPE_ROWS.map((row) => {
              const value = multipleBlendWeights[row.key]
              const isModelDefault = value === row.defaultWeight
              return (
                <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_3.5rem] gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-foreground/75">
                        {t(row.labelKey)}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-foreground/60">
                        {value}%
                      </span>
                    </div>
                    <Slider
                      value={value}
                      min={0}
                      max={100}
                      step={1}
                      onChange={(next) => updateMultipleTypeWeight(row.key, next)}
                      disabled={disabled}
                      showTooltip
                      formatValue={(v) => `${Math.round(v)}%`}
                      aria-label={`${t(row.labelKey)} ${t('multipleTypeWeight')}`}
                    />
                  </div>
                  <div className="flex items-end justify-end pb-[0.8125rem]">
                    <span className="rounded-md border border-foreground/10 bg-foreground/[0.03] px-2 py-1 text-[10px] font-medium text-foreground/55">
                      {isModelDefault ? t('discountModelDefault') : t('discountAdvisorWeight')}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-foreground/10 bg-background/40 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <Switch
              checked={riskEnabled}
              onChange={(checked) => onFieldChange('risk_analysis_enabled', checked)}
              label={t('riskAnalysisToggle')}
              description={t('riskAnalysisToggleDescription')}
              size="sm"
              disabled={disabled}
            />
            <AuroraButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetDiscountControls}
              disabled={disabled}
              className="gap-1.5 text-xs sm:self-start"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t('resetRiskWeights')}
            </AuroraButton>
          </div>

          {!riskEnabled && (
            <AuroraFormAlert type="info" icon={<Info className="h-3.5 w-3.5" aria-hidden />}>
              {t('preAdjustmentReference')}
            </AuroraFormAlert>
          )}

          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">{t('discountWeightingTitle')}</div>
            <p className="text-xs text-foreground/55">{t('discountWeightingSubtitle')}</p>
          </div>

          <div className="space-y-3">
            {ADVISOR_DISCOUNT_ROWS.map((row) => {
              const value = discountWeights[row.key]
              return (
                <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_3.5rem] gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-foreground/75">
                        {t(row.labelKey)}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-foreground/60">
                        {value.toFixed(2)}x
                      </span>
                    </div>
                    <Slider
                      value={value}
                      min={0}
                      max={2}
                      step={0.05}
                      onChange={(next) => updateDiscountWeight(row.key, next)}
                      disabled={disabled || !riskEnabled}
                      showTooltip
                      formatValue={(v) => `${v.toFixed(2)}x`}
                      aria-label={`${t(row.labelKey)} ${t('advisorWeight')}`}
                    />
                  </div>
                  <div className="flex items-end justify-end pb-[0.8125rem]">
                    <span className="rounded-md border border-foreground/10 bg-foreground/[0.03] px-2 py-1 text-[10px] font-medium text-foreground/55">
                      {value === 1 ? t('discountModelDefault') : t('discountAdvisorWeight')}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="space-y-1.5 border-t border-foreground/10 pt-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-foreground/75">{t('discountFloor')}</span>
              <span className="font-mono text-xs tabular-nums text-foreground/60">
                {Math.round(floorFactor * 100)}%
              </span>
            </div>
            <Slider
              value={floorFactor}
              min={0}
              max={1}
              step={0.05}
              onChange={(next) => {
                onFieldChange('discount_floor_factor', clampDiscountFloorFactor(next))
              }}
              disabled={disabled || !riskEnabled}
              showTooltip
              formatValue={(v) => `${Math.round(v * 100)}%`}
              aria-label={t('discountFloorAriaLabel')}
            />
          </div>
        </div>

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

        <div className="space-y-3" data-testid="effective-multiple-override-block">
          <AuroraInput
            id="effective-multiple-override"
            name="effective_multiple_override"
            type="number"
            min="0.1"
            max="50"
            step="0.1"
            label={t('effectiveMultipleOverride')}
            size="sm"
            value={effectiveMultipleOverride ?? ''}
            onChange={(event) => {
              const value = toFiniteNumber(event.target.value)
              onFieldChange('effective_multiple_override', value ?? undefined)
            }}
            disabled={disabled}
          />

          {requiresEffectiveOverrideNote && (
            <AuroraTextarea
              id="effective-multiple-override-note"
              name="effective_multiple_override_note"
              label={t('effectiveMultipleOverrideNote')}
              value={effectiveMultipleOverrideNote ?? ''}
              onChange={(event) =>
                onFieldChange('effective_multiple_override_note', event.target.value)
              }
              size="sm"
              rows={3}
              required
              touched={requiresEffectiveOverrideNote}
              error={
                !effectiveOverrideNoteComplete
                  ? t('effectiveMultipleOverrideNoteRequired')
                  : undefined
              }
              disabled={disabled}
            />
          )}
        </div>

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
