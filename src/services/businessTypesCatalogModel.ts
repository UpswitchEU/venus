import {
  BUSINESS_TYPES_FALLBACK,
  type BusinessTypeOption as ConfigBusinessTypeOption,
} from '../config/businessTypes'
import { normalizeBusinessTypeId } from '../utils/businessTypeIdAliases'
import type { BusinessCategory, BusinessTypesCacheData } from './cache/businessTypesCache'
import type { BusinessType } from './businessTypesApi.helpers'
import {
  asNumber,
  asOptionalString,
  asString,
  getSearchCandidates,
  isRecord,
  normalizeBusinessTypes,
} from './businessTypesApi.helpers'

export const MIN_COMPLETE_BUSINESS_TYPES_CACHE_COUNT = 100
export const MAX_EXTRA_BUSINESS_TYPES_PAGES = 8

export type BusinessTypesCacheDecision =
  | { action: 'miss' }
  | { action: 'use'; data: BusinessTypesCacheData }
  | { action: 'invalidate-incomplete'; cachedCount: number; expected: string }

export interface BusinessTypesPage {
  businessTypes: BusinessType[]
  hasMore: boolean
}

export interface BusinessTypeSearchResult {
  text: string
  confidence: number
  reason: string
}

export function getBusinessTypesCacheDecision(
  cachedData: BusinessTypesCacheData | null | undefined
): BusinessTypesCacheDecision {
  if (!cachedData) return { action: 'miss' }
  if (cachedData.businessTypes.length < MIN_COMPLETE_BUSINESS_TYPES_CACHE_COUNT) {
    return {
      action: 'invalidate-incomplete',
      cachedCount: cachedData.businessTypes.length,
      expected: `${MIN_COMPLETE_BUSINESS_TYPES_CACHE_COUNT}+ fresh catalog entries`,
    }
  }
  return { action: 'use', data: cachedData }
}

export function normalizeBusinessCategories(value: unknown): BusinessCategory[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const id = asOptionalString(item.id)
    if (!id) return []
    return [
      {
        id,
        name: asString(item.name, asString(item.title, id)),
        icon: asString(item.icon, '🏢'),
      },
    ]
  })
}

export function normalizeBusinessTypesPage(responseData: unknown): BusinessTypesPage | null {
  const response = isRecord(responseData) ? responseData : {}
  if (response.success !== true || !isRecord(response.data)) return null
  return {
    businessTypes: normalizeBusinessTypes(response.data.business_types),
    hasMore: response.data.has_more === true,
  }
}

export function buildBusinessTypesCacheData(
  businessTypes: BusinessType[],
  categories: BusinessCategory[]
): BusinessTypesCacheData {
  return {
    businessTypes,
    categories,
    popularTypes: businessTypes.filter((businessType) => businessType.popular),
  }
}

export function buildHardcodedBusinessTypes(nowIso = new Date().toISOString()): BusinessType[] {
  return BUSINESS_TYPES_FALLBACK.map((bt: ConfigBusinessTypeOption) => {
    const category = typeof bt.category === 'string' ? bt.category : String(bt.category ?? '')
    const categoryId = category.toLowerCase().replace(/\s+/g, '-')
    return {
      id: bt.value,
      title: bt.label.replace(/^[^\s]+\s/, ''),
      description: `${category} business`,
      short_description: `${category} business`,
      icon: bt.icon || '📦',
      category,
      category_id: categoryId,
      industryMapping: category,
      keywords: [category.toLowerCase()],
      popular: true,
      dcfPreference: 0.47,
      multiplesPreference: 0.53,
      ownerDependencyImpact: 0.5,
      keyMetrics: ['revenue', 'ebitda', 'growth_rate'],
      typicalEmployeeRange: { min: 1, max: 50 },
      typicalRevenueRange: { min: 100000, max: 5000000 },
      status: 'active',
      createdAt: nowIso,
      updatedAt: nowIso,
    }
  })
}

export function normalizeNaceBusinessTypePayload(
  payload: unknown,
  nowIso = new Date().toISOString()
): BusinessType | null {
  const response = isRecord(payload) ? payload : {}
  const bt = isRecord(response.business_type) ? response.business_type : null
  const businessTypeId = normalizeBusinessTypeId(asOptionalString(bt?.id))
  if (!bt || !businessTypeId) return null

  const category = isRecord(bt.category) ? bt.category : {}
  const categoryId = asString(bt.category_id, 'other')

  return {
    id: businessTypeId,
    title: asString(bt.title, businessTypeId),
    description: asString(bt.description),
    short_description: asString(bt.description),
    icon: asString(bt.emoji, '📦'),
    category: asString(category.name, asString(category.title, categoryId)),
    category_id: categoryId,
    industryMapping: asString(bt.industry_mapping, businessTypeId),
    industry: asString(bt.industry, categoryId),
    keywords: [],
    popular: false,
    status: asString(bt.status, 'active'),
    createdAt: asString(bt.created_at, nowIso),
    updatedAt: asString(bt.updated_at, nowIso),
  }
}

export function normalizeBusinessTypeSearchResults(
  payload: unknown,
  fallbackQuery: string
): BusinessTypeSearchResult[] {
  return getSearchCandidates(payload)
    .map((candidate) => {
      const item = isRecord(candidate) ? candidate : {}
      return {
        text: asString(item.title, asString(item.name, asString(item.label, fallbackQuery))),
        confidence: asNumber(item.confidence, 0.7),
        reason: asString(
          item.category,
          asString(item.industry, asString(item.description, 'Similar business type'))
        ),
      }
    })
    .filter((candidate) => candidate.text.length > 0)
}
