'use client'

import { LiquidationInputsSection } from '@/components/calculator/sections/LiquidationInputsSection'
import type { ManualValuationFormData, YearlyFinancials } from '@/types/valuation'

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
