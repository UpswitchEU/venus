'use client'

import { useMemo } from 'react'
import { CapitalHistorySection } from '@/components/calculator/sections/CapitalHistorySection'
import { SaasMetricsSection } from '@/components/calculator/sections/SaasMetricsSection'
import { deriveSaasArrProjectionPreview } from '@/components/calculator/sections/saasArrProjectionPreview'
import type { ManualValuationFormData } from '@/types/valuation'

export interface ImportedSaasProvenance {
  source?: string
  confidence?: number
  derivation_method?: string
  fiscal_year?: number
}

export interface SaasMetricsSectionStackProps {
  step: number
  methods: readonly string[]
  formData: ManualValuationFormData
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
}

export function deriveImportedSaasProvenance(
  businessContext: ManualValuationFormData['business_context']
): ImportedSaasProvenance | null {
  return typeof businessContext === 'object' &&
    businessContext &&
    '_imported_saas_provenance' in businessContext
    ? ((businessContext as Record<string, unknown>)
        ._imported_saas_provenance as ImportedSaasProvenance | null)
    : null
}

export function deriveSaasSectionComplete(formData: ManualValuationFormData): boolean {
  return (
    ((formData.saas_arr as number | undefined) ?? 0) > 0 ||
    ((formData.saas_mrr as number | undefined) ?? 0) > 0 ||
    formData.saas_arr_growth_pct != null ||
    formData.saas_gross_margin_pct != null
  )
}

export function SaasMetricsSectionStack({
  step,
  methods,
  formData,
  onFieldChange,
  disabled,
}: SaasMetricsSectionStackProps) {
  const hasDcfMethod = methods.includes('dcf')
  const arrProjectionPreview = useMemo(
    () =>
      hasDcfMethod
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
      hasDcfMethod,
      formData.yearlyFinancials,
      formData.saas_arr,
      formData.saas_mrr,
      formData.saas_arr_growth_pct,
      formData.saas_nrr_pct,
      formData.saas_churn_pct,
      formData.saas_expansion_revenue_pct,
    ]
  )

  const complete = deriveSaasSectionComplete(formData)
  const importedSaasProvenance = deriveImportedSaasProvenance(formData.business_context)

  return (
    <>
      <CapitalHistorySection />
      <SaasMetricsSection
        step={step}
        complete={complete}
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
        arrProjectionPreview={arrProjectionPreview}
        importedSaasProvenance={importedSaasProvenance}
        naceCode={
          (formData as ManualValuationFormData & { nace_code?: string | null }).nace_code ?? null
        }
        yearlyFinancials={formData.yearlyFinancials}
      />
    </>
  )
}
