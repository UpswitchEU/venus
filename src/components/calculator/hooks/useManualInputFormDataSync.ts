import { type MutableRefObject, useCallback, useEffect, useRef } from 'react'
import type { ManualValuationFormData, YearlyFinancials } from '../../../types/valuation'
import { buildCurrentYearData } from '../../../utils/yearData'

export interface UseManualInputFormDataSyncParams {
  formData: ManualValuationFormData
  latestCompleteYearlyFinancial?: YearlyFinancials
  onFormDataChange?: (data: Record<string, unknown>) => void
  storeBusinessModel?: string
  formDataRef?: MutableRefObject<Record<string, unknown> | null>
}

export function useManualInputFormDataSync({
  formData,
  latestCompleteYearlyFinancial,
  onFormDataChange,
  storeBusinessModel,
  formDataRef,
}: UseManualInputFormDataSyncParams) {
  const onFormDataChangeRef = useRef(onFormDataChange)
  onFormDataChangeRef.current = onFormDataChange

  if (formDataRef?.current != null) {
    const latestHistorical = [...formData.yearlyFinancials]
      .filter((year) => !year.isForecast)
      .sort((a, b) => Number(b.year) - Number(a.year))[0]

    Object.assign(formDataRef.current, {
      yearlyFinancials: formData.yearlyFinancials,
      current_year_data: latestHistorical
        ? buildCurrentYearData({
            year: Number.parseInt(latestHistorical.year, 10),
            revenue: latestHistorical.revenue,
            ebitda: latestHistorical.ebitda,
            currentYearData: formData.current_year_data,
          })
        : formData.current_year_data,
      ebitda: latestCompleteYearlyFinancial?.ebitda,
    })
  }

  const syncFormData = useCallback(() => {
    if (!onFormDataChangeRef.current) return
    const current = latestCompleteYearlyFinancial

    // Registry + NACE/SBI must flow to ManualLayout -> Zustand on every change
    // so session autosave and refresh never race ahead with stale company data.
    onFormDataChangeRef.current({
      companyName: formData.companyName,
      kboNumber: formData.kboNumber,
      legalForm: formData.legalForm,
      address: formData.address,
      naceCode: formData.naceCode,
      canonicalNaceCode: formData.canonicalNaceCode,
      naceDescription: formData.naceDescription,
      industry: formData.industry,
      country: formData.country,
      businessModel: formData.business_model ?? storeBusinessModel,
      yearFounded: formData.yearFounded,
      ownerManagers: formData.ownerManagers,
      fteEmployees: formData.fteEmployees,
      businessType: formData.businessType,
      revenue: current?.revenue,
      ebitda: current?.ebitda,
      yearlyFinancials: formData.yearlyFinancials,
      historical_years_data: formData.historical_years_data,
      forecast_years_data: formData.forecast_years_data,
      dcf_input_mode: formData.dcf_input_mode,
      current_year_data: current
        ? buildCurrentYearData({
            year: Number.parseInt(current.year, 10),
            revenue: current.revenue,
            ebitda: current.ebitda,
            currentYearData: formData.current_year_data,
          })
        : formData.current_year_data,
      nav_real_estate_adjustment: formData.nav_real_estate_adjustment,
      nav_inventory_adjustment: formData.nav_inventory_adjustment,
      nav_hidden_reserves: formData.nav_hidden_reserves,
      nav_goodwill_writeoff: formData.nav_goodwill_writeoff,
      nav_receivables_adjustment: formData.nav_receivables_adjustment,
      nav_other_revaluations: formData.nav_other_revaluations,
      nav_tax_latency_pct: formData.nav_tax_latency_pct,
      nav_off_balance_items: formData.nav_off_balance_items,
      dcf_revenue_growth_pct: formData.dcf_revenue_growth_pct,
      dcf_ebitda_margin_pct: formData.dcf_ebitda_margin_pct,
      dcf_capex_pct: formData.dcf_capex_pct,
      dcf_da_pct: formData.dcf_da_pct,
      dcf_nwc_pct: formData.dcf_nwc_pct,
      dcf_tax_rate_pct: formData.dcf_tax_rate_pct,
      dcf_wacc_pct: formData.dcf_wacc_pct,
      dcf_terminal_growth_pct: formData.dcf_terminal_growth_pct,
      dcf_exit_multiple: formData.dcf_exit_multiple,
      dcf_risk_free_rate_pct: formData.dcf_risk_free_rate_pct,
      dcf_equity_risk_premium_pct: formData.dcf_equity_risk_premium_pct,
      dcf_beta: formData.dcf_beta,
      dcf_cost_of_debt_pct: formData.dcf_cost_of_debt_pct,
      dcf_debt_equity_pct: formData.dcf_debt_equity_pct,
      dcf_tax_shield_pct: formData.dcf_tax_shield_pct,
      dcf_terminal_value_method: formData.dcf_terminal_value_method,
      saas_arr: formData.saas_arr,
      saas_mrr: formData.saas_mrr,
      saas_arr_growth_pct: formData.saas_arr_growth_pct,
      saas_churn_pct: formData.saas_churn_pct,
      saas_customer_churn_pct: formData.saas_customer_churn_pct,
      saas_nrr_pct: formData.saas_nrr_pct,
      saas_gross_margin_pct: formData.saas_gross_margin_pct,
      saas_cac: formData.saas_cac,
      saas_customer_concentration_pct: formData.saas_customer_concentration_pct,
      saas_expansion_revenue_pct: formData.saas_expansion_revenue_pct,
      saas_sm_spend: formData.saas_sm_spend,
      exclude_real_estate: formData.exclude_real_estate,
      real_estate_book_value: formData.real_estate_book_value,
      estimated_market_rent: formData.estimated_market_rent,
      rev_recurring_pct: formData.rev_recurring_pct,
      rev_recurring_amount: formData.rev_recurring_amount,
      rev_top_client_concentration_pct: formData.rev_top_client_concentration_pct,
      rev_top_client_amount: formData.rev_top_client_amount,
      rev_contract_backlog: formData.rev_contract_backlog,
      rev_gross_churn_pct: formData.rev_gross_churn_pct,
      owner_salary_addback: formData.owner_salary_addback,
    })
  }, [formData, latestCompleteYearlyFinancial, storeBusinessModel])

  useEffect(() => {
    syncFormData()
    const timer = setTimeout(syncFormData, 300)
    return () => clearTimeout(timer)
  }, [syncFormData])
}
