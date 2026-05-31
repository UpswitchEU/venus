'use client'

import { RevenueQualitySection } from '@/components/calculator/sections/RevenueQualitySection'
import type { ManualValuationFormData, YearlyFinancials } from '@/types/valuation'
import { coerceFiniteNumber } from '@/utils/isFiniteNumeric'
import { isYearRowForecast } from '@/utils/yearData'

/** Revenue denominator for quality ratios — prefer latest complete year, else any booked revenue. */
export function resolveLatestRevenueForQuality(
  latestCompleteYearlyFinancial: YearlyFinancials | undefined,
  formData: ManualValuationFormData
): number | undefined {
  if (latestCompleteYearlyFinancial?.revenue != null) {
    const rev = coerceFiniteNumber(latestCompleteYearlyFinancial.revenue)
    if (rev !== undefined && rev > 0) return rev
  }
  const historical = (formData.yearlyFinancials ?? []).filter((row) => !isYearRowForecast(row))
  if (historical.length > 0) {
    const latestRow = historical.reduce((a, b) => (b.year > a.year ? b : a))
    const rev = coerceFiniteNumber(latestRow.revenue)
    if (rev !== undefined && rev > 0) return rev
  }
  const apiHistorical = (formData.historical_years_data ?? []).filter(
    (row) => !isYearRowForecast(row)
  )
  if (apiHistorical.length > 0) {
    const latestRow = apiHistorical.reduce((a, b) => (Number(b.year) > Number(a.year) ? b : a))
    const rev = coerceFiniteNumber(latestRow.revenue)
    if (rev !== undefined && rev > 0) return rev
  }
  const current = formData.current_year_data?.revenue
  if (current != null) {
    const rev = coerceFiniteNumber(current)
    if (rev !== undefined && rev > 0) return rev
  }
  const topLevelRevenue = coerceFiniteNumber(formData.revenue)
  if (topLevelRevenue !== undefined && topLevelRevenue > 0) return topLevelRevenue
  return undefined
}

export interface RevenueQualitySectionStackProps {
  step: number
  methods: readonly string[]
  businessTypeId?: string
  businessCategory?: unknown
  formData: ManualValuationFormData
  latestCompleteYearlyFinancial?: YearlyFinancials
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
}

export function RevenueQualitySectionStack({
  step,
  methods,
  businessTypeId,
  businessCategory,
  formData,
  latestCompleteYearlyFinancial,
  onFieldChange,
  disabled,
}: RevenueQualitySectionStackProps) {
  return (
    <RevenueQualitySection
      step={step}
      revContractBacklog={coerceFiniteNumber(formData.rev_contract_backlog)}
      revRecurringAmount={coerceFiniteNumber(formData.rev_recurring_amount)}
      revTopClientAmount={coerceFiniteNumber(formData.rev_top_client_amount)}
      revGrossChurnPct={coerceFiniteNumber(formData.rev_gross_churn_pct)}
      revCapitalizedRdAmount={coerceFiniteNumber(formData.rev_capitalized_rd_amount)}
      latestRevenue={resolveLatestRevenueForQuality(latestCompleteYearlyFinancial, formData)}
      effectiveMethods={[...methods]}
      businessTypeId={businessTypeId}
      businessCategory={businessCategory}
      onFieldChange={onFieldChange}
      disabled={disabled}
    />
  )
}
