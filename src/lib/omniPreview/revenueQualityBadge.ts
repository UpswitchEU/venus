/**
 * Which market methods drive the Revenue Quality bonus section (badge copy).
 * Treats `revenue_multiple` like `omzet_multiple` (English / API alias).
 */

import { isRevenueMethodologyKey } from '@/utils/extractValuationResultsMap'

export type RevenueQualityBadgeVariant = 'ebitda' | 'omzet' | 'both'

function hasRevenueMultipleLens(methods: string[]): boolean {
  return methods.some(isRevenueMethodologyKey)
}

export function resolveRevenueQualityBadgeVariant(methods: string[]): RevenueQualityBadgeVariant {
  const hasO = hasRevenueMultipleLens(methods)
  const hasE = methods.includes('ebitda_multiple')
  if (hasO && hasE) return 'both'
  if (hasO) return 'omzet'
  return 'ebitda'
}
