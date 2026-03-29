/**
 * Which market methods drive the Revenue Quality bonus section (badge copy).
 */

export type RevenueQualityBadgeVariant = 'ebitda' | 'omzet' | 'both'

export function resolveRevenueQualityBadgeVariant(methods: string[]): RevenueQualityBadgeVariant {
  const hasO = methods.includes('omzet_multiple')
  const hasE = methods.includes('ebitda_multiple')
  if (hasO && hasE) return 'both'
  if (hasO) return 'omzet'
  return 'ebitda'
}
