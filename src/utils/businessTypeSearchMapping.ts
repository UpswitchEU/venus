import { Building2 } from 'lucide-react'
import { categoryIcons } from '@/design-system/components/entity-search/BusinessTypeData'
import type { BusinessType as EntitySearchBusinessType } from '@/design-system/components/entity-search/EntitySearchTypes'
import type { BusinessType as ApiBusinessType } from '@/services/businessTypesApi'
import { businessTypeCategoryStrings } from './businessTypeCategory'
import { normalizeBusinessTypeId } from './businessTypeIdAliases'

type ApiBusinessTypeForEntitySearch = Pick<ApiBusinessType, 'id' | 'title'> &
  Partial<Pick<ApiBusinessType, 'icon' | 'industryMapping' | 'popular'>> & {
    category?: unknown
    category_id?: unknown
  }

const API_CATEGORY_TO_ICON_KEY: Record<string, string> = {
  restaurant: 'food',
  restaurants: 'food',
  horeca: 'hospitality',
  catering: 'food',
  professional: 'consulting',
  professionals: 'consulting',
  'professional-services': 'consulting',
  professionalservices: 'consulting',
  'e-commerce': 'ecommerce',
  ecommerce: 'ecommerce',
  'real-estate': 'realestate',
  realestate: 'realestate',
}

function normalizeIconKeyCandidate(value: string): string[] {
  const lower = value.trim().toLowerCase()
  if (!lower) return []
  const dashed = lower.replace(/[\s_]+/g, '-')
  const compact = lower.replace(/[\s_-]+/g, '')
  return [...new Set([lower, dashed, compact])]
}

export function resolveBusinessTypeSearchCategory(
  category: unknown,
  fallbackCategoryId?: unknown
): string {
  const fallback = typeof fallbackCategoryId === 'string' ? fallbackCategoryId : ''
  const candidates = businessTypeCategoryStrings(category, fallback).flatMap(
    normalizeIconKeyCandidate
  )

  for (const candidate of candidates) {
    const mapped = API_CATEGORY_TO_ICON_KEY[candidate] ?? candidate
    if (categoryIcons[mapped]) return mapped
  }

  return 'other'
}

export function mapApiBusinessTypeForEntitySearch(
  bt: ApiBusinessTypeForEntitySearch
): EntitySearchBusinessType {
  const category = resolveBusinessTypeSearchCategory(bt.category, bt.category_id)
  const id = normalizeBusinessTypeId(bt.id) ?? bt.id
  return {
    id,
    code: normalizeBusinessTypeId(bt.industryMapping) ?? bt.industryMapping ?? id,
    name: bt.title,
    category,
    icon: categoryIcons[category] ?? categoryIcons.other ?? Building2,
    emoji: bt.icon || '\u{1F3E2}',
    popular: bt.popular ?? false,
  }
}
