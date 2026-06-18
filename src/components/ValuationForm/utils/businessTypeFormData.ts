import type { KBOCompany, BusinessType as SearchBusinessType } from '../../../design-system'
import type { BusinessType } from '../../../services/businessTypesApi'
import type { BusinessTypeSegmentInput, ValuationFormData } from '../../../types/valuation'
import { normalizeBusinessTypeId } from '../../../utils/businessTypeIdAliases'

type BusinessTypeFormSource = Pick<BusinessType, 'id'> & Partial<BusinessType>
type SegmentBasis = NonNullable<BusinessTypeSegmentInput['basis']>

interface SegmentMultipleSeed {
  basis?: SegmentBasis
  multiple?: number
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function inferSegmentBasis(value: unknown): SegmentBasis | undefined {
  const token = String(value ?? '')
    .trim()
    .toLowerCase()
  if (!token) return undefined
  if (token.includes('sde')) return 'SDE'
  if (token.includes('revenue') || token.includes('omzet')) return 'Revenue'
  if (token.includes('ebitda')) return 'EBITDA'
  if (token.includes('ebit')) return 'EBIT'
  return undefined
}

function primaryMultipleSeed(businessType: BusinessTypeFormSource): SegmentMultipleSeed {
  const primary = businessType.primaryMultiple
  const primaryMultiple = finiteNumber(primary?.median)
  if (primaryMultiple !== undefined) {
    return {
      basis: inferSegmentBasis(primary?.basis) ?? inferSegmentBasis(primary?.label),
      multiple: primaryMultiple,
    }
  }

  const evEbitda = finiteNumber(businessType.evEbitdaMedian)
  if (evEbitda !== undefined) {
    return {
      basis: 'EBITDA',
      multiple: evEbitda,
    }
  }

  const evRevenue = finiteNumber(businessType.evRevenueMedian)
  if (evRevenue !== undefined) {
    return {
      basis: 'Revenue',
      multiple: evRevenue,
    }
  }

  const peRatio = finiteNumber(businessType.peRatioMedian)
  if (peRatio !== undefined) {
    return {
      multiple: peRatio,
    }
  }

  return {}
}

function firstSegmentEarnings(segment?: BusinessTypeSegmentInput): number | string | null {
  if (!segment) return null
  return (
    segment.earnings ??
    segment.adjusted_earnings ??
    segment.adjusted_ebitda ??
    segment.ebitda ??
    segment.revenue ??
    null
  )
}

function normalizeWeightToPercent(value: unknown): number | undefined {
  const numeric = finiteNumber(value)
  if (numeric === undefined || numeric < 0) return undefined
  return numeric <= 1 ? numeric * 100 : numeric
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100
}

function rebalanceWeightsToHundred(weights: number[]): number[] {
  if (weights.length === 0) return []

  const rounded = weights.map((weight) => roundPercent(Math.max(0, weight)))
  const total = rounded.reduce((sum, weight) => sum + weight, 0)
  const diff = roundPercent(100 - total)
  if (Math.abs(diff) < 0.01) return rounded

  const targetIndex = rounded.reduce(
    (bestIndex, weight, index) => (weight > rounded[bestIndex] ? index : bestIndex),
    0
  )
  return rounded.map((weight, index) =>
    index === targetIndex ? roundPercent(weight + diff) : weight
  )
}

function equalWeights(count: number): number[] {
  if (count <= 0) return []
  return rebalanceWeightsToHundred(Array.from({ length: count }, () => 100 / count))
}

function resolveSegmentWeights(
  businessTypes: BusinessTypeFormSource[],
  existingById: Map<string, BusinessTypeSegmentInput>
): number[] {
  if (businessTypes.length <= 1) return businessTypes.length === 1 ? [100] : []

  const rawWeights = businessTypes.map((businessType) => {
    const businessTypeId = normalizeBusinessTypeId(businessType.id) ?? businessType.id
    const existing = existingById.get(businessTypeId)
    return normalizeWeightToPercent(existing?.weight ?? businessType.suggestedWeight)
  })

  if (rawWeights.every((weight) => weight === undefined)) {
    return equalWeights(businessTypes.length)
  }

  const knownTotal = rawWeights.reduce<number>((sum, weight) => sum + (weight ?? 0), 0)
  const missingCount = rawWeights.filter((weight) => weight === undefined).length
  if (missingCount > 0 && knownTotal > 0 && knownTotal < 100) {
    const missingWeight = (100 - knownTotal) / missingCount
    return rebalanceWeightsToHundred(
      rawWeights.map((weight) => (weight === undefined ? missingWeight : weight))
    )
  }

  const fallbackWeight = 100 / businessTypes.length
  const relativeWeights = rawWeights.map((weight) => weight ?? fallbackWeight)
  const relativeTotal = relativeWeights.reduce((sum, weight) => sum + Math.max(0, weight), 0)
  if (relativeTotal <= 0) return equalWeights(businessTypes.length)

  return rebalanceWeightsToHundred(
    relativeWeights.map((weight) => (Math.max(0, weight) / relativeTotal) * 100)
  )
}

export function uniqueBusinessTypeIds(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const normalized = normalizeBusinessTypeId(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

export function selectedBusinessTypeIdsFromFormData(
  formData: Pick<ValuationFormData, 'business_type_id' | 'business_type_segments'> & {
    businessType?: string
  }
): string[] {
  const segmentIds =
    formData.business_type_segments
      ?.map((segment) => segment.business_type_id)
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0) ?? []
  if (segmentIds.length > 0) return uniqueBusinessTypeIds(segmentIds)
  return uniqueBusinessTypeIds([formData.business_type_id, formData.businessType])
}

function getCompanyBusinessTypeIds(company: KBOCompany): string[] {
  return uniqueBusinessTypeIds([...(company.businessTypeIds ?? []), company.businessTypeId])
}

function getBusinessTypeTitleFromCompany(company: KBOCompany, id: string): string {
  return (
    company.businessTypeCandidates?.find((candidate) => candidate.id === id)?.title ||
    (normalizeBusinessTypeId(company.businessTypeId) === id
      ? company.businessTypeTitle
      : undefined) ||
    id
  )
}

function buildFallbackBusinessTypeFromCompany(company: KBOCompany, id: string): BusinessType {
  const title = getBusinessTypeTitleFromCompany(company, id)
  const candidate = company.businessTypeCandidates?.find((item) => item.id === id)
  return {
    id,
    title,
    description: '',
    icon: '🏢',
    category: '',
    category_id: '',
    industryMapping: id,
    keywords: [],
    popular: false,
    suggestedWeight: candidate?.weight,
    ...(candidate?.primaryMultiple ? { primaryMultiple: candidate.primaryMultiple } : {}),
    status: 'active',
    createdAt: '',
    updatedAt: '',
  }
}

export function buildApiBusinessTypeFromSearchType(
  id: string,
  businessType: SearchBusinessType
): BusinessType {
  return {
    id,
    title: businessType.name,
    description: businessType.description ?? '',
    icon: businessType.emoji ?? '🏢',
    category: businessType.category,
    category_id: businessType.category,
    industryMapping: businessType.code || id,
    keywords: [],
    popular: Boolean(businessType.popular),
    status: 'active',
    createdAt: '',
    updatedAt: '',
  }
}

export function resolveBusinessTypesFromKboCompany(
  company: KBOCompany,
  businessTypes: BusinessType[]
): BusinessType[] {
  const ids = getCompanyBusinessTypeIds(company)
  if (ids.length === 0) return []

  const businessTypeById = new Map(
    businessTypes.map((businessType) => [
      normalizeBusinessTypeId(businessType.id) ?? businessType.id,
      businessType,
    ])
  )

  return ids.map((id) => {
    const candidate = company.businessTypeCandidates?.find((item) => item.id === id)
    const catalogBusinessType = businessTypeById.get(id)
    if (catalogBusinessType) {
      return {
        ...catalogBusinessType,
        ...(candidate?.primaryMultiple && !catalogBusinessType.primaryMultiple
          ? { primaryMultiple: candidate.primaryMultiple }
          : {}),
        ...(candidate?.weight !== undefined ? { suggestedWeight: candidate.weight } : {}),
      }
    }
    return buildFallbackBusinessTypeFromCompany(company, id)
  })
}

export function buildBusinessTypeFormData(
  businessType: BusinessTypeFormSource,
  fallbackIndustry = 'services'
): Partial<ValuationFormData> {
  const industry = businessType.industry || businessType.industryMapping || fallbackIndustry
  const businessTypeId = normalizeBusinessTypeId(businessType.id) ?? businessType.id

  return {
    business_type_id: businessTypeId,
    business_type_title: businessType.title,
    business_model: businessTypeId,
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

export function buildBusinessTypeSegmentsFormData(
  businessTypes: BusinessTypeFormSource[],
  existingSegments: BusinessTypeSegmentInput[] = []
): Pick<ValuationFormData, 'business_type_segments'> {
  const existingById = new Map(
    existingSegments.flatMap((segment) => {
      const id = normalizeBusinessTypeId(segment.business_type_id) ?? segment.business_type_id
      return id ? [[id, segment] as const] : []
    })
  )
  const weights = resolveSegmentWeights(businessTypes, existingById)

  return {
    business_type_segments: businessTypes.map((businessType, index) => {
      const businessTypeId = normalizeBusinessTypeId(businessType.id) ?? businessType.id
      const existing = existingById.get(businessTypeId)
      const seed = primaryMultipleSeed(businessType)
      const basis = seed.basis ?? existing?.basis ?? existing?.earnings_basis
      const earnings = firstSegmentEarnings(existing)

      return {
        business_type_id: businessTypeId,
        business_type_title: businessType.title,
        ...(basis ? { basis, earnings_basis: basis } : {}),
        ...(earnings != null ? { earnings } : {}),
        ...(seed.multiple != null ? { multiple: seed.multiple } : {}),
        weight: weights[index] ?? 100,
      }
    }),
  }
}
