'use client'

import { LiquidationInputsSection } from '@/components/calculator/sections/LiquidationInputsSection'
import type { ManualValuationFormData, YearlyFinancials } from '@/types/valuation'
import {
  LIQUIDATION_ASSET_CLASS_CODES,
  LIQUIDATION_LIABILITY_BUCKET_CODES,
} from './liquidationInputConfig'
import {
  readLiquidationAssetOverrideFormValues,
  readLiquidationLiabilityBucketFormValues,
} from './liquidationInputModel'

export interface LiquidationSectionStackProps {
  navStep?: number
  navSectionActive: boolean
  formData: ManualValuationFormData
  latestCompleteYearlyFinancial?: YearlyFinancials
  onFieldChange: (field: string, value: number | undefined) => void
  onAnyFieldChange?: (field: string, value: unknown) => void
  disabled?: boolean
}

function positiveNumberOrUndefined(value: unknown): number | undefined {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export function deriveLiquidationPaidUpCapitalPrefillSource(
  latestCompleteYearlyFinancial?: YearlyFinancials
): number | undefined {
  return (
    positiveNumberOrUndefined(latestCompleteYearlyFinancial?.paid_up_capital) ??
    positiveNumberOrUndefined(latestCompleteYearlyFinancial?.total_equity)
  )
}

export function deriveLiquidationDeferredTaxPrefillSource(
  latestCompleteYearlyFinancial?: YearlyFinancials
): number | undefined {
  return positiveNumberOrUndefined(latestCompleteYearlyFinancial?.deferred_tax_liabilities)
}

export function LiquidationSectionStack({
  navStep,
  navSectionActive,
  formData,
  latestCompleteYearlyFinancial,
  onFieldChange,
  onAnyFieldChange,
  disabled,
}: LiquidationSectionStackProps) {
  const step = navStep != null && navSectionActive ? `${navStep}e` : (navStep ?? 0)

  return (
    <LiquidationInputsSection
      step={step}
      liqHeadcount={formData.liq_headcount as number | undefined}
      liqMonthlyRent={formData.liq_monthly_rent as number | undefined}
      liqPaidUpCapital={formData.liq_paid_up_capital as number | undefined}
      liqDeferredTax={formData.liq_deferred_tax as number | undefined}
      liqPremiseOverride={(formData.liq_premise_override as string | undefined) ?? undefined}
      liqRealisedCapitalGains={formData.liq_realised_capital_gains as number | undefined}
      liqTaxableReserves={formData.liq_taxable_reserves as number | undefined}
      liqRunwayMonthsOrderly={formData.liq_runway_months_orderly as number | undefined}
      liqRunwayMonthsForced={formData.liq_runway_months_forced as number | undefined}
      liqDistressWaccOrderly={formData.liq_distress_wacc_orderly as number | undefined}
      liqDistressWaccForced={formData.liq_distress_wacc_forced as number | undefined}
      liqIntangiblesUpliftPct={formData.liq_intangibles_uplift_pct as number | undefined}
      liqMultiplesValueOverride={formData.liq_multiples_value_override as number | undefined}
      liqLiabilityBuckets={readLiquidationLiabilityBucketFormValues(
        formData,
        LIQUIDATION_LIABILITY_BUCKET_CODES
      )}
      liqAssetOverrides={readLiquidationAssetOverrideFormValues(
        formData,
        LIQUIDATION_ASSET_CLASS_CODES
      )}
      prefillSourceHeadcount={
        (formData as ManualValuationFormData & { number_of_employees?: number })
          .number_of_employees ?? undefined
      }
      prefillSourceAnnualRent={
        latestCompleteYearlyFinancial?.rent_expense !== undefined &&
        latestCompleteYearlyFinancial?.rent_expense !== null
          ? Number(latestCompleteYearlyFinancial.rent_expense)
          : undefined
      }
      prefillSourcePaidUpCapital={deriveLiquidationPaidUpCapitalPrefillSource(
        latestCompleteYearlyFinancial
      )}
      prefillSourceDeferredTax={deriveLiquidationDeferredTaxPrefillSource(
        latestCompleteYearlyFinancial
      )}
      onFieldChange={onFieldChange}
      onAnyFieldChange={onAnyFieldChange}
      disabled={disabled}
    />
  )
}
