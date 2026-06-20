'use client'

/**
 * Liquidation-specific advisor inputs — left-panel section.
 *
 * Renders only when `liquidation_analysis` is the pre-selected method.
 * Drives the Phase 2-5 chain (insolvency cascade, tax bridge, wind-down
 * build-up, replacement cost, premise reconciliation, sufficiency memo,
 * creditor letters, strategic buyer scenarios). Engine defaults fire
 * when fields are blank — the report flags every estimated bucket.
 *
 * Aurora Clarity rebuild 2026-05-12:
 * - Outer chrome matches `NavRealEstateAppraisalSection` (rounded-xl
 *   neutral card + description band on top + grouped panels separated
 *   by `border-foreground/[0.06]`). The previous heavy `primary/0.03`
 *   tint diverged from every other left-panel section.
 * - Every numeric input now uses the design-system primitives
 *   (`CurrencyInput`, `IntegerInput`, `AuroraInput`) — they ship with
 *   proper `<label htmlFor>` association, so clicking *any* label
 *   focuses its input. The previous bespoke `FieldRow` shipped raw
 *   `<label>` elements without `htmlFor`, so labels were decorative.
 * - "Prefilled" provenance moves from a bare dot to the shared
 *   `PrefilledBadge` so it reads the same as NAV equipment / accountant
 *   prefill across the panel.
 * - Auto-prefill behaviour (headcount, rent, paid-up capital, DTL),
 *   advanced toggle, liability buckets, asset overrides, and reset
 *   are all preserved — UX surface is identical, only the shell changes.
 *
 * Field-to-engine mapping (set in `buildValuationRequest`):
 *   Essentials:
 *     - liq_headcount         → liquidation_inputs.headcount
 *     - liq_monthly_rent      → liquidation_inputs.monthly_rent
 *     - liq_paid_up_capital   → liquidation_inputs.paid_up_capital
 *     - liq_deferred_tax      → liquidation_inputs.deferred_tax_liabilities
 *   Premise + advanced:
 *     - liq_premise_override        → owner_premise_override
 *     - liq_taxable_reserves        → taxable_reserves
 *     - liq_runway_months_orderly   → runway_months_orderly
 *     - liq_runway_months_forced    → runway_months_forced
 *     - liq_distress_wacc_orderly   → distress_wacc_orderly
 *     - liq_distress_wacc_forced    → distress_wacc_forced
 *     - liq_intangibles_uplift_pct  → intangibles_uplift_pct
 *     - liq_multiples_value_override → multiples_value_override
 *
 * Sources: IVS 104 §60–80, IVS 105 §60–90, USPAP STANDARD 9, AICPA
 * SSVS No. 1 §47-58, McKinsey Ch. 18, Damodaran Ch. 24.
 */

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'

import { cn } from '@/design-system/utils'
import {
  LIQUIDATION_ASSET_CLASS_CODES,
  LIQUIDATION_ASSET_CLASSES,
  LIQUIDATION_ESSENTIAL_FIELDS,
  LIQUIDATION_LIABILITY_BUCKET_CODES,
  LIQUIDATION_LIABILITY_BUCKET_TIERS,
  LIQUIDATION_PREMISE_OPTIONS,
  LIQUIDATION_RESET_NUMERIC_FIELD_KEYS,
  type LiquidationAssetClassCode,
  type LiquidationLiabilityBucketCode,
} from '@/lib/methods/liquidation_analysis/liquidationInputConfig'
import { countPositiveLiquidationValues } from '@/lib/methods/liquidation_analysis/liquidationInputModel'
import { CurrencyInput } from '../CurrencyInput'
import { IntegerInput } from './IntegerInput'
import {
  LIQUIDATION_PANEL_GROUP,
  LiquidationCollapsibleToggle,
  LiquidationPanelEyebrow,
  LiquidationPercentInput,
} from './LiquidationInputsSectionControls'
import { PrefilledBadge } from './PrefilledBadge'
import { useLiquidationAutoPrefill } from './useLiquidationAutoPrefill'
import { ValuationSectionHeader } from './ValuationSectionHeader'

export interface LiquidationInputsSectionProps {
  step: string | number
  liqHeadcount?: number
  liqMonthlyRent?: number
  liqPaidUpCapital?: number
  liqDeferredTax?: number
  liqPremiseOverride?: string
  // Tax-bridge advanced inputs (collapsed alongside the rest).
  liqRealisedCapitalGains?: number
  // Advanced fields (collapsed by default).
  liqTaxableReserves?: number
  liqRunwayMonthsOrderly?: number
  liqRunwayMonthsForced?: number
  liqDistressWaccOrderly?: number
  liqDistressWaccForced?: number
  liqIntangiblesUpliftPct?: number
  liqMultiplesValueOverride?: number
  // Per-tier liability buckets — supplied so the priority cascade
  // page renders the actual debt structure instead of the engine's
  // jurisdiction-default estimate (audit P0 #8).
  liqLiabilityBuckets?: Partial<Record<LiquidationLiabilityBucketCode, number>>
  // Per-asset-class adjusted-FMV overrides — turn the realisation
  // schedule from a book-value rollforward into an appraiser-grade
  // working paper (audit P0 #9).  Engine falls back to balance-sheet
  // values for any class without an override.
  liqAssetOverrides?: Partial<Record<LiquidationAssetClassCode, number>>
  // Prefill sources (read-only signals from base inputs).  Each is a
  // dominant-source value that the field auto-populates from on first
  // mount; the user's manual edit wins forever after.
  prefillSourceHeadcount?: number
  /** Annual rent expense from `current_year_data.rent_expense`
   * (Hermes mapper populates this from MAR 61x / RGS huurkosten). */
  prefillSourceAnnualRent?: number
  /** Paid-up capital from balance-sheet equity composition.  Falls
   * back to `current_year_data.total_equity` when no dedicated
   * `paid_up_capital` line is mapped (Hermes BE NBB filings expose
   * "Geplaatst kapitaal" line item; NL KVK filings expose
   * "Geplaatst en gestort kapitaal"). */
  prefillSourcePaidUpCapital?: number
  /** Deferred tax liabilities from balance-sheet long-term liabilities
   * (Hermes maps NBB code 168 / RGS BlnSch.LtgVoz to this field). */
  prefillSourceDeferredTax?: number
  onFieldChange: (field: string, value: number | undefined) => void
  onAnyFieldChange?: (field: string, value: unknown) => void
  disabled?: boolean
}

export function LiquidationInputsSection({
  step,
  liqHeadcount,
  liqMonthlyRent,
  liqPaidUpCapital,
  liqDeferredTax,
  liqPremiseOverride,
  liqRealisedCapitalGains,
  liqTaxableReserves,
  liqRunwayMonthsOrderly,
  liqRunwayMonthsForced,
  liqDistressWaccOrderly,
  liqDistressWaccForced,
  liqIntangiblesUpliftPct,
  liqMultiplesValueOverride,
  liqLiabilityBuckets,
  liqAssetOverrides,
  prefillSourceHeadcount,
  prefillSourceAnnualRent,
  prefillSourcePaidUpCapital,
  prefillSourceDeferredTax,
  onFieldChange,
  onAnyFieldChange,
  disabled,
}: LiquidationInputsSectionProps) {
  const t = useTranslations('manualInput.liquidationInputs')
  const tPrefill = useTranslations('manualInput.methodSelector.prefill')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showLiabilityBuckets, setShowLiabilityBuckets] = useState(false)
  const [showAssetOverrides, setShowAssetOverrides] = useState(false)
  // Count of non-zero buckets — surfaces in the toggle so the advisor
  // can see at-a-glance whether the cascade is running on real data
  // or jurisdiction defaults.
  const liabilityBucketsFilled = countPositiveLiquidationValues(
    liqLiabilityBuckets,
    LIQUIDATION_LIABILITY_BUCKET_CODES
  )
  const assetOverridesFilled = countPositiveLiquidationValues(
    liqAssetOverrides,
    LIQUIDATION_ASSET_CLASS_CODES
  )
  const { prefilledFields, markFieldEdited, clearPrefillFlags } = useLiquidationAutoPrefill({
    liqHeadcount,
    liqMonthlyRent,
    liqPaidUpCapital,
    liqDeferredTax,
    prefillSourceHeadcount,
    prefillSourceAnnualRent,
    prefillSourcePaidUpCapital,
    prefillSourceDeferredTax,
    onFieldChange,
  })
  // Disclosure-panel ids — needed so each toggle's `aria-controls`
  // points to the panel it expands. `useId()` gives us a stable prefix
  // that survives re-renders; suffixes keep the three panels distinct
  // without paying for three separate hook calls.
  const disclosureIdBase = useId()
  const advancedPanelId = `${disclosureIdBase}-advanced`
  const liabilityBucketsPanelId = `${disclosureIdBase}-liability-buckets`
  const assetOverridesPanelId = `${disclosureIdBase}-asset-overrides`

  const essentialsFilled = [liqHeadcount, liqMonthlyRent, liqPaidUpCapital, liqDeferredTax].filter(
    (v) => v !== undefined
  ).length
  const sectionComplete = essentialsFilled === LIQUIDATION_ESSENTIAL_FIELDS.length

  const handleReset = () => {
    for (const field of LIQUIDATION_RESET_NUMERIC_FIELD_KEYS) {
      onFieldChange(field, undefined)
    }
    if (onAnyFieldChange) {
      onAnyFieldChange('liq_premise_override', undefined)
    }
    clearPrefillFlags()
  }

  const prefillBadge = <PrefilledBadge label={tPrefill('badge')} />

  return (
    <motion.section
      key="liquidation_inputs"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="mt-6 space-y-4 pt-2"
      data-testid="liquidation-inputs-section"
      aria-label={t('title')}
    >
      <ValuationSectionHeader
        step={step}
        complete={sectionComplete}
        title={t('title')}
        subtitle={t('subtitle')}
      />

      <div className="rounded-xl border border-foreground/[0.08] bg-background">
        {/* Description / progress band — replaces the previous standalone
            chip so the chrome matches `NavRealEstateAppraisalSection` and
            its siblings. */}
        <div
          className="flex items-start justify-between gap-3 border-b border-foreground/[0.06] px-4 py-3"
          data-testid="liq-essentials-progress"
        >
          <p className="text-[11px] leading-snug text-foreground/55">
            {t('essentialsProgress', {
              filled: essentialsFilled,
              total: LIQUIDATION_ESSENTIAL_FIELDS.length,
            })}
          </p>
          <span
            className={cn(
              'mt-0.5 inline-flex h-1.5 w-1.5 shrink-0 rounded-full',
              sectionComplete ? 'bg-emerald-500' : 'bg-primary/60'
            )}
            aria-hidden="true"
          />
        </div>

        {/* Wind-down panel — bottom-up cost inputs. */}
        <div className={LIQUIDATION_PANEL_GROUP}>
          <LiquidationPanelEyebrow>{t('windDownTitle')}</LiquidationPanelEyebrow>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <IntegerInput
              label={t('headcountLabel')}
              description={t('headcountHint')}
              value={liqHeadcount}
              onChange={(next) => {
                onFieldChange('liq_headcount', next)
                markFieldEdited('liq_headcount')
              }}
              min={0}
              max={10_000}
              placeholder={t('headcountPlaceholder')}
              disabled={disabled}
              trailingLabelAccessory={
                prefilledFields.liq_headcount && liqHeadcount !== undefined
                  ? prefillBadge
                  : undefined
              }
            />
            <CurrencyInput
              id="liq_monthly_rent"
              name="liq_monthly_rent"
              label={t('monthlyRentLabel')}
              description={t('monthlyRentHint')}
              value={liqMonthlyRent}
              onChange={(next) => {
                onFieldChange('liq_monthly_rent', next)
                markFieldEdited('liq_monthly_rent')
              }}
              disabled={disabled}
              truncateLabel={false}
              trailingLabelAccessory={
                prefilledFields.liq_monthly_rent && liqMonthlyRent !== undefined
                  ? prefillBadge
                  : undefined
              }
            />
          </div>
        </div>

        {/* Tax bridge panel. */}
        <div className={LIQUIDATION_PANEL_GROUP}>
          <LiquidationPanelEyebrow>{t('taxBridgeTitle')}</LiquidationPanelEyebrow>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CurrencyInput
              id="liq_paid_up_capital"
              name="liq_paid_up_capital"
              label={t('paidUpCapitalLabel')}
              description={t('paidUpCapitalHint')}
              value={liqPaidUpCapital}
              onChange={(next) => {
                onFieldChange('liq_paid_up_capital', next)
                markFieldEdited('liq_paid_up_capital')
              }}
              disabled={disabled}
              truncateLabel={false}
              trailingLabelAccessory={
                prefilledFields.liq_paid_up_capital && liqPaidUpCapital !== undefined
                  ? prefillBadge
                  : undefined
              }
            />
            <CurrencyInput
              id="liq_deferred_tax"
              name="liq_deferred_tax"
              label={t('deferredTaxLabel')}
              description={t('deferredTaxHint')}
              value={liqDeferredTax}
              onChange={(next) => {
                onFieldChange('liq_deferred_tax', next)
                markFieldEdited('liq_deferred_tax')
              }}
              disabled={disabled}
              truncateLabel={false}
              trailingLabelAccessory={
                prefilledFields.liq_deferred_tax && liqDeferredTax !== undefined
                  ? prefillBadge
                  : undefined
              }
            />
            {/* Realised capital gains — drives the meerwaarde leg of
                the BE tax bridge (Art. 47 WIB at 16.5%) and the Vpb-14a
                leg of the NL tax bridge (25.8%).  Without it the engine
                defaults the gains tax to 0 — fine for a holding company,
                wrong for a manufacturer with depreciated machinery. */}
            <div className="sm:col-span-2">
              <CurrencyInput
                id="liq_realised_capital_gains"
                name="liq_realised_capital_gains"
                label={t('realisedCapitalGainsLabel')}
                description={t('realisedCapitalGainsHint')}
                value={liqRealisedCapitalGains}
                onChange={(next) => onFieldChange('liq_realised_capital_gains', next)}
                disabled={disabled}
                truncateLabel={false}
              />
            </div>
          </div>
        </div>

        {/* Premise override. */}
        <div className={LIQUIDATION_PANEL_GROUP}>
          <LiquidationPanelEyebrow>{t('premiseTitle')}</LiquidationPanelEyebrow>
          <div className="space-y-1.5">
            <label
              htmlFor="liq_premise_override"
              className="block text-[12px] font-medium leading-snug text-foreground/70"
            >
              {t('premiseLabel')}
            </label>
            <select
              id="liq_premise_override"
              name="liq_premise_override"
              value={liqPremiseOverride ?? ''}
              disabled={disabled}
              onChange={(e) => {
                const raw = e.target.value
                if (onAnyFieldChange) {
                  onAnyFieldChange('liq_premise_override', raw === '' ? undefined : raw)
                }
              }}
              className={cn(
                'h-11 w-full rounded-xl border border-foreground/[0.10] bg-foreground/[0.04] px-3 text-sm shadow-sm',
                'transition-colors hover:border-foreground/[0.20]',
                'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20'
              )}
              data-testid="liq-premise-override-select"
            >
              {LIQUIDATION_PREMISE_OPTIONS.map((opt) => (
                <option key={opt.value || 'auto'} value={opt.value}>
                  {t(`premiseOption.${opt.i18nKey}`)}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-foreground/45">{t('premiseHint')}</p>
          </div>
        </div>

        {/* Advanced toggle — collapses power-user inputs. */}
        <LiquidationCollapsibleToggle
          open={showAdvanced}
          onToggle={() => setShowAdvanced((prev) => !prev)}
          title={t('advancedToggle')}
          panelId={advancedPanelId}
          testId="liq-advanced-toggle"
        />
        {showAdvanced ? (
          <motion.div
            id={advancedPanelId}
            role="region"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.15 }}
            className={LIQUIDATION_PANEL_GROUP}
            data-testid="liq-advanced-section"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <CurrencyInput
                id="liq_taxable_reserves"
                name="liq_taxable_reserves"
                label={t('taxableReservesLabel')}
                description={t('taxableReservesHint')}
                value={liqTaxableReserves}
                onChange={(next) => onFieldChange('liq_taxable_reserves', next)}
                disabled={disabled}
                truncateLabel={false}
              />
              <IntegerInput
                label={t('runwayMonthsLabel')}
                description={t('runwayMonthsHint')}
                value={liqRunwayMonthsOrderly}
                onChange={(next) => onFieldChange('liq_runway_months_orderly', next)}
                min={1}
                max={24}
                placeholder={t('runwayMonthsPlaceholder')}
                disabled={disabled}
              />
              <IntegerInput
                label={t('runwayMonthsForcedLabel')}
                description={t('runwayMonthsForcedHint')}
                value={liqRunwayMonthsForced}
                onChange={(next) => onFieldChange('liq_runway_months_forced', next)}
                min={1}
                max={12}
                placeholder={t('runwayMonthsForcedPlaceholder')}
                disabled={disabled}
              />
              <LiquidationPercentInput
                name="liq_distress_wacc_orderly"
                label={t('distressWaccLabel')}
                description={t('distressWaccHint')}
                placeholder={t('distressWaccPlaceholder')}
                value={liqDistressWaccOrderly}
                onChange={(next) => onFieldChange('liq_distress_wacc_orderly', next)}
                disabled={disabled}
                testId="liq-distress-wacc-input"
              />
              <LiquidationPercentInput
                name="liq_distress_wacc_forced"
                label={t('distressWaccForcedLabel')}
                description={t('distressWaccForcedHint')}
                placeholder={t('distressWaccForcedPlaceholder')}
                value={liqDistressWaccForced}
                onChange={(next) => onFieldChange('liq_distress_wacc_forced', next)}
                disabled={disabled}
                testId="liq-distress-wacc-forced-input"
              />
              <LiquidationPercentInput
                name="liq_intangibles_uplift_pct"
                label={t('intangiblesUpliftLabel')}
                description={t('intangiblesUpliftHint')}
                placeholder={t('intangiblesUpliftPlaceholder')}
                value={liqIntangiblesUpliftPct}
                onChange={(next) => onFieldChange('liq_intangibles_uplift_pct', next)}
                disabled={disabled}
                testId="liq-intangibles-uplift-input"
              />
              <div className="sm:col-span-2">
                <CurrencyInput
                  id="liq_multiples_value_override"
                  name="liq_multiples_value_override"
                  label={t('multiplesValueLabel')}
                  description={t('multiplesValueHint')}
                  value={liqMultiplesValueOverride}
                  onChange={(next) => onFieldChange('liq_multiples_value_override', next)}
                  disabled={disabled}
                  truncateLabel={false}
                />
              </div>
            </div>
          </motion.div>
        ) : null}

        {/* Per-tier liability buckets — supplying these kills the
            engine's "estimated from jurisdiction defaults" warning that
            fires on every cascade page.  Defaults match the BE Boek XX /
            NL Faillissementswet tier order.  Hidden behind a separate
            toggle (not the generic "Show advanced") because the chip
            shows progress: "0 of 7 tiers" → "7 of 7 tiers" — the advisor
            knows exactly how much of the cascade is real. */}
        <LiquidationCollapsibleToggle
          open={showLiabilityBuckets}
          onToggle={() => setShowLiabilityBuckets((prev) => !prev)}
          title={t('liabilityBucketsTitle')}
          subtitle={t('liabilityBucketsProgress', {
            filled: liabilityBucketsFilled,
            total: LIQUIDATION_LIABILITY_BUCKET_TIERS.length,
          })}
          panelId={liabilityBucketsPanelId}
          testId="liq-liability-buckets-toggle"
        />
        {showLiabilityBuckets ? (
          <motion.div
            id={liabilityBucketsPanelId}
            role="region"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.15 }}
            className={LIQUIDATION_PANEL_GROUP}
            data-testid="liq-liability-buckets-section"
          >
            <p className="text-[11px] leading-snug text-foreground/55">
              {t('liabilityBucketsSubtitle')}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {LIQUIDATION_LIABILITY_BUCKET_TIERS.map((tier) => {
                const formKey = `liq_lb_${tier.code}` as const
                const current = liqLiabilityBuckets?.[tier.code]
                return (
                  <CurrencyInput
                    key={tier.code}
                    id={formKey}
                    name={formKey}
                    label={t(`liabilityBucketLabel.${tier.i18nKey}`)}
                    description={t(`liabilityBucketHint.${tier.i18nKey}`)}
                    value={current}
                    onChange={(next) => onFieldChange(formKey, next)}
                    disabled={disabled}
                    truncateLabel={false}
                  />
                )
              })}
            </div>
          </motion.div>
        ) : null}

        {/* Per-asset-class adjusted-FMV overrides — turns the
            realisation schedule from a book-value rollforward into an
            appraiser-grade working paper (audit P0 #9).  Hidden behind a
            separate toggle from the liability buckets; the progress hint
            tells the advisor how many classes carry appraiser values.
            Engine falls back to balance-sheet derivation for blanks. */}
        <LiquidationCollapsibleToggle
          open={showAssetOverrides}
          onToggle={() => setShowAssetOverrides((prev) => !prev)}
          title={t('assetOverridesTitle')}
          subtitle={t('assetOverridesProgress', {
            filled: assetOverridesFilled,
            total: LIQUIDATION_ASSET_CLASSES.length,
          })}
          panelId={assetOverridesPanelId}
          testId="liq-asset-overrides-toggle"
        />
        {showAssetOverrides ? (
          <motion.div
            id={assetOverridesPanelId}
            role="region"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.15 }}
            className={LIQUIDATION_PANEL_GROUP}
            data-testid="liq-asset-overrides-section"
          >
            <p className="text-[11px] leading-snug text-foreground/55">
              {t('assetOverridesSubtitle')}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {LIQUIDATION_ASSET_CLASSES.map((cls) => {
                const formKey = `liq_ao_${cls.code}` as const
                const current = liqAssetOverrides?.[cls.code]
                return (
                  <CurrencyInput
                    key={cls.code}
                    id={formKey}
                    name={formKey}
                    label={t(`assetClassLabel.${cls.i18nKey}`)}
                    description={t('assetOverridesHint')}
                    value={current}
                    onChange={(next) => onFieldChange(formKey, next)}
                    disabled={disabled}
                    truncateLabel={false}
                  />
                )
              })}
            </div>
          </motion.div>
        ) : null}
      </div>

      {/* Reset action — data affordance, not narrative. Clears all
          liq_* fields back to undefined so the engine falls through to
          its cohort defaults. */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleReset}
          disabled={disabled}
          className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          data-testid="liq-reset-button"
        >
          {t('resetButton')}
        </button>
      </div>
    </motion.section>
  )
}
