'use client'

import { RevenueQualitySection } from '@/components/calculator/sections/RevenueQualitySection'
import type { ManualValuationFormData, YearlyFinancials } from '@/types/valuation'

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
      revContractBacklog={formData.rev_contract_backlog as number | undefined}
      revRecurringAmount={formData.rev_recurring_amount as number | undefined}
      revTopClientAmount={formData.rev_top_client_amount as number | undefined}
      revGrossChurnPct={formData.rev_gross_churn_pct as number | undefined}
      revCapitalizedRdAmount={formData.rev_capitalized_rd_amount as number | undefined}
      latestRevenue={
        latestCompleteYearlyFinancial ? Number(latestCompleteYearlyFinancial.revenue) : undefined
      }
      effectiveMethods={[...methods]}
      businessTypeId={businessTypeId}
      businessCategory={businessCategory}
      onFieldChange={onFieldChange}
      disabled={disabled}
    />
  )
}
