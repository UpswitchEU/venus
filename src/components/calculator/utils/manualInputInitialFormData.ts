import type { ManualValuationFormData } from '../../../types/valuation'
import { normalizeBusinessTypeId } from '../../../utils/businessTypeIdAliases'
import {
  isFilingYearConfirmedValue,
  normalizeHistoricalYearsForFiling,
} from '../../../utils/fiscalYear'
import { sanitizeForecastRowsForDcfInputMode } from '../../../utils/yearData'
import {
  getSeedCurrentYearData,
  getSeedYearlyFinancials,
  isSessionSeedYearStale,
} from './manualFinancialSeeds'

export function buildManualInputInitialFormData(
  initialData: Partial<ManualValuationFormData>
): ManualValuationFormData {
  const dcfInputMode = initialData.dcf_input_mode ?? 'ebitda'
  return {
    ...initialData,
    companyName: initialData.companyName || '',
    kboNumber: initialData.kboNumber || '',
    legalForm: initialData.legalForm || '',
    address: initialData.address || '',
    naceCode: initialData.naceCode || '',
    canonicalNaceCode: initialData.canonicalNaceCode?.trim() || initialData.naceCode?.trim() || '',
    naceDescription: initialData.naceDescription || '',
    businessType: normalizeBusinessTypeId(initialData.businessType) || '',
    businessTypeCode:
      normalizeBusinessTypeId(initialData.businessTypeCode) || initialData.businessTypeCode || '',
    industry: initialData.industry || '',
    country: initialData.country || '',
    yearFounded: initialData.yearFounded || '',
    businessStructure: initialData.businessStructure || '',
    ownerManagers: initialData.ownerManagers || 1,
    fteEmployees: initialData.fteEmployees ?? 5,
    yearlyFinancials: getSeedYearlyFinancials(initialData),
    current_year_data: getSeedCurrentYearData(initialData),
    historical_years_data: normalizeHistoricalYearsForFiling(
      initialData.historical_years_data,
      initialData.filingYearConfirmed
    ),
    forecast_years_data: initialData.forecast_years_data
      ? sanitizeForecastRowsForDcfInputMode(initialData.forecast_years_data, { dcfInputMode })
      : initialData.forecast_years_data,
    filingYearConfirmed: isSessionSeedYearStale(initialData)
      ? false
      : isFilingYearConfirmedValue(initialData.filingYearConfirmed),
    dcf_input_mode: dcfInputMode,
  } as ManualValuationFormData
}
