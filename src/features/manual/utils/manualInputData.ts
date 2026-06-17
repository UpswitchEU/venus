import type {
  ManualValuationFormData,
  ValuationFormData as StoreValuationFormData,
  YearDataInput,
  YearlyFinancials,
} from '@/types/valuation'
import { mapLegalFormToBusinessStructure } from '@/utils/legalFormMapping'

export interface ManualInputCollectedData {
  companyName?: string
  kboNumber?: string
  legalForm?: string
  businessStructure?: string
  address?: string
  city?: string
  postalCode?: string
  naceCode?: string
  naceDescription?: string
  businessType?: string
  industry?: string
  country?: string
  yearFounded?: string
  ownerManagers?: number
  fteEmployees?: number
  yearlyFinancials?: YearlyFinancials[]
  current_year_data?: YearDataInput
  historical_years_data?: YearDataInput[]
  forecast_years_data?: YearDataInput[]
}

export interface BuildManualInputInitialDataParams {
  collectedData: ManualInputCollectedData
  formStoreData: Partial<StoreValuationFormData>
  formActivityCode?: string | null
  formNaceCode?: string | null
  restoredYearlyFinancials?: YearlyFinancials[]
}

export function buildManualInputInitialData({
  collectedData,
  formStoreData,
  formActivityCode,
  formNaceCode,
  restoredYearlyFinancials,
}: BuildManualInputInitialDataParams): Partial<ManualValuationFormData> {
  return {
    companyName: collectedData.companyName,
    kboNumber: collectedData.kboNumber,
    legalForm: collectedData.legalForm,
    businessStructure:
      collectedData.businessStructure ||
      mapLegalFormToBusinessStructure(collectedData.legalForm || ''),
    address: collectedData.address,
    city: collectedData.city,
    naceCode: formActivityCode || formNaceCode || collectedData.naceCode,
    canonicalNaceCode: formNaceCode || '',
    naceDescription: collectedData.naceDescription,
    businessType: collectedData.businessType,
    industry: collectedData.industry,
    country: collectedData.country,
    postal_code: collectedData.postalCode,
    yearFounded: collectedData.yearFounded,
    ownerManagers:
      typeof formStoreData.number_of_owners === 'number' && formStoreData.number_of_owners > 0
        ? formStoreData.number_of_owners
        : collectedData.ownerManagers,
    fteEmployees: formStoreData.number_of_employees ?? collectedData.fteEmployees,
    current_year_data: formStoreData.current_year_data ?? collectedData.current_year_data,
    historical_years_data: formStoreData.historical_years_data,
    forecast_years_data: formStoreData.forecast_years_data,
    filingYearConfirmed: formStoreData.filing_year_confirmed,
    dcf_input_mode: formStoreData.dcf_input_mode,
    real_estate_treatment: formStoreData.real_estate_treatment,
    exclude_real_estate: formStoreData.exclude_real_estate,
    real_estate_market_value: formStoreData.real_estate_market_value,
    real_estate_book_value: formStoreData.real_estate_book_value,
    estimated_market_rent: formStoreData.estimated_market_rent,
    multiple_calibration_adjustment: formStoreData.multiple_calibration_adjustment,
    multiple_calibration_note: formStoreData.multiple_calibration_note,
    effective_multiple_override: formStoreData.effective_multiple_override,
    effective_multiple_override_note: formStoreData.effective_multiple_override_note,
    historical_ebitda_weighting_mode: formStoreData.historical_ebitda_weighting_mode,
    historical_ebitda_weights: formStoreData.historical_ebitda_weights,
    show_enterprise_to_equity_bridge: formStoreData.show_enterprise_to_equity_bridge,
    owner_salary_addback: formStoreData.owner_salary_addback,
    owner_role: formStoreData.owner_role,
    yearlyFinancials: restoredYearlyFinancials,
  }
}

export interface BuildManualLiveValuationSubmitDataParams {
  initialData: Partial<ManualValuationFormData>
  liveData?: Partial<ManualValuationFormData> | null
  fallbackYearlyFinancials: YearlyFinancials[]
}

export function buildManualLiveValuationSubmitData({
  initialData,
  liveData,
  fallbackYearlyFinancials,
}: BuildManualLiveValuationSubmitDataParams): ManualValuationFormData {
  const live = liveData ?? {}
  return {
    ...initialData,
    ...live,
    companyName: live.companyName ?? initialData.companyName ?? '',
    businessType: live.businessType ?? initialData.businessType ?? '',
    businessStructure: live.businessStructure ?? initialData.businessStructure ?? '',
    industry: live.industry ?? initialData.industry ?? '',
    country: live.country ?? initialData.country ?? '',
    yearFounded: live.yearFounded ?? initialData.yearFounded ?? '',
    ownerManagers: live.ownerManagers ?? initialData.ownerManagers ?? 1,
    fteEmployees: live.fteEmployees ?? initialData.fteEmployees ?? 0,
    current_year_data: live.current_year_data ?? initialData.current_year_data,
    historical_years_data: live.historical_years_data ?? initialData.historical_years_data,
    forecast_years_data: live.forecast_years_data ?? initialData.forecast_years_data,
    filingYearConfirmed: live.filingYearConfirmed ?? initialData.filingYearConfirmed,
    yearlyFinancials:
      live.yearlyFinancials ?? initialData.yearlyFinancials ?? fallbackYearlyFinancials,
  }
}
