/**
 * NACE to Business Type Service
 *
 * Resolves NACE codes to business types via Titan's NACE mapping API.
 * Used to auto-fill business type when KBO/session provides NACE but not business_type_id.
 * Mirrors Mercury's businessTypeService.getBusinessTypeForNaceCode().
 */

import type { BusinessType } from '@/design-system/components/EntitySearch'

/** NACE-BEL pattern: digits-only or dotted forms (e.g. 56101, 56.101, 62.01). */
export function looksLikeNaceCode(value: string): boolean {
  return /^(?:\d{4,6}|\d{2}\.\d{2,3})$/.test(String(value || '').trim())
}

import { Building2 } from 'lucide-react'

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const TIMEOUT = 6000 // Match Mercury businessTypeService for consistency

interface CacheEntry {
  data: BusinessType | null
  timestamp: number
}

const categoryMap: Record<string, string> = {
  technology: 'technology',
  software: 'software',
  creative: 'creative',
  retail: 'retail',
  ecommerce: 'ecommerce',
  food: 'food',
  restaurant: 'food',
  restaurants: 'food',
  horeca: 'hospitality',
  catering: 'food',
  professional: 'consulting',
  professionals: 'consulting',
  hospitality: 'hospitality',
  manufacturing: 'manufacturing',
  logistics: 'logistics',
  healthcare: 'healthcare',
  education: 'education',
  realestate: 'realestate',
  construction: 'construction',
  services: 'services',
  consulting: 'consulting',
  finance: 'finance',
  legal: 'legal',
  agriculture: 'agriculture',
  beauty: 'beauty',
  automotive: 'automotive',
  energy: 'energy',
  travel: 'travel',
  entertainment: 'entertainment',
  media: 'media',
  security: 'security',
  telecom: 'telecom',
  publishing: 'publishing',
  nonprofit: 'nonprofit',
}

interface TitanBusinessTypeResponse {
  id: string
  title: string
  description?: string
  category_id?: string
  emoji?: string
  icon?: string
  code?: string
}

function mapToBusinessType(bt: TitanBusinessTypeResponse): BusinessType {
  if (!bt?.id || !bt?.title) {
    return {
      id: bt?.id || 'unknown',
      code: '',
      name: bt?.title || 'Unknown',
      category: 'other',
      icon: Building2,
    }
  }

  const category = bt.category_id ? categoryMap[bt.category_id] || bt.category_id : 'other'

  return {
    id: bt.id,
    code: bt.code || '',
    name: bt.title,
    category,
    description: bt.description,
    emoji: bt.icon || bt.emoji,
    icon: Building2,
  }
}

class NaceBusinessTypeService {
  private cache = new Map<string, CacheEntry>()

  /**
   * Reverse lookup: get the best-matching business type for a NACE code.
   * Uses Venus API proxy -> Titan GET /api/v2/nace/codes/:code/business-type
   */
  async getBusinessTypeForNaceCode(
    naceCode: string,
    marketCountryCode?: string,
    signal?: AbortSignal
  ): Promise<BusinessType | null> {
    if (!naceCode || !naceCode.trim()) return null

    const trimmed = naceCode.trim()
    const normalizedCountry = marketCountryCode?.trim().toUpperCase() || ''
    const cacheKey = `bt:nace:${trimmed}:${normalizedCountry || 'ANY'}`

    const cached = this.cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data
    }

    if (signal?.aborted) return null

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT)

    if (signal) {
      signal.addEventListener('abort', () => controller.abort(), { once: true })
    }

    try {
      const params = new URLSearchParams({ naceCode: trimmed })
      if (normalizedCountry) {
        params.set('country_code', normalizedCountry)
      }
      const response = await fetch(`/api/nace/search?${params}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include',
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error('BUSINESS_TYPE_FETCH_FAILED')
      }

      const data = await response.json()
      const bt = data?.business_type
      if (!bt) return null

      const mapped = mapToBusinessType(bt)
      this.cache.set(cacheKey, { data: mapped, timestamp: Date.now() })
      return mapped
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') throw err
      return null
    } finally {
      clearTimeout(timeoutId)
    }
  }

  clearCache(): void {
    this.cache.clear()
  }
}

export const naceBusinessTypeService = new NaceBusinessTypeService()
