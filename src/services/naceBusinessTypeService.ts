/**
 * NACE to Business Type Service
 *
 * Resolves NACE codes to business types via Titan's NACE mapping API.
 * Used to auto-fill business type when KBO/session provides NACE but not business_type_id.
 * Mirrors Mercury's businessTypeService.getBusinessTypeForNaceCode().
 */

import type { BusinessType } from '@/design-system/components/EntitySearch';

/** NACE-BEL pattern: digits, dot, digits (e.g. 56.101, 62.01). Use to reject NACE-shaped values from business_type_id. */
export function looksLikeNaceCode(value: string): boolean {
  return /^\d{2}\.\d{2,3}$/.test(String(value || '').trim());
}
import { Building2 } from 'lucide-react';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const TIMEOUT = 6000; // Match Mercury businessTypeService for consistency

interface CacheEntry {
  data: BusinessType | null;
  timestamp: number;
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
};

interface TitanBusinessTypeResponse {
  id: string;
  title: string;
  description?: string;
  category_id?: string;
  emoji?: string;
  code?: string;
}

function mapToBusinessType(bt: TitanBusinessTypeResponse): BusinessType {
  const category = bt.category_id
    ? categoryMap[bt.category_id] || bt.category_id
    : 'other';

  return {
    id: bt.id,
    code: bt.code || '',
    name: bt.title,
    category,
    description: bt.description,
    emoji: bt.emoji,
    icon: Building2, // EntitySearch uses categoryIcons when rendering
  };
}

class NaceBusinessTypeService {
  private cache = new Map<string, CacheEntry>();

  /**
   * Reverse lookup: get the best-matching business type for a NACE code.
   * Uses Venus API proxy -> Titan GET /api/v2/nace/codes/:code/business-type
   */
  async getBusinessTypeForNaceCode(
    naceCode: string,
    signal?: AbortSignal
  ): Promise<BusinessType | null> {
    if (!naceCode || !naceCode.trim()) return null;

    const trimmed = naceCode.trim();
    const cacheKey = `bt:nace:${trimmed}`;

    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

    if (signal?.aborted) return null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

      if (signal) {
        signal.addEventListener('abort', () => controller.abort(), { once: true });
      }

      const params = new URLSearchParams({ naceCode: trimmed });
      const response = await fetch(`/api/nace/search?${params}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) return null;

      const data = await response.json();
      const bt = data?.business_type;
      if (!bt) return null;

      const mapped = mapToBusinessType(bt);
      this.cache.set(cacheKey, { data: mapped, timestamp: Date.now() });
      return mapped;
    } catch (err) {
      // Re-throw network/timeout errors so caller can show retry UI
      if (err instanceof Error && err.name !== 'AbortError') throw err;
      return null;
    }
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const naceBusinessTypeService = new NaceBusinessTypeService();
