import type {
  ManualValuationFormData,
  OfficialFinancialsPayload,
  OfficialVarianceAnalysis,
  OfficialVerificationBadge,
} from '../../../types/valuation'
import { hasUsableOfficialFinancialsContent } from '../../../utils/officialFinancialsContent'

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

  return {
    ...formData,
    averageNormalizedEbitda,
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
