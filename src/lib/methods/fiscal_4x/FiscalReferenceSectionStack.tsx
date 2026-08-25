'use client'

import { FiscalInputsSection } from '@/components/calculator/sections/FiscalInputsSection'
import type { ManualValuationFormData, YearlyFinancials } from '@/types/valuation'
import { shouldRenderFiscalInputs } from './sectionEligibility'

export interface FiscalReferenceSectionStackProps {
  methods: readonly string[]
  bonusSections: readonly string[]
  formData: ManualValuationFormData
  latestCompleteYearlyFinancial?: YearlyFinancials
  previewCurrencyFormatter: Intl.NumberFormat
  fiscalStep?: number
  firmCountryCode?: string
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
  fiscalWeightedNormalizedEbitda?: number
  fiscalWeightedHistoricalYearCount?: number
}

export function FiscalReferenceSectionStack({
  bonusSections,
  formData,
  fiscalStep,
  onFieldChange,
  disabled,
}: FiscalReferenceSectionStackProps) {
  const showFiscalInputs = shouldRenderFiscalInputs(bonusSections) && fiscalStep != null

  if (!showFiscalInputs) return null

  return (
    <FiscalInputsSection
      step={fiscalStep}
      fiscalAcquisitionCost={formData.fiscal_acquisition_cost as number | undefined}
      fiscalAnchor2Value={formData.fiscal_anchor_2_value as number | undefined}
      fiscalAnchor3Value={formData.fiscal_anchor_3_value as number | undefined}
      fiscalAnchor4Value={formData.fiscal_anchor_4_value as number | undefined}
      onFieldChange={onFieldChange}
      disabled={disabled}
    />
  )
}
