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
 * UX notes (rebuild 2026-05-10):
 * - Headcount auto-prefills from `formData.number_of_employees` on
 *   first mount (the chain doesn't yet run for blank essentials, so
 *   the prefill is what makes the UX a no-brainer for ~80% of cases).
 * - Two-tier disclosure: 4 essentials always visible; 4 advanced
 *   inputs collapsed behind a "Show advanced" toggle. The advanced
 *   block surfaces taxable_reserves, runway_months_orderly,
 *   distress_wacc_orderly, multiples_value_override.
 * - Status chip: "X of 4 essentials filled — engine fills the rest"
 *   so the advisor knows what's auto-defaulted.
 * - Per-field "what this drives" hints + (when prefilled) a "From
 *   company profile" tag so the user knows the source of truth.
 * - Bilingual EN+NL via `manualInput.liquidationInputs.*` keys.
 * - "Reset to engine defaults" at the bottom — clears all liq_*
 *   fields back to undefined.
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
 *     - liq_distress_wacc_orderly   → distress_wacc_orderly
 *     - liq_multiples_value_override → multiples_value_override
 *
 * Sources: IVS 104 §60–80, IVS 105 §60–90, USPAP STANDARD 9, AICPA
 * SSVS No. 1 §47-58, McKinsey Ch. 18, Damodaran Ch. 24.
 */

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useEffect, useState, type ReactNode } from 'react'

import { CurrencyInput } from '../CurrencyInput'
import { ValuationSectionHeader } from './ValuationSectionHeader'

// `going_concern` is intentionally NOT exposed here.  Liquidation
// analysis is in `STANDALONE_METHODS` (different premise of value per
// IVS 104 §80 — orderly/forced wind-down vs. going-concern).  Picking
// "going_concern" inside a liquidation report would either be silently
// ignored by the engine or produce a contradictory narrative.
// Advisors who need the going-concern reference should select the
// Adjusted-NAV method (or any going-concern lens) instead, which is
// already reconciled against liquidation in the
// liquidation_premise_reconciliation page.
const PREMISE_OPTIONS: ReadonlyArray<{
  value: '' | 'orderly_liquidation' | 'forced_liquidation'
  i18nKey: string
}> = [
  { value: '', i18nKey: 'auto' },
  { value: 'orderly_liquidation', i18nKey: 'orderlyLiquidation' },
  { value: 'forced_liquidation', i18nKey: 'forcedLiquidation' },
]

const ESSENTIAL_FIELDS = [
  'liq_headcount',
  'liq_monthly_rent',
  'liq_paid_up_capital',
  'liq_deferred_tax',
] as const

/**
 * Per-tier liability bucket order — mirrors
 * `priority_cascade.CascadeTierCode` on the engine side. Each tier
 * has a stable engine string key + a Boek-XX / Faillissementswet
 * citation surfaced as the field hint so the advisor can match a
 * GL trial balance to the right rang. Supplying these buckets kills
 * the engine's "estimated from jurisdiction defaults" warning that
 * fires on every cascade page when `liability_buckets` is null.
 *
 * `shareholders` is intentionally excluded — it's the residual class
 * the cascade *computes*, not an input the advisor supplies.
 */
const LIABILITY_BUCKET_TIERS = [
  { code: 'estate_costs', i18nKey: 'estateCosts' },
  { code: 'secured', i18nKey: 'secured' },
  { code: 'super_preferent_employees', i18nKey: 'superPreferentEmployees' },
  { code: 'preferent_tax', i18nKey: 'preferentTax' },
  { code: 'preferent_other', i18nKey: 'preferentOther' },
  { code: 'unsecured', i18nKey: 'unsecured' },
  { code: 'subordinated', i18nKey: 'subordinated' },
] as const

type LiabilityBucketCode = (typeof LIABILITY_BUCKET_TIERS)[number]['code']

const LIABILITY_BUCKET_FORM_KEYS = LIABILITY_BUCKET_TIERS.map(
  (tier) => `liq_lb_${tier.code}` as const
)

/**
 * Per-asset-class adjusted-FMV overrides — mirrors
 * `asset_schedule.AssetClass` on the engine side.  Each class accepts
 * a single number (appraiser FMV in EUR).  Engine's per-class default
 * derives `adjusted_value` from the matching balance-sheet line, so a
 * blank override here just means "trust the book value."  Supplying
 * even a single override surfaces in the realisation schedule with
 * the engine flagging "appraiser override applied."
 *
 * Surfaced under a separate toggle so the section header counts only
 * the *essential* 4 — these are power-user appraiser knowledge, not
 * required inputs.
 */
const ASSET_CLASSES = [
  { code: 'cash', i18nKey: 'cash' },
  { code: 'trade_receivables', i18nKey: 'tradeReceivables' },
  { code: 'other_receivables', i18nKey: 'otherReceivables' },
  { code: 'inventory_finished', i18nKey: 'inventoryFinished' },
  { code: 'inventory_wip', i18nKey: 'inventoryWip' },
  { code: 'inventory_raw', i18nKey: 'inventoryRaw' },
  { code: 'land', i18nKey: 'land' },
  { code: 'buildings', i18nKey: 'buildings' },
  { code: 'machinery_equipment', i18nKey: 'machineryEquipment' },
  { code: 'vehicles', i18nKey: 'vehicles' },
  { code: 'it_equipment', i18nKey: 'itEquipment' },
  { code: 'intangibles', i18nKey: 'intangibles' },
] as const

type AssetClassCode = (typeof ASSET_CLASSES)[number]['code']

const ASSET_OVERRIDE_FORM_KEYS = ASSET_CLASSES.map(
  (cls) => `liq_ao_${cls.code}` as const
)

/**
 * Minimal data-input row.  Label + (optional) prefill marker + field +
 * (optional) inline unit hint.  Deliberately lean — the left panel is
 * for data input, not for advisor narrative.  Anything explaining what
 * a field "drives" or what statute it cites belongs in the
 * `liquidation_disclosure.html` report section, not in the form.
 */
function FieldRow({
  label,
  hint,
  prefilled,
  children,
}: {
  label: string
  /** Short unit/format guidance like "EUR / month" or "FTE".  Avoid
   * citations or methodology copy here — that belongs in the report. */
  hint?: string
  /** When true, renders a single dot next to the label indicating the
   * value was auto-filled from the company profile / filings.  No
   * explanatory copy — the user sees the value, the dot signals
   * provenance.  Disappears the moment the user types. */
  prefilled?: boolean
  children: ReactNode
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <label className="text-xs font-medium text-foreground/80">{label}</label>
        {prefilled ? (
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-primary/60"
            aria-label="prefilled"
            data-testid="liq-prefill-badge"
          />
        ) : null}
      </div>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export interface LiquidationInputsSectionProps {
  step: number
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
  liqLiabilityBuckets?: Partial<Record<LiabilityBucketCode, number>>
  // Per-asset-class adjusted-FMV overrides — turn the realisation
  // schedule from a book-value rollforward into an appraiser-grade
  // working paper (audit P0 #9).  Engine falls back to balance-sheet
  // values for any class without an override.
  liqAssetOverrides?: Partial<Record<AssetClassCode, number>>
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
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showLiabilityBuckets, setShowLiabilityBuckets] = useState(false)
  const [showAssetOverrides, setShowAssetOverrides] = useState(false)
  // Count of non-zero buckets — surfaces in the toggle so the advisor
  // can see at-a-glance whether the cascade is running on real data
  // or jurisdiction defaults.
  const liabilityBucketsFilled = LIABILITY_BUCKET_TIERS.filter((tier) => {
    const v = liqLiabilityBuckets?.[tier.code]
    return typeof v === 'number' && v > 0
  }).length
  const assetOverridesFilled = ASSET_CLASSES.filter((cls) => {
    const v = liqAssetOverrides?.[cls.code]
    return typeof v === 'number' && v > 0
  }).length
  const [headcountWasPrefilled, setHeadcountWasPrefilled] = useState(false)
  const [rentWasPrefilled, setRentWasPrefilled] = useState(false)
  const [paidUpCapitalWasPrefilled, setPaidUpCapitalWasPrefilled] = useState(false)
  const [deferredTaxWasPrefilled, setDeferredTaxWasPrefilled] = useState(false)

  // Auto-prefill headcount from base company profile.
  // Runs whenever (a) liqHeadcount is undefined AND (b) the source
  // signal becomes available. This handles the async case where the
  // company-registry lookup completes AFTER the form mounts — without
  // the dependency the prefill silently misses those rows.
  // The user's manual edit wins forever after (the predicate `liqHeadcount === undefined`
  // is only true on the very first time).
  useEffect(() => {
    if (
      liqHeadcount === undefined &&
      prefillSourceHeadcount !== undefined &&
      prefillSourceHeadcount > 0
    ) {
      onFieldChange('liq_headcount', Math.floor(prefillSourceHeadcount))
      setHeadcountWasPrefilled(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillSourceHeadcount])

  // Auto-prefill monthly rent from `current_year_data.rent_expense / 12`.
  // Same async-safe pattern as headcount: re-fires when the source
  // signal arrives. Hermes mappers populate `rent_expense` from MAR
  // 61x / RGS huurkosten, so this is the dominant prefill path for
  // tenant SMEs. Owner-occupied businesses (rent = 0) skip the prefill
  // and the field stays blank — engine defaults take over.
  useEffect(() => {
    if (
      liqMonthlyRent === undefined &&
      prefillSourceAnnualRent !== undefined &&
      prefillSourceAnnualRent > 0
    ) {
      onFieldChange(
        'liq_monthly_rent',
        Math.round((prefillSourceAnnualRent / 12) * 100) / 100
      )
      setRentWasPrefilled(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillSourceAnnualRent])

  // Auto-prefill paid-up capital from balance-sheet equity composition.
  useEffect(() => {
    if (
      liqPaidUpCapital === undefined &&
      prefillSourcePaidUpCapital !== undefined &&
      prefillSourcePaidUpCapital > 0
    ) {
      onFieldChange('liq_paid_up_capital', prefillSourcePaidUpCapital)
      setPaidUpCapitalWasPrefilled(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillSourcePaidUpCapital])

  // Auto-prefill deferred tax liabilities from balance-sheet long-term
  // liabilities.  Skips zero/missing values — engine defaults take over.
  useEffect(() => {
    if (
      liqDeferredTax === undefined &&
      prefillSourceDeferredTax !== undefined &&
      prefillSourceDeferredTax > 0
    ) {
      onFieldChange('liq_deferred_tax', prefillSourceDeferredTax)
      setDeferredTaxWasPrefilled(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillSourceDeferredTax])

  const handleReset = () => {
    for (const field of ESSENTIAL_FIELDS) {
      onFieldChange(field, undefined)
    }
    onFieldChange('liq_realised_capital_gains', undefined)
    onFieldChange('liq_taxable_reserves', undefined)
    onFieldChange('liq_runway_months_orderly', undefined)
    onFieldChange('liq_runway_months_forced', undefined)
    onFieldChange('liq_distress_wacc_orderly', undefined)
    onFieldChange('liq_distress_wacc_forced', undefined)
    onFieldChange('liq_intangibles_uplift_pct', undefined)
    onFieldChange('liq_multiples_value_override', undefined)
    for (const field of LIABILITY_BUCKET_FORM_KEYS) {
      onFieldChange(field, undefined)
    }
    for (const field of ASSET_OVERRIDE_FORM_KEYS) {
      onFieldChange(field, undefined)
    }
    if (onAnyFieldChange) {
      onAnyFieldChange('liq_premise_override', undefined)
    }
    setHeadcountWasPrefilled(false)
    setRentWasPrefilled(false)
    setPaidUpCapitalWasPrefilled(false)
    setDeferredTaxWasPrefilled(false)
  }

  return (
    <motion.section
      key="liquidation_inputs"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-3 rounded-xl border border-primary/10 bg-primary/[0.03] p-3"
      data-testid="liquidation-inputs-section"
    >
      <ValuationSectionHeader step={step} title={t('title')} subtitle={t('subtitle')} />

      {/* Essentials-filled status chip — surfaces the four-of-four
          progress hinted at in the file-header comment.  Engine fires
          defaults on blank fields so the chip mirrors what the report's
          "estimated bucket" warnings will say (audit P0 #6).  Counts
          *defined* values rather than *non-prefilled* so the bar reads
          the same whether the data came from a filing or from typing. */}
      <div
        className="flex items-center gap-2 rounded-md bg-primary/[0.06] px-2.5 py-1.5 text-[11px] text-foreground/70"
        data-testid="liq-essentials-progress"
      >
        <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-primary/70" />
        {t('essentialsProgress', {
          filled: [liqHeadcount, liqMonthlyRent, liqPaidUpCapital, liqDeferredTax].filter(
            (v) => v !== undefined
          ).length,
          total: ESSENTIAL_FIELDS.length,
        })}
      </div>

      {/* Wind-down panel — bottom-up cost inputs. */}
      <div className="space-y-3 rounded-lg border border-primary/10 bg-background/60 p-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/60">
          {t('windDownTitle')}
        </h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FieldRow
            label={t('headcountLabel')}
            hint={t('headcountHint')}
            prefilled={headcountWasPrefilled && liqHeadcount !== undefined}
          >
            {/* Right-aligned suffix "FTE" matches the CurrencyInput visual
                pattern (suffix in muted-foreground at right edge) for visual
                consistency across the form. */}
            <div className="relative">
              <input
                type="number"
                min={0}
                step={1}
                placeholder={t('headcountPlaceholder')}
                value={liqHeadcount ?? ''}
                disabled={disabled}
                onChange={(e) => {
                  const raw = e.target.value
                  onFieldChange(
                    'liq_headcount',
                    raw === '' ? undefined : Math.max(0, Math.floor(Number(raw)))
                  )
                  if (raw !== '' && headcountWasPrefilled) {
                    setHeadcountWasPrefilled(false)
                  }
                }}
                className="h-9 w-full rounded-md border border-input bg-background px-3 pr-10 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                data-testid="liq-headcount-input"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                FTE
              </span>
            </div>
          </FieldRow>
          <FieldRow
            label={t('monthlyRentLabel')}
            hint={t('monthlyRentHint')}
            prefilled={rentWasPrefilled && liqMonthlyRent !== undefined}
          >
            <CurrencyInput
              value={liqMonthlyRent}
              onChange={(next) => {
                onFieldChange('liq_monthly_rent', next)
                if (next !== undefined && rentWasPrefilled) {
                  setRentWasPrefilled(false)
                }
              }}
              disabled={disabled}
              data-testid="liq-monthly-rent-input"
            />
          </FieldRow>
        </div>
      </div>

      {/* Tax bridge panel. */}
      <div className="space-y-3 rounded-lg border border-primary/10 bg-background/60 p-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/60">
          {t('taxBridgeTitle')}
        </h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FieldRow
            label={t('paidUpCapitalLabel')}
            hint={t('paidUpCapitalHint')}
            prefilled={paidUpCapitalWasPrefilled && liqPaidUpCapital !== undefined}
          >
            <CurrencyInput
              value={liqPaidUpCapital}
              onChange={(next) => {
                onFieldChange('liq_paid_up_capital', next)
                if (next !== undefined && paidUpCapitalWasPrefilled) {
                  setPaidUpCapitalWasPrefilled(false)
                }
              }}
              disabled={disabled}
              data-testid="liq-paid-up-capital-input"
            />
          </FieldRow>
          <FieldRow
            label={t('deferredTaxLabel')}
            hint={t('deferredTaxHint')}
            prefilled={deferredTaxWasPrefilled && liqDeferredTax !== undefined}
          >
            <CurrencyInput
              value={liqDeferredTax}
              onChange={(next) => {
                onFieldChange('liq_deferred_tax', next)
                if (next !== undefined && deferredTaxWasPrefilled) {
                  setDeferredTaxWasPrefilled(false)
                }
              }}
              disabled={disabled}
              data-testid="liq-deferred-tax-input"
            />
          </FieldRow>
          {/* Realised capital gains — drives the meerwaarde leg of
              the BE tax bridge (Art. 47 WIB at 16.5%) and the Vpb-14a
              leg of the NL tax bridge (25.8%).  Without it the engine
              defaults the gains tax to 0 — fine for a holding company,
              wrong for a manufacturer with depreciated machinery. */}
          <FieldRow
            label={t('realisedCapitalGainsLabel')}
            hint={t('realisedCapitalGainsHint')}
          >
            <CurrencyInput
              value={liqRealisedCapitalGains}
              onChange={(next) =>
                onFieldChange('liq_realised_capital_gains', next)
              }
              disabled={disabled}
              data-testid="liq-realised-capital-gains-input"
            />
          </FieldRow>
        </div>
      </div>

      {/* Premise override. */}
      <div className="space-y-3 rounded-lg border border-primary/10 bg-background/60 p-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/60">
          {t('premiseTitle')}
        </h4>
        <FieldRow
          label={t('premiseLabel')}
          hint={t('premiseHint')}
        >
          <select
            value={liqPremiseOverride ?? ''}
            disabled={disabled}
            onChange={(e) => {
              const raw = e.target.value
              if (onAnyFieldChange) {
                onAnyFieldChange(
                  'liq_premise_override',
                  raw === '' ? undefined : raw
                )
              }
            }}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            data-testid="liq-premise-override-select"
          >
            {PREMISE_OPTIONS.map((opt) => (
              <option key={opt.value || 'auto'} value={opt.value}>
                {t(`premiseOption.${opt.i18nKey}`)}
              </option>
            ))}
          </select>
        </FieldRow>
      </div>

      {/* Advanced toggle — collapses 4 power-user inputs. */}
      <button
        type="button"
        onClick={() => setShowAdvanced((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-lg border border-primary/10 bg-background/60 px-3 py-2 text-xs font-medium text-foreground/80 hover:bg-primary/[0.05]"
        data-testid="liq-advanced-toggle"
      >
        <span>{t('advancedToggle')}</span>
        <span className="text-muted-foreground">{showAdvanced ? '−' : '+'}</span>
      </button>

      {showAdvanced ? (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.15 }}
          className="space-y-3 rounded-lg border border-primary/10 bg-background/60 p-3"
          data-testid="liq-advanced-section"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldRow
              label={t('taxableReservesLabel')}
              hint={t('taxableReservesHint')}
            >
              <CurrencyInput
                value={liqTaxableReserves}
                onChange={(next) => onFieldChange('liq_taxable_reserves', next)}
                disabled={disabled}
                data-testid="liq-taxable-reserves-input"
              />
            </FieldRow>
            <FieldRow
              label={t('runwayMonthsLabel')}
              hint={t('runwayMonthsHint')}
            >
              <input
                type="number"
                min={1}
                max={24}
                step={1}
                placeholder={t('runwayMonthsPlaceholder')}
                value={liqRunwayMonthsOrderly ?? ''}
                disabled={disabled}
                onChange={(e) => {
                  const raw = e.target.value
                  onFieldChange(
                    'liq_runway_months_orderly',
                    raw === '' ? undefined : Math.max(1, Math.floor(Number(raw)))
                  )
                }}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                data-testid="liq-runway-months-input"
              />
            </FieldRow>
            <FieldRow
              label={t('runwayMonthsForcedLabel')}
              hint={t('runwayMonthsForcedHint')}
            >
              <input
                type="number"
                min={1}
                max={12}
                step={1}
                placeholder={t('runwayMonthsForcedPlaceholder')}
                value={liqRunwayMonthsForced ?? ''}
                disabled={disabled}
                onChange={(e) => {
                  const raw = e.target.value
                  onFieldChange(
                    'liq_runway_months_forced',
                    raw === '' ? undefined : Math.max(1, Math.floor(Number(raw)))
                  )
                }}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                data-testid="liq-runway-months-forced-input"
              />
            </FieldRow>
            <FieldRow
              label={t('distressWaccLabel')}
              hint={t('distressWaccHint')}
            >
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  placeholder={t('distressWaccPlaceholder')}
                  // Stored as decimal (0.15 = 15%); UI surfaces percent.
                  // Round to 1 decimal on display so the float-multiply
                  // round-trip (0.155 → 15.500000000000002) doesn't leak
                  // garbage digits on re-render (audit P0 #7).
                  value={
                    liqDistressWaccOrderly === undefined
                      ? ''
                      : Math.round(Number(liqDistressWaccOrderly) * 1000) / 10
                  }
                  disabled={disabled}
                  onChange={(e) => {
                    const raw = e.target.value
                    onFieldChange(
                      'liq_distress_wacc_orderly',
                      raw === ''
                        ? undefined
                        : Math.max(0, Math.round(Number(raw) * 10) / 1000)
                    )
                  }}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 pr-7 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  data-testid="liq-distress-wacc-input"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  %
                </span>
              </div>
            </FieldRow>
            <FieldRow
              label={t('distressWaccForcedLabel')}
              hint={t('distressWaccForcedHint')}
            >
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  placeholder={t('distressWaccForcedPlaceholder')}
                  // Same decimal round-trip guard as the orderly
                  // WACC input above (audit P0 #7 echo).
                  value={
                    liqDistressWaccForced === undefined
                      ? ''
                      : Math.round(Number(liqDistressWaccForced) * 1000) / 10
                  }
                  disabled={disabled}
                  onChange={(e) => {
                    const raw = e.target.value
                    onFieldChange(
                      'liq_distress_wacc_forced',
                      raw === ''
                        ? undefined
                        : Math.max(0, Math.round(Number(raw) * 10) / 1000)
                    )
                  }}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 pr-7 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  data-testid="liq-distress-wacc-forced-input"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  %
                </span>
              </div>
            </FieldRow>
            <FieldRow
              label={t('intangiblesUpliftLabel')}
              hint={t('intangiblesUpliftHint')}
            >
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  placeholder={t('intangiblesUpliftPlaceholder')}
                  // Stored as decimal (0.15 = 15%); UI surfaces percent.
                  // Drives the M&A replacement-cost ceiling on the
                  // Statement of Affairs band — see
                  // `replacement_cost.intangibles_uplift_pct`.  Per
                  // Reilly & Schweihs (1998) Ch. 16, typical range
                  // 10-25% of tangible base for SME goodwill.
                  value={
                    liqIntangiblesUpliftPct === undefined
                      ? ''
                      : Math.round(Number(liqIntangiblesUpliftPct) * 1000) / 10
                  }
                  disabled={disabled}
                  onChange={(e) => {
                    const raw = e.target.value
                    onFieldChange(
                      'liq_intangibles_uplift_pct',
                      raw === ''
                        ? undefined
                        : Math.max(0, Math.round(Number(raw) * 10) / 1000)
                    )
                  }}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 pr-7 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  data-testid="liq-intangibles-uplift-input"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  %
                </span>
              </div>
            </FieldRow>
            <FieldRow
              label={t('multiplesValueLabel')}
              hint={t('multiplesValueHint')}
            >
              <CurrencyInput
                value={liqMultiplesValueOverride}
                onChange={(next) =>
                  onFieldChange('liq_multiples_value_override', next)
                }
                disabled={disabled}
                data-testid="liq-multiples-value-input"
              />
            </FieldRow>
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
      <button
        type="button"
        onClick={() => setShowLiabilityBuckets((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-lg border border-primary/10 bg-background/60 px-3 py-2 text-xs font-medium text-foreground/80 hover:bg-primary/[0.05]"
        data-testid="liq-liability-buckets-toggle"
      >
        <span className="flex flex-col items-start gap-0.5">
          <span>{t('liabilityBucketsTitle')}</span>
          <span className="text-[10px] font-normal text-muted-foreground">
            {t('liabilityBucketsProgress', {
              filled: liabilityBucketsFilled,
              total: LIABILITY_BUCKET_TIERS.length,
            })}
          </span>
        </span>
        <span className="text-muted-foreground">{showLiabilityBuckets ? '−' : '+'}</span>
      </button>

      {showLiabilityBuckets ? (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.15 }}
          className="space-y-3 rounded-lg border border-primary/10 bg-background/60 p-3"
          data-testid="liq-liability-buckets-section"
        >
          <p className="text-[11px] text-muted-foreground">
            {t('liabilityBucketsSubtitle')}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {LIABILITY_BUCKET_TIERS.map((tier) => {
              const formKey = `liq_lb_${tier.code}` as const
              const current = liqLiabilityBuckets?.[tier.code]
              return (
                <FieldRow
                  key={tier.code}
                  label={t(`liabilityBucketLabel.${tier.i18nKey}`)}
                  hint={t(`liabilityBucketHint.${tier.i18nKey}`)}
                >
                  <CurrencyInput
                    value={current}
                    onChange={(next) => onFieldChange(formKey, next)}
                    disabled={disabled}
                    data-testid={`liq-lb-${tier.code}-input`}
                  />
                </FieldRow>
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
      <button
        type="button"
        onClick={() => setShowAssetOverrides((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-lg border border-primary/10 bg-background/60 px-3 py-2 text-xs font-medium text-foreground/80 hover:bg-primary/[0.05]"
        data-testid="liq-asset-overrides-toggle"
      >
        <span className="flex flex-col items-start gap-0.5">
          <span>{t('assetOverridesTitle')}</span>
          <span className="text-[10px] font-normal text-muted-foreground">
            {t('assetOverridesProgress', {
              filled: assetOverridesFilled,
              total: ASSET_CLASSES.length,
            })}
          </span>
        </span>
        <span className="text-muted-foreground">{showAssetOverrides ? '−' : '+'}</span>
      </button>

      {showAssetOverrides ? (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.15 }}
          className="space-y-3 rounded-lg border border-primary/10 bg-background/60 p-3"
          data-testid="liq-asset-overrides-section"
        >
          <p className="text-[11px] text-muted-foreground">
            {t('assetOverridesSubtitle')}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ASSET_CLASSES.map((cls) => {
              const formKey = `liq_ao_${cls.code}` as const
              const current = liqAssetOverrides?.[cls.code]
              return (
                <FieldRow
                  key={cls.code}
                  label={t(`assetClassLabel.${cls.i18nKey}`)}
                  hint={t('assetOverridesHint')}
                >
                  <CurrencyInput
                    value={current}
                    onChange={(next) => onFieldChange(formKey, next)}
                    disabled={disabled}
                    data-testid={`liq-ao-${cls.code}-input`}
                  />
                </FieldRow>
              )
            })}
          </div>
        </motion.div>
      ) : null}

      {/* Reset action — data affordance, not narrative.  Clears all
          liq_* fields back to undefined so the engine falls through to
          its cohort defaults. */}
      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={handleReset}
          disabled={disabled}
          className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
          data-testid="liq-reset-button"
        >
          {t('resetButton')}
        </button>
      </div>
    </motion.section>
  )
}
