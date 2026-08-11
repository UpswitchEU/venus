'use client'

import { Sparkles } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { AuroraFormAlert } from '@/design-system/components/FormSection'
import { AuroraInput, AuroraTextarea } from '@/design-system/components/Input'
import { Switch } from '@/design-system/components/Switch'
import type { BusinessTypeSegmentInput } from '../../../types/valuation/request'
import { resolveMercuryAppOrigin } from '../../../utils/getMercuryAppOrigin'
import {
  AdvancedAdvisorLivePreviewCard,
  AdvisorMultipleTypeBlendPanel,
  AdvisorRiskControlsPanel,
} from './AdvancedAdvisorControlsSectionParts'
import {
  type AdvisorDefaultAppliedField,
  type AdvisorDiscountKey,
  buildAdvisorDiscountWeightUpdate,
  buildMultipleTypeWeightUpdate,
  buildResetDiscountControlUpdates,
  clampDiscountFloorFactor,
  deriveAdvancedAdvisorControlModel,
  type MultipleTypeKey,
  toFiniteNumber,
  type WeightingMode,
} from './advancedAdvisorControlsModel'
import { HistoricalYearWeightingSection } from './HistoricalYearWeightingSection'
import { ValuationSectionHeader } from './ValuationSectionHeader'

export interface AdvancedAdvisorControlsSectionProps {
  step: string | number
  sectorAverageMultiple?: number | null
  multipleCalibrationAdjustment?: number
  multipleCalibrationNote?: string
  effectiveMultipleOverride?: number
  effectiveMultipleOverrideNote?: string
  /**
   * Multi-segment (SOTP) inputs. When two or more segments carry a multiple,
   * the live preview blends them into a segment-weighted effective multiple so
   * that changing a per-segment weight produces an immediate before→after
   * (BET-527). Read-only — purely a derivation off the form SSOT.
   */
  businessTypeSegments?: BusinessTypeSegmentInput[]
  multipleTypeWeights?: Record<string, number>
  riskAnalysisEnabled?: boolean
  advisorDiscountWeights?: Record<string, number>
  discountFloorFactor?: number
  previewEbitda?: number | null
  previewCurrencyFormatter?: Intl.NumberFormat
  historicalYears: number[]
  historicalEbitdaWeightingMode?: WeightingMode
  historicalEbitdaWeights?: Record<number, number>
  showEnterpriseToEquityBridge?: boolean
  allowUntrustedMultiplesFallback?: boolean
  untrustedMultiplesFallbackReason?: string
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

export function AdvancedAdvisorControlsSection({
  step,
  sectorAverageMultiple,
  multipleCalibrationAdjustment,
  multipleCalibrationNote,
  effectiveMultipleOverride,
  effectiveMultipleOverrideNote,
  businessTypeSegments,
  multipleTypeWeights,
  riskAnalysisEnabled,
  advisorDiscountWeights,
  discountFloorFactor,
  previewEbitda,
  previewCurrencyFormatter,
  historicalYears,
  historicalEbitdaWeightingMode,
  historicalEbitdaWeights,
  showEnterpriseToEquityBridge,
  allowUntrustedMultiplesFallback,
  untrustedMultiplesFallbackReason,
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

  const advisorControlModel = useMemo(
    () =>
      deriveAdvancedAdvisorControlModel({
        advisorDiscountWeights,
        businessTypeSegments,
        discountFloorFactor,
        effectiveMultipleOverride,
        effectiveMultipleOverrideNote,
        historicalEbitdaWeights,
        historicalEbitdaWeightingMode,
        historicalYears,
        multipleCalibrationAdjustment,
        multipleCalibrationNote,
        multipleTypeWeights,
        previewEbitda,
        riskAnalysisEnabled,
        sectorAverageMultiple,
      }),
    [
      advisorDiscountWeights,
      businessTypeSegments,
      discountFloorFactor,
      effectiveMultipleOverride,
      effectiveMultipleOverrideNote,
      historicalEbitdaWeights,
      historicalEbitdaWeightingMode,
      historicalYears,
      multipleCalibrationAdjustment,
      multipleCalibrationNote,
      multipleTypeWeights,
      previewEbitda,
      riskAnalysisEnabled,
      sectorAverageMultiple,
    ]
  )
  const {
    activePreviewChangeKeys,
    adjustment,
    calibratedMultiple,
    complete,
    discountWeights,
    floorFactor,
    livePreview,
    multipleBlendWeights,
    noteComplete,
    previewEbitdaBasis,
    requiresCalibrationNote,
    requiresEffectiveOverrideNote,
    effectiveOverrideNoteComplete,
    riskEnabled,
  } = advisorControlModel
  const previewCurrency = previewCurrencyFormatter?.resolvedOptions().currency ?? 'EUR'
  const fallbackCurrencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale === 'fr' ? 'fr-BE' : locale === 'nl' ? 'nl-BE' : 'en-BE', {
        style: 'currency',
        currency: previewCurrency,
        maximumFractionDigits: 0,
      }),
    [locale, previewCurrency]
  )
  const currencyFormatter = previewCurrencyFormatter ?? fallbackCurrencyFormatter
  const signedPercentFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale === 'fr' ? 'fr-BE' : locale === 'nl' ? 'nl-BE' : 'en-BE', {
        maximumFractionDigits: 1,
        signDisplay: 'always',
      }),
    [locale]
  )

  const updateMultipleTypeWeight = (key: MultipleTypeKey, nextValue: number) => {
    onFieldChange(
      'multiple_type_weights',
      buildMultipleTypeWeightUpdate({ multipleBlendWeights, key, nextValue })
    )
  }

  const resetMultipleTypeWeights = () => {
    onFieldChange('multiple_type_weights', undefined)
  }

  const updateDiscountWeight = (key: AdvisorDiscountKey, nextValue: number) => {
    onFieldChange(
      'advisor_discount_weights',
      buildAdvisorDiscountWeightUpdate({ discountWeights, key, nextValue })
    )
  }

  const resetDiscountControls = () => {
    for (const update of buildResetDiscountControlUpdates()) {
      onFieldChange(update.field, update.value)
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
        <div className="space-y-3" data-testid="advisor-untrusted-fallback-control">
          <Switch
            checked={allowUntrustedMultiplesFallback ?? false}
            onChange={(checked) => {
              onFieldChange('allow_untrusted_multiples_fallback', checked)
              if (!checked) onFieldChange('untrusted_multiples_fallback_reason', undefined)
            }}
            label={t('fallbackToggle')}
            disabled={disabled}
          />
          {allowUntrustedMultiplesFallback && (
            <>
              <AuroraFormAlert type="warning">{t('fallbackWarning')}</AuroraFormAlert>
              <AuroraTextarea
                id="untrusted-multiples-fallback-reason"
                name="untrusted_multiples_fallback_reason"
                label={t('fallbackReason')}
                value={untrustedMultiplesFallbackReason ?? ''}
                onChange={(event) =>
                  onFieldChange('untrusted_multiples_fallback_reason', event.target.value)
                }
                size="sm"
                rows={3}
                required
                touched
                error={
                  untrustedMultiplesFallbackReason?.trim()
                    ? undefined
                    : t('fallbackReasonRequired')
                }
                disabled={disabled}
              />
            </>
          )}
        </div>

        <Switch
          checked={showEnterpriseToEquityBridge ?? true}
          onChange={(checked) => onFieldChange('show_enterprise_to_equity_bridge', checked)}
          label={t('waterfallToggle')}
          disabled={disabled}
        />

        {livePreview && (
          <AdvancedAdvisorLivePreviewCard
            activePreviewChangeKeys={activePreviewChangeKeys}
            currencyFormatter={currencyFormatter}
            livePreview={livePreview}
            previewEbitdaBasis={previewEbitdaBasis}
            signedPercentFormatter={signedPercentFormatter}
            t={t}
          />
        )}

        <AdvisorMultipleTypeBlendPanel
          disabled={disabled}
          multipleBlendWeights={multipleBlendWeights}
          onReset={resetMultipleTypeWeights}
          onUpdateWeight={updateMultipleTypeWeight}
          t={t}
        />

        <AdvisorRiskControlsPanel
          disabled={disabled}
          discountWeights={discountWeights}
          floorFactor={floorFactor}
          onReset={resetDiscountControls}
          onRiskEnabledChange={(checked) => onFieldChange('risk_analysis_enabled', checked)}
          onUpdateDiscountWeight={updateDiscountWeight}
          onUpdateFloorFactor={(next) => {
            onFieldChange('discount_floor_factor', clampDiscountFloorFactor(next))
          }}
          riskEnabled={riskEnabled}
          t={t}
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

        <HistoricalYearWeightingSection
          historicalYears={historicalYears}
          historicalEbitdaWeightingMode={historicalEbitdaWeightingMode}
          historicalEbitdaWeights={historicalEbitdaWeights}
          onFieldChange={onFieldChange}
          disabled={disabled}
          variant="modal"
        />
      </div>
    </Wrapper>
  )
}
