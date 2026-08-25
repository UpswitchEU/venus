'use client'

import { AnimatePresence } from 'framer-motion'
import { lazy, Suspense, useMemo } from 'react'
import {
  type GetBonusSectionsSaasSignals,
  getBonusSections,
  getBonusSectionsForMethods,
} from '@/constants/methodFieldConfig'
import type { TerminalValueMethod } from '@/lib/methods/dcf/DcfGlobalAssumptionsSectionStack'
import { shouldMountDcfGlobalAssumptionsSectionStack } from '@/lib/methods/dcf/sectionEligibility'
import { shouldMountFiscalReferenceSectionStack } from '@/lib/methods/fiscal_4x/sectionEligibility'
import type { ManualValuationFormData as ValuationFormData } from '@/types/valuation'
import { getLatestCompleteYearlyFinancial } from '@/utils/yearlyFinancials'

const MethodPreviewAuditDevPanel = lazy(() =>
  import('./MethodPreviewAuditDevPanel').then((m) => ({
    default: m.MethodPreviewAuditDevPanel,
  }))
)
const DcfGlobalAssumptionsSectionStack = lazy(() =>
  import('@/lib/methods/dcf/DcfGlobalAssumptionsSectionStack').then((m) => ({
    default: m.DcfGlobalAssumptionsSectionStack,
  }))
)
const FiscalReferenceSectionStack = lazy(() =>
  import('@/lib/methods/fiscal_4x/FiscalReferenceSectionStack').then((m) => ({
    default: m.FiscalReferenceSectionStack,
  }))
)
const SaasMetricsSectionStack = lazy(() =>
  import('@/lib/methods/arr_multiple/SaasMetricsSectionStack').then((m) => ({
    default: m.SaasMetricsSectionStack,
  }))
)
const LiquidationSectionStack = lazy(() =>
  import('@/lib/methods/liquidation_analysis/LiquidationSectionStack').then((m) => ({
    default: m.LiquidationSectionStack,
  }))
)
const AdjustedNavSectionStack = lazy(() =>
  import('@/lib/methods/adjusted_nav/AdjustedNavSectionStack').then((m) => ({
    default: m.AdjustedNavSectionStack,
  }))
)
const RevenueQualitySectionStack = lazy(() =>
  import('@/lib/methods/revenue_multiple/RevenueQualitySectionStack').then((m) => ({
    default: m.RevenueQualitySectionStack,
  }))
)
const SdeOwnerCompensationSectionStack = lazy(() =>
  import('@/lib/methods/sde_multiple/SdeOwnerCompensationSectionStack').then((m) => ({
    default: m.SdeOwnerCompensationSectionStack,
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
  businessCategory?: unknown
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
  const methods = effectiveMethods ?? [effectiveMethod]
  const sections =
    methods.length > 1
      ? getBonusSectionsForMethods(methods, businessCategory, businessTypeId, saasSignals)
      : getBonusSections(effectiveMethod, businessCategory, businessTypeId, saasSignals)
  const latestCompleteYearlyFinancial = useMemo(
    () => getLatestCompleteYearlyFinancial(formData.yearlyFinancials ?? []),
    [formData.yearlyFinancials]
  )

  const shouldMountFiscalStack = shouldMountFiscalReferenceSectionStack({
    methods,
    firmCountryCode,
    bonusSections: sections,
  })
  const shouldMountDcfGlobalStack = shouldMountDcfGlobalAssumptionsSectionStack({
    bonusSections: sections,
    suppressDcfGlobalAssumptions,
    terminalValueMethod,
    onTerminalValueMethodChange,
    dcfGlobalStep: sectionHeaderSteps.dcfGlobal,
  })
  if (sections.length === 0) return null

  return (
    <>
      <AnimatePresence mode="sync">
        {shouldMountFiscalStack && (
          <Suspense key="fiscal_reference_stack" fallback={<BonusSectionFallback />}>
            <FiscalReferenceSectionStack
              methods={methods}
              bonusSections={sections}
              formData={formData}
              latestCompleteYearlyFinancial={latestCompleteYearlyFinancial}
              previewCurrencyFormatter={previewCurrencyFormatter}
              fiscalStep={sectionHeaderSteps.fiscal}
              firmCountryCode={firmCountryCode}
              onFieldChange={onFieldChange}
              disabled={disabled}
              fiscalWeightedNormalizedEbitda={fiscalWeightedNormalizedEbitda}
              fiscalWeightedHistoricalYearCount={fiscalWeightedHistoricalYearCount}
            />
          </Suspense>
        )}
        {shouldMountDcfGlobalStack && terminalValueMethod && onTerminalValueMethodChange && (
          <Suspense key="dcf_global_assumptions" fallback={<BonusSectionFallback />}>
            <DcfGlobalAssumptionsSectionStack
              className={shouldMountFiscalStack ? 'mt-6' : undefined}
              step={sectionHeaderSteps.dcfGlobal as number}
              formData={formData}
              terminalValueMethod={terminalValueMethod}
              onTerminalValueMethodChange={onTerminalValueMethodChange}
              onDiscountingConventionChange={(convention) => {
                onAnyFieldChange?.('dcf_discounting_convention', convention)
              }}
              onFieldChange={onFieldChange}
              onApplyDcfPercentAutofill={onApplyDcfPercentAutofill}
              canApplyDcfPercentAutofill={canApplyDcfPercentAutofill}
              disabled={disabled}
            />
          </Suspense>
        )}
        {sections.includes('nav_asset_schedule') && sectionHeaderSteps.nav != null && (
          <Suspense key="adjusted_nav_stack" fallback={<BonusSectionFallback />}>
            <AdjustedNavSectionStack
              step={sectionHeaderSteps.nav}
              formData={formData}
              latestCompleteYearlyFinancial={latestCompleteYearlyFinancial}
              onFieldChange={onFieldChange}
              onAnyFieldChange={onAnyFieldChange}
              disabled={disabled}
            />
          </Suspense>
        )}
        {sections.includes('liquidation_inputs') && (
          <Suspense key="liquidation_stack" fallback={<BonusSectionFallback />}>
            <LiquidationSectionStack
              navStep={sectionHeaderSteps.nav}
              navSectionActive={sections.includes('nav_asset_schedule')}
              formData={formData}
              latestCompleteYearlyFinancial={latestCompleteYearlyFinancial}
              onFieldChange={onFieldChange}
              onAnyFieldChange={onAnyFieldChange}
              disabled={disabled}
            />
          </Suspense>
        )}
        {sections.includes('saas_metrics') && sectionHeaderSteps.saas != null && (
          <Suspense key="saas_metrics_stack" fallback={<BonusSectionFallback />}>
            <SaasMetricsSectionStack
              step={sectionHeaderSteps.saas}
              methods={methods}
              formData={formData}
              onFieldChange={onFieldChange}
              disabled={disabled}
            />
          </Suspense>
        )}
        {sections.includes('revenue_quality') && sectionHeaderSteps.revenue != null && (
          <Suspense key="revenue_quality" fallback={<BonusSectionFallback />}>
            <RevenueQualitySectionStack
              step={sectionHeaderSteps.revenue}
              methods={methods}
              formData={formData}
              latestCompleteYearlyFinancial={latestCompleteYearlyFinancial}
              businessTypeId={businessTypeId}
              businessCategory={businessCategory}
              onFieldChange={onFieldChange}
              disabled={disabled}
            />
          </Suspense>
        )}
        {sections.includes('sde_owner_compensation') && sectionHeaderSteps.sde != null && (
          <Suspense key="sde_owner_compensation" fallback={<BonusSectionFallback />}>
            <SdeOwnerCompensationSectionStack
              step={sectionHeaderSteps.sde}
              methods={methods}
              formData={formData}
              latestCompleteYearlyFinancial={latestCompleteYearlyFinancial}
              onFieldChange={onFieldChange}
              onAnyFieldChange={onAnyFieldChange}
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
