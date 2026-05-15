'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { lazy, Suspense, useEffect, useMemo, useRef } from 'react'
import {
  type GetBonusSectionsSaasSignals,
  getBonusSections,
  getBonusSectionsForMethods,
} from '@/constants/methodFieldConfig'
import { selectionRequiresOwnerCompensation } from '@/lib/methods'
import { useSdeOwnerCompensationPrefill } from '@/lib/methods/sde_multiple'
import {
  computeFiscal4xPreview,
  computeNavBookReferences,
  computeNavPrefill,
  type FiscalPreviewEbitdaSource,
  type NavBookReferenceSnapshot,
  type NavPrefillField,
  type NavPrefillProvenanceMap,
  resolveBookEquityFromYearRow,
} from '@/lib/omniPreview'
import { useNormalizationStore } from '@/store/useNormalizationStore'
import type { ManualValuationFormData as ValuationFormData } from '@/types/valuation'
import { countForecastYears } from '@/utils/forecastYears'
import { getLatestCompleteYearlyFinancial } from '@/utils/yearlyFinancials'
import type { TerminalValueMethod } from './DcfGlobalAssumptions'
import { DealStructureCompareSection } from './DealStructureCompareSection'
import { FiscalReferencePreviewCard } from './FiscalReferencePreviewCard'
import { computeEquipmentMeerwaarde } from './NavEquipmentLifespanSection'
import { deriveSaasArrProjectionPreview } from './saasArrProjectionPreview'

const MethodPreviewAuditDevPanel = lazy(() =>
  import('./MethodPreviewAuditDevPanel').then((m) => ({
    default: m.MethodPreviewAuditDevPanel,
  }))
)
const CapitalHistorySection = lazy(() =>
  import('./CapitalHistorySection').then((m) => ({
    default: m.CapitalHistorySection,
  }))
)
const DcfGlobalAssumptions = lazy(() =>
  import('./DcfGlobalAssumptions').then((m) => ({
    default: m.DcfGlobalAssumptions,
  }))
)
const FiscalInputsSection = lazy(() =>
  import('./FiscalInputsSection').then((m) => ({
    default: m.FiscalInputsSection,
  }))
)
const LiquidationInputsSection = lazy(() =>
  import('./LiquidationInputsSection').then((m) => ({
    default: m.LiquidationInputsSection,
  }))
)
const NavAssetScheduleSection = lazy(() =>
  import('./NavAssetScheduleSection').then((m) => ({
    default: m.NavAssetScheduleSection,
  }))
)
const NavEquipmentLifespanSection = lazy(() =>
  import('./NavEquipmentLifespanSection').then((m) => ({
    default: m.NavEquipmentLifespanSection,
  }))
)
const NavRealEstateAppraisalSection = lazy(() =>
  import('./NavRealEstateAppraisalSection').then((m) => ({
    default: m.NavRealEstateAppraisalSection,
  }))
)
const RevenueQualitySection = lazy(() =>
  import('./RevenueQualitySection').then((m) => ({
    default: m.RevenueQualitySection,
  }))
)
const SaasMetricsSection = lazy(() =>
  import('./SaasMetricsSection').then((m) => ({
    default: m.SaasMetricsSection,
  }))
)
const SdeOwnerCompensationSection = lazy(() =>
  import('./SdeOwnerCompensationSection').then((m) => ({
    default: m.SdeOwnerCompensationSection,
  }))
)

function BonusSectionFallback() {
  return <div className="my-2 h-16 animate-pulse rounded-lg bg-foreground/[0.04]" aria-hidden />
}

// Round-6 audit: `resolveLatestDealStructureComparison` was the only
// place ManualInputPanel read `result.details.*` engine output. It fed
// the `comparison` prop on `DealStructureCompareSection`, which round-4
// stripped (advisory output → moved to ValuationIQ report). With the
// prop gone, this helper had no callers, so the function + its
// `_last_deal_structure_comparison` overlay convention are removed —
// the engine response now flows directly to the report-side context
// builder (`omni_calc_overrides._apply_non_multiple_overrides` lifts it
// to `nav_deal_structure`). The input panel must never read engine
// output back into itself.

export function AdaptiveSections({
  effectiveMethod,
  effectiveMethods,
  businessCategory,
  businessTypeId,
  saasSignals,
  formData,
  firmCountryCode,
  previewCurrencyFormatter,
  sectionHeaderSteps,
  suppressDcfGlobalAssumptions,
  onFieldChange,
  onAnyFieldChange,
  onViewAllNormalizations,
  currentFiscalYear,
  onApplyDcfPercentAutofill,
  canApplyDcfPercentAutofill,
  terminalValueMethod,
  onTerminalValueMethodChange,
  disabled,
  fiscalWeightedNormalizedEbitda,
  fiscalWeightedHistoricalYearCount,
}: {
  effectiveMethod: string
  effectiveMethods?: string[]
  businessCategory?: string
  businessTypeId?: string
  saasSignals?: GetBonusSectionsSaasSignals | null
  formData: ValuationFormData
  /** When NL, hide Belgian fiscal (4× EBITDA) notices — matches Titan/PDF gating */
  firmCountryCode?: string
  /** Shared with parent `ManualInputPanel` — one `useManualPreviewFormatters` for panel + fiscal notice */
  previewCurrencyFormatter: Intl.NumberFormat
  sectionHeaderSteps: {
    dcfGlobal?: number
    nav?: number
    saas?: number
    revenue?: number
    sde?: number
    fiscal?: number
  }
  /** When true, DCF globals are rendered in ManualInputPanel (forecast defaults first). */
  suppressDcfGlobalAssumptions?: boolean
  onFieldChange: (field: string, value: number | undefined) => void
  /**
   * Generic setter for non-numeric form fields (owner role, deal type flags,
   * boolean toggles). Wired through `updateField` upstream.
   */
  onAnyFieldChange?: (field: string, value: unknown) => void
  onViewAllNormalizations?: () => void
  currentFiscalYear?: number
  onApplyDcfPercentAutofill?: () => void
  canApplyDcfPercentAutofill?: boolean
  terminalValueMethod?: TerminalValueMethod
  onTerminalValueMethodChange?: (method: TerminalValueMethod) => void
  disabled?: boolean
  /**
   * Historical weighted normalized EBITDA (same construction as headline in step 3).
   * When set with {@link fiscalWeightedHistoricalYearCount} &gt; 0, fiscal preview matches report annex EBITDA semantics.
   */
  fiscalWeightedNormalizedEbitda?: number
  fiscalWeightedHistoricalYearCount?: number
}) {
  const t = useTranslations('manualInput.methodSelector')
  const normalizationItems = useNormalizationStore((s) => s.items)
  const sdeSectionActive = selectionRequiresOwnerCompensation(effectiveMethods ?? [effectiveMethod])
  const {
    prefill: sdeSalaryPrefill,
    doubleCountRisk: sdeOwnerCompDoubleCountRisk,
    getAppliedPrefill: getSdeAppliedPrefill,
  } = useSdeOwnerCompensationPrefill({
    sdeSectionActive,
    normalizationItems,
    ownerSalaryAddback: formData.owner_salary_addback as number | null | undefined,
    onAnyFieldChange,
  })
  const methods = effectiveMethods ?? [effectiveMethod]
  const sections =
    methods.length > 1
      ? getBonusSectionsForMethods(methods, businessCategory, businessTypeId, saasSignals)
      : getBonusSections(effectiveMethod, businessCategory, businessTypeId, saasSignals)
  const latestCompleteYearlyFinancial = useMemo(
    () => getLatestCompleteYearlyFinancial(formData.yearlyFinancials ?? []),
    [formData.yearlyFinancials]
  )

  /* ────────────────────────────────────────────────────────────────────
   * NAV (Adjusted Net Asset Value) — auto-prefill (round-2)
   * ─────────────────────────────────────────────────────────────────────
   * Compute the prefill snapshot every render (cheap pure call). Apply
   * via effect so we never trigger a setState during render. Provenance
   * is then forwarded to the schedule UI so prefilled fields show a
   * "Prefilled" badge — trust is explicit, the user can edit freely.
   *
   * We only touch fields the user hasn't typed into (the helper guards
   * against overwrites internally). The effect is gated on the NAV
   * section being mounted — when the user picks a different method the
   * prefill stays inert. */
  const navIsActiveSection = sections.includes('nav_asset_schedule')

  // Round-5: compute the *desired* prefill from current upstream inputs,
  // ignoring whatever's currently in `formData.nav_*`. We then reconcile
  // in the effect below. This lets us re-prefill on signal change (e.g.
  // user switches country BE → NL → tax rate auto-updates from 25 to
  // 25.8) without overwriting values the user has typed manually.
  //
  // Calling the helper with an empty `existing` is the round-3 idempotency
  // contract — the helper always returns the same desired snapshot for
  // a given (country, carve-out) tuple regardless of form state.
  const navDesiredPrefill = useMemo(
    () =>
      computeNavPrefill({
        countryCode: formData.country,
        realEstateCarveOutBookValue:
          (formData.real_estate_book_value as number | undefined) ?? null,
        reportingYear: latestCompleteYearlyFinancial
          ? Number(latestCompleteYearlyFinancial.year)
          : null,
        existing: {},
      }),
    [formData.country, formData.real_estate_book_value, latestCompleteYearlyFinancial]
  )

  // Track each prefilled field's *applied value* and its *provenance*.
  // The applied-value ref lets us tell user-typed values apart from
  // stale prefills:
  //   - current value === applied value  → still our prefill, free to update
  //   - current value !== applied value  → user typed it, leave alone
  //   - current value == null            → empty, free to apply
  // Round-5: this lets us refresh the rate when the country changes
  // without overwriting the rate when the user has set their own.
  const navPrefillAppliedRef = useRef<Partial<Record<NavPrefillField, number>>>({})
  const navPrefillProvenanceRef = useRef<NavPrefillProvenanceMap>({})

  // Stable handles for the form-data fields the prefill effect cares
  // about. Reading via refs avoids re-firing the effect when other
  // unrelated form fields change.
  const _navTaxLatencyPctValue = formData.nav_tax_latency_pct as number | undefined
  const _navRealEstateBookValue = formData.nav_real_estate_book_value as number | undefined
  const _navEquipmentRevaluation = formData.nav_equipment_revaluation as
    | {
        original_cost?: number
        acquisition_year?: number
        tax_book_value?: number
        economic_useful_life_years?: number
        economic_book_value?: number
      }
    | undefined
  const _navEquipmentAcquisitionYear = _navEquipmentRevaluation?.acquisition_year
  const _navEquipmentUsefulLifeYears = _navEquipmentRevaluation?.economic_useful_life_years
  const _dealBuyerDiscountRatePct = formData.deal_buyer_discount_rate_pct as number | undefined
  const _dealRegistrationDutyPct = formData.deal_registration_duty_pct as number | undefined

  useEffect(() => {
    if (!navIsActiveSection) return
    const { values, provenance } = navDesiredPrefill
    const currentByField: Record<NavPrefillField, number | undefined> = {
      nav_tax_latency_pct: _navTaxLatencyPctValue,
      nav_real_estate_book_value: _navRealEstateBookValue,
      nav_equipment_acquisition_year: _navEquipmentAcquisitionYear,
      nav_equipment_useful_life_years: _navEquipmentUsefulLifeYears,
      deal_buyer_discount_rate_pct: _dealBuyerDiscountRatePct,
      deal_registration_duty_pct: _dealRegistrationDutyPct,
    }
    // Field-key → form-state write path. Top-level paths use onFieldChange;
    // nested equipment fields merge into the single nav_equipment_revaluation
    // object so they survive each other's writes.
    const writeField = (field: NavPrefillField, desired: number) => {
      if (field === 'nav_equipment_acquisition_year') {
        if (!onAnyFieldChange) return
        onAnyFieldChange('nav_equipment_revaluation', {
          ...(_navEquipmentRevaluation ?? {}),
          acquisition_year: desired,
        })
        return
      }
      if (field === 'nav_equipment_useful_life_years') {
        if (!onAnyFieldChange) return
        onAnyFieldChange('nav_equipment_revaluation', {
          ...(_navEquipmentRevaluation ?? {}),
          economic_useful_life_years: desired,
        })
        return
      }
      onFieldChange(field, desired)
    }
    for (const [field, desired] of Object.entries(values)) {
      if (desired == null || !Number.isFinite(desired)) continue
      const typedField = field as NavPrefillField
      const current = currentByField[typedField]
      const applied = navPrefillAppliedRef.current[typedField]

      // Skip when the user has typed something different from any prior
      // prefill — respect their edit.
      if (current != null && current !== applied) continue
      // Skip the no-op case (current already equals desired).
      if (current === desired) continue

      writeField(typedField, desired)
      navPrefillAppliedRef.current[typedField] = desired
      navPrefillProvenanceRef.current[typedField] = provenance[typedField]
    }
  }, [
    navIsActiveSection,
    navDesiredPrefill,
    _navTaxLatencyPctValue,
    _navRealEstateBookValue,
    _navEquipmentAcquisitionYear,
    _navEquipmentUsefulLifeYears,
    _navEquipmentRevaluation,
    _dealBuyerDiscountRatePct,
    _dealRegistrationDutyPct,
    onFieldChange,
    onAnyFieldChange,
  ])

  const navBookReferences = useMemo<NavBookReferenceSnapshot>(
    () =>
      computeNavBookReferences({
        inventory: latestCompleteYearlyFinancial
          ? Number(latestCompleteYearlyFinancial.inventory)
          : null,
        accountsReceivable: latestCompleteYearlyFinancial
          ? Number(latestCompleteYearlyFinancial.accounts_receivable)
          : null,
        // Goodwill isn't on the summarised yearly financial today; left
        // null so the schedule's goodwill chip stays hidden until the
        // Hermes detail-account enrichment lands. Plumbing's ready.
        goodwill: null,
        totalAssets: latestCompleteYearlyFinancial
          ? Number(latestCompleteYearlyFinancial.total_assets)
          : null,
        totalLiabilities: latestCompleteYearlyFinancial
          ? Number(latestCompleteYearlyFinancial.total_liabilities)
          : null,
      }),
    [latestCompleteYearlyFinancial]
  )

  // Provenance map exposed to the schedule UI: only includes a field when
  // its current form value still matches what we applied. The moment the
  // user edits, identity breaks and the entry drops out, hiding the
  // "Prefilled" badge cleanly. Form-data fields are listed explicitly in
  // the dep array so the memo invalidates on user edits.
  const navPrefillProvenance = useMemo<NavPrefillProvenanceMap>(() => {
    const result: NavPrefillProvenanceMap = {}
    const applied = navPrefillAppliedRef.current
    const provenance = navPrefillProvenanceRef.current
    const equipment = formData.nav_equipment_revaluation as
      | { acquisition_year?: number; economic_useful_life_years?: number }
      | undefined
    const currentValues: Record<NavPrefillField, number | undefined> = {
      nav_tax_latency_pct: formData.nav_tax_latency_pct as number | undefined,
      nav_real_estate_book_value: formData.nav_real_estate_book_value as number | undefined,
      nav_equipment_acquisition_year: equipment?.acquisition_year,
      nav_equipment_useful_life_years: equipment?.economic_useful_life_years,
      deal_buyer_discount_rate_pct: formData.deal_buyer_discount_rate_pct as number | undefined,
      deal_registration_duty_pct: formData.deal_registration_duty_pct as number | undefined,
    }
    for (const [field, appliedValue] of Object.entries(applied)) {
      const typedField = field as NavPrefillField
      const currentValue = currentValues[typedField]
      if (currentValue != null && currentValue === appliedValue) {
        const provenanceEntry = provenance[typedField]
        if (provenanceEntry) {
          result[typedField] = provenanceEntry
        }
      }
    }
    return result
  }, [
    formData.nav_tax_latency_pct,
    formData.nav_real_estate_book_value,
    formData.nav_equipment_revaluation,
    formData.deal_buyer_discount_rate_pct,
    formData.deal_registration_duty_pct,
  ])

  const fiscalPreview = useMemo(() => {
    const row = latestCompleteYearlyFinancial
    const reportedLatest =
      row != null && Number.isFinite(Number(row.ebitda)) ? Number(row.ebitda) : undefined

    const hasWeighted =
      (fiscalWeightedHistoricalYearCount ?? 0) > 0 &&
      fiscalWeightedNormalizedEbitda != null &&
      Number.isFinite(fiscalWeightedNormalizedEbitda)

    const ebitda = hasWeighted ? fiscalWeightedNormalizedEbitda : reportedLatest
    const ebitdaSource = (
      hasWeighted ? 'weighted_normalized_historical' : 'reported_latest_complete_year'
    ) satisfies FiscalPreviewEbitdaSource

    const be = resolveBookEquityFromYearRow(row ?? undefined)
    return computeFiscal4xPreview({
      countryCode: formData.country?.trim() || 'BE',
      ebitda,
      ebitdaSource,
      bookEquity: be,
      sharesForSale: formData.shares_for_sale ?? 100,
    })
  }, [
    latestCompleteYearlyFinancial,
    formData.country,
    formData.shares_for_sale,
    fiscalWeightedNormalizedEbitda,
    fiscalWeightedHistoricalYearCount,
  ])

  const saasArrProjectionPreview = useMemo(
    () =>
      sections.includes('saas_metrics') && methods.includes('dcf')
        ? deriveSaasArrProjectionPreview({
            yearlyFinancials: formData.yearlyFinancials,
            saasArr: formData.saas_arr as number | undefined,
            saasMrr: formData.saas_mrr as number | undefined,
            saasArrGrowthPct: formData.saas_arr_growth_pct as number | undefined,
            saasNrrPct: formData.saas_nrr_pct as number | undefined,
            saasChurnPct: formData.saas_churn_pct as number | undefined,
            saasExpansionRevenuePct: formData.saas_expansion_revenue_pct as number | undefined,
          })
        : [],
    [
      sections,
      methods,
      formData.yearlyFinancials,
      formData.saas_arr,
      formData.saas_mrr,
      formData.saas_arr_growth_pct,
      formData.saas_nrr_pct,
      formData.saas_churn_pct,
      formData.saas_expansion_revenue_pct,
    ]
  )
  const importedSaasProvenance =
    typeof formData.business_context === 'object' &&
    formData.business_context &&
    '_imported_saas_provenance' in formData.business_context
      ? ((formData.business_context as Record<string, unknown>)._imported_saas_provenance as {
          source?: string
          confidence?: number
          derivation_method?: string
          fiscal_year?: number
        } | null)
      : null
  const saasSectionComplete = useMemo(
    () =>
      ((formData.saas_arr as number | undefined) ?? 0) > 0 ||
      ((formData.saas_mrr as number | undefined) ?? 0) > 0 ||
      formData.saas_arr_growth_pct != null ||
      formData.saas_gross_margin_pct != null,
    [
      formData.saas_arr,
      formData.saas_mrr,
      formData.saas_arr_growth_pct,
      formData.saas_gross_margin_pct,
    ]
  )

  const firmCode = (firmCountryCode ?? 'BE').trim().toUpperCase().substring(0, 2)
  const showFiscalNotice = methods.includes('fiscal_4x') && firmCode !== 'NL'
  const fiscalPreviewUnavailableMessage =
    !fiscalPreview.available && fiscalPreview.unavailableReason
      ? fiscalPreview.unavailableReason === 'non_be'
        ? t('fields.fiscalPreviewUnavailableNonBe')
        : fiscalPreview.unavailableReason === 'non_positive_ebitda'
          ? t('fields.fiscalPreviewUnavailableEbitda')
          : fiscalPreview.unavailableReason === 'missing_ebitda'
            ? t('fields.fiscalPreviewUnavailableMissingEbitda')
            : fiscalPreview.unavailableReason === 'missing_book_equity'
              ? t('fields.fiscalPreviewUnavailableMissingEquity')
              : null
      : null
  if (sections.length === 0 && !showFiscalNotice) return null

  return (
    <>
      <AnimatePresence mode="sync">
        {/* fiscal_4x left-panel surface: live formula preview only. The
            scope disclaimer (Wettelijke referentie / Art. 90 WIB 92 / etc.)
            was removed from the data rail 2026-05-10 — it's pure advisory
            copy that already renders on the fiscal_reference report page
            (`fiscal_scope_disclaimer`) and on the picker tooltip. The data
            rail stays focused on inputs the advisor brings + their live
            implication on the engine output. */}
        {showFiscalNotice && (
          <motion.div
            key="fiscal_4x_notice"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="space-y-3"
          >
            <FiscalReferencePreviewCard
              fiscalPreview={fiscalPreview}
              previewCurrencyFormatter={previewCurrencyFormatter}
              unavailableMessage={fiscalPreviewUnavailableMessage}
            />
          </motion.div>
        )}
        {/* Meerwaarde-tax left-panel section — pure data input.
            Renders only when fiscal_4x is the pre-selected method.
            Captures the four amount values for the cedent's 31/12/2025
            cost-basis filing: aanschaffingswaarde + alternative anchors
            (contractuele formule, markttransactie 2025, onafhankelijk
            verslag). Advisory metadata (peildatum, company role, EBITDA
            basis, internal-transfer flag, acknowledged-anchors) is
            auto-derived by the report builder or set on metadata via
            firm/transaction settings — not collected on the data rail. */}
        {sections.includes('fiscal_inputs') && sectionHeaderSteps.fiscal != null && (
          <Suspense key="fiscal_inputs" fallback={<BonusSectionFallback />}>
            <FiscalInputsSection
              step={sectionHeaderSteps.fiscal}
              fiscalAcquisitionCost={formData.fiscal_acquisition_cost as number | undefined}
              fiscalAnchor2Value={formData.fiscal_anchor_2_value as number | undefined}
              fiscalAnchor3Value={formData.fiscal_anchor_3_value as number | undefined}
              fiscalAnchor4Value={formData.fiscal_anchor_4_value as number | undefined}
              onFieldChange={onFieldChange}
              disabled={disabled}
            />
          </Suspense>
        )}
        {sections.includes('dcf_projections') &&
          !suppressDcfGlobalAssumptions &&
          terminalValueMethod &&
          onTerminalValueMethodChange &&
          sectionHeaderSteps.dcfGlobal != null && (
            <Suspense key="dcf_global_assumptions" fallback={<BonusSectionFallback />}>
              <DcfGlobalAssumptions
                className={showFiscalNotice ? 'mt-6' : undefined}
                step={sectionHeaderSteps.dcfGlobal}
                dcfRevenueGrowthPct={formData.dcf_revenue_growth_pct as number | undefined}
                dcfEbitdaMarginPct={formData.dcf_ebitda_margin_pct as number | undefined}
                dcfCapexPct={formData.dcf_capex_pct as number | undefined}
                dcfDaPct={formData.dcf_da_pct as number | undefined}
                dcfNwcPct={formData.dcf_nwc_pct as number | undefined}
                dcfTaxRatePct={formData.dcf_tax_rate_pct as number | undefined}
                dcfWaccPct={formData.dcf_wacc_pct as number | undefined}
                dcfTerminalGrowthPct={formData.dcf_terminal_growth_pct as number | undefined}
                dcfExitMultiple={formData.dcf_exit_multiple as number | undefined}
                dcfRiskFreeRatePct={formData.dcf_risk_free_rate_pct as number | undefined}
                dcfEquityRiskPremiumPct={formData.dcf_equity_risk_premium_pct as number | undefined}
                dcfBeta={formData.dcf_beta as number | undefined}
                dcfCostOfDebtPct={formData.dcf_cost_of_debt_pct as number | undefined}
                dcfDebtEquityPct={formData.dcf_debt_equity_pct as number | undefined}
                dcfTaxShieldPct={formData.dcf_tax_shield_pct as number | undefined}
                terminalValueMethod={terminalValueMethod}
                onTerminalValueMethodChange={onTerminalValueMethodChange}
                onFieldChange={onFieldChange}
                onApplyToForecastYears={onApplyDcfPercentAutofill}
                canApplyToForecastYears={!!canApplyDcfPercentAutofill}
                forecastYearCount={countForecastYears(formData.yearlyFinancials ?? [])}
                dcfInputMode={formData.dcf_input_mode ?? 'ebitda'}
                disabled={disabled}
              />
            </Suspense>
          )}
        {sections.includes('nav_asset_schedule') &&
          sectionHeaderSteps.nav != null &&
          (() => {
            // Compute the side-input meerwaarde locally so the schedule
            // section's live preview mirrors the engine instead of the
            // schedule-deltas-only subset. Round-1 fix B6.
            const _bookValRE = formData.nav_real_estate_book_value as number | undefined
            const _appraisalRE = formData.nav_real_estate_appraisal_value as number | undefined
            const realEstateMeerwaarde =
              _bookValRE != null &&
              _appraisalRE != null &&
              Number.isFinite(_bookValRE) &&
              Number.isFinite(_appraisalRE)
                ? _appraisalRE - _bookValRE
                : null
            const equipmentMeerwaarde = computeEquipmentMeerwaarde(
              formData.nav_equipment_revaluation,
              latestCompleteYearlyFinancial ? Number(latestCompleteYearlyFinancial.year) : undefined
            )
            // Round-1 fix B3: signal the schedule to swap its delta field
            // out for a read-only "from appraisal" badge whenever the
            // book→appraisal pair is fully filled.
            const hasRealEstateAppraisalSwap =
              _bookValRE != null &&
              _appraisalRE != null &&
              Number.isFinite(_bookValRE) &&
              Number.isFinite(_appraisalRE)
            return (
              <Suspense key="nav_asset_schedule" fallback={<BonusSectionFallback />}>
                <NavAssetScheduleSection
                  step={sectionHeaderSteps.nav}
                  navRealEstateAdjustment={
                    formData.nav_real_estate_adjustment as number | undefined
                  }
                  navInventoryAdjustment={formData.nav_inventory_adjustment as number | undefined}
                  navHiddenReserves={formData.nav_hidden_reserves as number | undefined}
                  navGoodwillWriteoff={formData.nav_goodwill_writeoff as number | undefined}
                  navReceivablesAdjustment={
                    formData.nav_receivables_adjustment as number | undefined
                  }
                  navOtherRevaluations={formData.nav_other_revaluations as number | undefined}
                  navTaxLatencyPct={formData.nav_tax_latency_pct as number | undefined}
                  navOffBalanceItems={formData.nav_off_balance_items as number | undefined}
                  countryCode={formData.country?.trim() || 'BE'}
                  totalAssets={
                    latestCompleteYearlyFinancial
                      ? Number(latestCompleteYearlyFinancial.total_assets)
                      : undefined
                  }
                  totalLiabilities={
                    latestCompleteYearlyFinancial
                      ? Number(latestCompleteYearlyFinancial.total_liabilities)
                      : undefined
                  }
                  businessType={formData.industry || undefined}
                  realEstateAppraisalMeerwaarde={realEstateMeerwaarde}
                  equipmentRevaluationMeerwaarde={equipmentMeerwaarde}
                  hasRealEstateAppraisalSwap={hasRealEstateAppraisalSwap}
                  bookReferences={navBookReferences}
                  prefillProvenance={navPrefillProvenance}
                  perAssetTaxRates={
                    formData.nav_per_asset_tax_rates as
                      | {
                          real_estate?: number
                          inventory?: number
                          receivables?: number
                          hidden_reserves?: number
                          other_revaluations?: number
                        }
                      | undefined
                  }
                  onPerAssetTaxRateChange={
                    onAnyFieldChange
                      ? (patch) => {
                          // Merge into the existing per-asset rates dict so
                          // we never blow away other rates the user has
                          // already set. Round-3 fix B4.
                          const current =
                            (formData.nav_per_asset_tax_rates as
                              | Record<string, number | undefined>
                              | undefined) ?? {}
                          const next: Record<string, number> = {}
                          for (const [k, v] of Object.entries({ ...current, ...patch })) {
                            if (v != null && Number.isFinite(v)) {
                              next[k] = v
                            }
                          }
                          onAnyFieldChange(
                            'nav_per_asset_tax_rates',
                            Object.keys(next).length > 0 ? next : undefined
                          )
                        }
                      : undefined
                  }
                  onFieldChange={onFieldChange}
                  disabled={disabled}
                />
              </Suspense>
            )
          })()}
        {/*
          NAV is one method that decomposes into four defensible cards
          (schedule + real-estate swap + equipment lifespan + deal
          structure). Round-1 fix B1 letters the sub-cards (Na/Nb/Nc/Nd)
          off the parent NAV step so the user reads them as one method's
          progressive disclosure rather than four loose forms.
        */}
        {sections.includes('nav_asset_schedule') && sectionHeaderSteps.nav != null && (
          <Suspense key="nav_real_estate_appraisal" fallback={<BonusSectionFallback />}>
            <NavRealEstateAppraisalSection
              step={`${sectionHeaderSteps.nav}b`}
              bookValue={formData.nav_real_estate_book_value as number | undefined}
              appraisalValue={formData.nav_real_estate_appraisal_value as number | undefined}
              deferredTaxRatePct={
                (formData.nav_per_asset_tax_rates?.real_estate as number | undefined) ??
                (formData.nav_tax_latency_pct as number | undefined)
              }
              onChange={onFieldChange}
              disabled={disabled}
            />
          </Suspense>
        )}
        {sections.includes('nav_asset_schedule') &&
          sectionHeaderSteps.nav != null &&
          onAnyFieldChange && (
            <Suspense key="nav_equipment_lifespan" fallback={<BonusSectionFallback />}>
              <NavEquipmentLifespanSection
                step={`${sectionHeaderSteps.nav}c`}
                value={formData.nav_equipment_revaluation}
                reportingYear={
                  latestCompleteYearlyFinancial
                    ? Number(latestCompleteYearlyFinancial.year)
                    : undefined
                }
                prefilled={{
                  acquisition_year: navPrefillProvenance.nav_equipment_acquisition_year != null,
                  economic_useful_life_years:
                    navPrefillProvenance.nav_equipment_useful_life_years != null,
                }}
                onChange={(next) => onAnyFieldChange('nav_equipment_revaluation', next)}
                disabled={disabled}
              />
            </Suspense>
          )}
        {sections.includes('nav_asset_schedule') &&
          sectionHeaderSteps.nav != null &&
          onAnyFieldChange && (
            <DealStructureCompareSection
              key="deal_structure_compare"
              step={`${sectionHeaderSteps.nav}d`}
              inputs={{
                dealType: formData.deal_type,
                goodwillAmount: formData.deal_goodwill_amount,
                sellerShareBasis: formData.deal_seller_share_basis,
                sellerIsIndividual: formData.deal_seller_is_individual ?? true,
                buyerDiscountRatePct: formData.deal_buyer_discount_rate_pct,
                registrationDutyPct: formData.deal_registration_duty_pct,
              }}
              prefilled={{
                buyer_discount_rate_pct: navPrefillProvenance.deal_buyer_discount_rate_pct != null,
                registration_duty_pct: navPrefillProvenance.deal_registration_duty_pct != null,
              }}
              onChange={(field, value) => {
                if (typeof value === 'number' || value === undefined) {
                  onFieldChange(field, value as number | undefined)
                } else {
                  onAnyFieldChange(field, value)
                }
              }}
              disabled={disabled}
            />
          )}
        {/* Liquidation-specific advisor inputs — left-panel section that
            renders when liquidation_analysis is the pre-selected method.
            Drives the Phase 2-4 chain (cascade buckets, tax bridge,
            wind-down build-up, premise override). Engine defaults fire
            when fields are blank — the Statement of Affairs flags every
            estimated bucket. Reuses the nav step counter so left-panel
            numbering stays sequential. */}
        {sections.includes('liquidation_inputs') && (
          <Suspense key="liquidation_inputs" fallback={<BonusSectionFallback />}>
            <LiquidationInputsSection
              // When NAV mounts alongside (the canonical case for
              // `liquidation_analysis`), NAV already owns steps 5 / 5b / 5c /
              // 5d — so this section gets `5e` instead of colliding with the
              // NAV step circle. When NAV is absent we fall back to the bare
              // numeral so the badge keeps a sensible reading order.
              step={
                sectionHeaderSteps.nav != null && sections.includes('nav_asset_schedule')
                  ? `${sectionHeaderSteps.nav}e`
                  : (sectionHeaderSteps.nav ?? 0)
              }
              liqHeadcount={formData.liq_headcount as number | undefined}
              liqMonthlyRent={formData.liq_monthly_rent as number | undefined}
              liqPaidUpCapital={formData.liq_paid_up_capital as number | undefined}
              liqDeferredTax={formData.liq_deferred_tax as number | undefined}
              liqPremiseOverride={
                (formData.liq_premise_override as string | undefined) ?? undefined
              }
              liqRealisedCapitalGains={formData.liq_realised_capital_gains as number | undefined}
              liqTaxableReserves={formData.liq_taxable_reserves as number | undefined}
              liqRunwayMonthsOrderly={formData.liq_runway_months_orderly as number | undefined}
              liqRunwayMonthsForced={formData.liq_runway_months_forced as number | undefined}
              liqDistressWaccOrderly={formData.liq_distress_wacc_orderly as number | undefined}
              liqDistressWaccForced={formData.liq_distress_wacc_forced as number | undefined}
              liqIntangiblesUpliftPct={formData.liq_intangibles_uplift_pct as number | undefined}
              liqMultiplesValueOverride={
                formData.liq_multiples_value_override as number | undefined
              }
              liqLiabilityBuckets={{
                estate_costs: formData.liq_lb_estate_costs as number | undefined,
                secured: formData.liq_lb_secured as number | undefined,
                super_preferent_employees: formData.liq_lb_super_preferent_employees as
                  | number
                  | undefined,
                preferent_tax: formData.liq_lb_preferent_tax as number | undefined,
                preferent_other: formData.liq_lb_preferent_other as number | undefined,
                unsecured: formData.liq_lb_unsecured as number | undefined,
                subordinated: formData.liq_lb_subordinated as number | undefined,
              }}
              liqAssetOverrides={{
                cash: formData.liq_ao_cash as number | undefined,
                trade_receivables: formData.liq_ao_trade_receivables as number | undefined,
                other_receivables: formData.liq_ao_other_receivables as number | undefined,
                inventory_finished: formData.liq_ao_inventory_finished as number | undefined,
                inventory_wip: formData.liq_ao_inventory_wip as number | undefined,
                inventory_raw: formData.liq_ao_inventory_raw as number | undefined,
                land: formData.liq_ao_land as number | undefined,
                buildings: formData.liq_ao_buildings as number | undefined,
                machinery_equipment: formData.liq_ao_machinery_equipment as number | undefined,
                vehicles: formData.liq_ao_vehicles as number | undefined,
                it_equipment: formData.liq_ao_it_equipment as number | undefined,
                intangibles: formData.liq_ao_intangibles as number | undefined,
              }}
              prefillSourceHeadcount={
                (formData as { number_of_employees?: number }).number_of_employees ?? undefined
              }
              prefillSourceAnnualRent={
                latestCompleteYearlyFinancial?.rent_expense !== undefined &&
                latestCompleteYearlyFinancial?.rent_expense !== null
                  ? Number(latestCompleteYearlyFinancial.rent_expense)
                  : undefined
              }
              prefillSourcePaidUpCapital={
                // Prefer the dedicated `paid_up_capital` line when Hermes
                // exposes it (NBB code 1100 "Geplaatst kapitaal" / NL RGS
                // BlnPasEigVerVlk).  Fall back to `total_equity` as a
                // noisier proxy — equity is a superset (includes retained
                // earnings + reserves) but is always present on filings,
                // so it's a reasonable bootstrap the advisor can override.
                // Skips zero/negative values so the field stays blank and
                // the engine's cohort default fires.
                //
                // Audit 2026-05-10 (C1): the dedicated field is now typed
                // on `YearDataInput`, so the cast bypass is gone.  Hermes
                // doesn't yet populate this line — until it does, the
                // fallback to `total_equity` is the only signal.
                (() => {
                  const paidUp = latestCompleteYearlyFinancial?.paid_up_capital
                  if (paidUp != null && Number(paidUp) > 0) return Number(paidUp)
                  const equity = latestCompleteYearlyFinancial?.total_equity
                  if (equity != null && Number(equity) > 0) return Number(equity)
                  return undefined
                })()
              }
              prefillSourceDeferredTax={
                // `deferred_tax_liabilities` is the IAS 12 long-term tax
                // line (NBB code 168 / NL RGS BlnSch.LtgVoz).  No fallback
                // proxy — DTL is materially different from any other
                // long-term liability bucket, so a bad guess would
                // mislead.  Field stays blank when Hermes hasn't surfaced
                // it; the engine's cohort default fires instead.
                //
                // Audit 2026-05-10 (C2): the field is now typed on
                // `YearDataInput`.  The cast bypass is gone.
                (() => {
                  const dtl = latestCompleteYearlyFinancial?.deferred_tax_liabilities
                  if (dtl != null && Number(dtl) > 0) return Number(dtl)
                  return undefined
                })()
              }
              onFieldChange={onFieldChange}
              onAnyFieldChange={onAnyFieldChange}
              disabled={disabled}
            />
          </Suspense>
        )}
        {sections.includes('saas_metrics') && sectionHeaderSteps.saas != null && (
          <Suspense key="capital_history" fallback={<BonusSectionFallback />}>
            <CapitalHistorySection />
          </Suspense>
        )}
        {sections.includes('saas_metrics') && sectionHeaderSteps.saas != null && (
          <Suspense key="saas_metrics" fallback={<BonusSectionFallback />}>
            <SaasMetricsSection
              step={sectionHeaderSteps.saas}
              complete={saasSectionComplete}
              saasArr={formData.saas_arr as number | undefined}
              saasMrr={formData.saas_mrr as number | undefined}
              saasArrGrowthPct={formData.saas_arr_growth_pct as number | undefined}
              saasChurnPct={formData.saas_churn_pct as number | undefined}
              saasCustomerChurnPct={formData.saas_customer_churn_pct as number | undefined}
              saasNrrPct={formData.saas_nrr_pct as number | undefined}
              saasGrossMarginPct={formData.saas_gross_margin_pct as number | undefined}
              saasCac={formData.saas_cac as number | undefined}
              saasCustomerConcentrationPct={
                formData.saas_customer_concentration_pct as number | undefined
              }
              saasExpansionRevenuePct={formData.saas_expansion_revenue_pct as number | undefined}
              saasSmSpend={formData.saas_sm_spend as number | undefined}
              onFieldChange={onFieldChange}
              disabled={disabled}
              arrProjectionPreview={saasArrProjectionPreview}
              importedSaasProvenance={importedSaasProvenance}
              naceCode={(formData as { nace_code?: string | null }).nace_code ?? null}
              yearlyFinancials={formData.yearlyFinancials}
            />
          </Suspense>
        )}
        {sections.includes('revenue_quality') && sectionHeaderSteps.revenue != null && (
          <Suspense key="revenue_quality" fallback={<BonusSectionFallback />}>
            <RevenueQualitySection
              step={sectionHeaderSteps.revenue}
              revContractBacklog={formData.rev_contract_backlog as number | undefined}
              revRecurringAmount={formData.rev_recurring_amount as number | undefined}
              revTopClientAmount={formData.rev_top_client_amount as number | undefined}
              revGrossChurnPct={formData.rev_gross_churn_pct as number | undefined}
              revCapitalizedRdAmount={formData.rev_capitalized_rd_amount as number | undefined}
              latestRevenue={
                latestCompleteYearlyFinancial
                  ? Number(latestCompleteYearlyFinancial.revenue)
                  : undefined
              }
              effectiveMethods={methods}
              businessTypeId={businessTypeId}
              businessCategory={businessCategory}
              onFieldChange={onFieldChange}
              disabled={disabled}
            />
          </Suspense>
        )}
        {sections.includes('sde_owner_compensation') && sectionHeaderSteps.sde != null && (
          <Suspense key="sde_owner_compensation" fallback={<BonusSectionFallback />}>
            {sdeOwnerCompDoubleCountRisk && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mx-1 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Owner compensation is set as both an SDE add-back and an EBITDA normalization.
                    This may double-count the adjustment. Consider removing one.
                  </span>
                </div>
              </motion.div>
            )}
            <SdeOwnerCompensationSection
              step={sectionHeaderSteps.sde}
              ownerSalaryAddback={formData.owner_salary_addback as number | undefined}
              revenue={
                latestCompleteYearlyFinancial
                  ? Number(latestCompleteYearlyFinancial.revenue)
                  : undefined
              }
              ebitda={
                latestCompleteYearlyFinancial
                  ? Number(latestCompleteYearlyFinancial.ebitda)
                  : undefined
              }
              onFieldChange={onFieldChange}
              ownerRole={
                (formData as ValuationFormData & { owner_role?: 'working' | 'passive' }).owner_role
              }
              onOwnerRoleChange={
                onAnyFieldChange ? (role) => onAnyFieldChange('owner_role', role) : undefined
              }
              activeOwnersCount={
                (formData as ValuationFormData & { number_of_owners?: number }).number_of_owners
              }
              onActiveOwnersCountChange={
                onAnyFieldChange
                  ? (count) => onAnyFieldChange('number_of_owners', count)
                  : undefined
              }
              salaryPrefillSource={(() => {
                const applied = getSdeAppliedPrefill()
                if (!applied) return null
                return Number(formData.owner_salary_addback) === applied.value
                  ? sdeSalaryPrefill.source
                  : null
              })()}
              salaryPrefillYear={(() => {
                const applied = getSdeAppliedPrefill()
                if (!applied) return null
                return Number(formData.owner_salary_addback) === applied.value
                  ? sdeSalaryPrefill.sourceYear
                  : null
              })()}
              disabled={disabled}
            />
          </Suspense>
        )}
      </AnimatePresence>
      {process.env.NODE_ENV === 'development' && (
        <Suspense fallback={null}>
          <MethodPreviewAuditDevPanel />
        </Suspense>
      )}
    </>
  )
}
