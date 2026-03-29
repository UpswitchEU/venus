/**
 * Which market methods drive the Revenue Quality bonus section (badge copy).
 * Treats `revenue_multiple` like `omzet_multiple` (English / API alias).
 */

export type RevenueQualityBadgeVariant = 'ebitda' | 'omzet' | 'both'

function hasRevenueMultipleLens(methods: string[]): boolean {
  return methods.includes('omzet_multiple') || methods.includes('revenue_multiple')
}

export function resolveRevenueQualityBadgeVariant(methods: string[]): RevenueQualityBadgeVariant {
  const hasO = hasRevenueMultipleLens(methods)
  const hasE = methods.includes('ebitda_multiple')
  if (hasO && hasE) return 'both'
  if (hasO) return 'omzet'
  return 'ebitda'
}
