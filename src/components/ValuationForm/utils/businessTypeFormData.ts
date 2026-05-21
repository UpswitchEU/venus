import type { BusinessType } from '../../../services/businessTypesApi'
import type { ValuationFormData } from '../../../types/valuation'

type BusinessTypeFormSource = Pick<BusinessType, 'id'> & Partial<BusinessType>

export function buildBusinessTypeFormData(
  businessType: BusinessTypeFormSource,
  fallbackIndustry = 'services'
): Partial<ValuationFormData> {
  const industry = businessType.industry || businessType.industryMapping || fallbackIndustry

  return {
    business_type_id: businessType.id,
    business_model: businessType.id,
    industry,
    subIndustry: businessType.category,
    _internal_dcf_preference: businessType.dcfPreference,
    _internal_multiples_preference: businessType.multiplesPreference,
    _internal_owner_dependency_impact: businessType.ownerDependencyImpact,
    _internal_key_metrics: businessType.keyMetrics,
    _internal_typical_employee_range: businessType.typicalEmployeeRange,
    _internal_typical_revenue_range: businessType.typicalRevenueRange,
  }
}
