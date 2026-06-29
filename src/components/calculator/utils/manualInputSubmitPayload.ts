import type {
  ManualValuationFormData,
  OfficialFinancialsPayload,
  OfficialVarianceAnalysis,
  OfficialVerificationBadge,
} from '../../../types/valuation'
import { hasUsableOfficialFinancialsContent } from '../../../utils/officialFinancialsContent'
import {
  buildForecastYearDataFromYearlyFinancials,
  sanitizeForecastRowsForDcfInputMode,
  yearlyFinancialsContainForecastRows,
} from '../../../utils/yearData'

interface ManualInputSubmitTrustData {
  official_financials?: OfficialFinancialsPayload | null
  official_variance_analysis?: OfficialVarianceAnalysis | null
  official_verification_badge?: OfficialVerificationBadge | null
}

export function buildManualInputSubmitPayload({
  averageNormalizedEbitda,
  formData,
  trustFormData,
}: {
  averageNormalizedEbitda: number
  formData: ManualValuationFormData
  trustFormData: ManualInputSubmitTrustData
}): ManualValuationFormData {
  const officialFinancials = trustFormData.official_financials
  const trustOfficialUsable = hasUsableOfficialFinancialsContent(officialFinancials)
  const dcfInputMode = formData.dcf_input_mode ?? 'ebitda'
  const forecastYearsData = yearlyFinancialsContainForecastRows(formData.yearlyFinancials)
    ? buildForecastYearDataFromYearlyFinancials(formData.yearlyFinancials, {
        dcfInputMode,
      })
    : formData.forecast_years_data
      ? sanitizeForecastRowsForDcfInputMode(formData.forecast_years_data, { dcfInputMode })
      : formData.forecast_years_data

  return {
    ...formData,
    averageNormalizedEbitda,
    ...(forecastYearsData !== undefined && { forecast_years_data: forecastYearsData }),
    ...(trustOfficialUsable && officialFinancials && { official_financials: officialFinancials }),
    ...(trustOfficialUsable &&
      trustFormData.official_variance_analysis != null && {
        official_variance_analysis: trustFormData.official_variance_analysis,
      }),
    ...(trustOfficialUsable &&
      trustFormData.official_verification_badge != null && {
        official_verification_badge: trustFormData.official_verification_badge,
      }),
  } as ManualValuationFormData
}
