export const ACCOUNTANT_PRICING = {
  starter: {
    monthly: 99,
    yearly: 990,
  },
  pro: {
    monthly: 199,
    yearly: 1990,
  },
} as const

/** Locale-aware € display: NL `€1.990`, EN `€1,990` */
export function formatEuroAmount(amount: number, locale: string): string {
  const formatted = new Intl.NumberFormat(
    locale === 'nl' ? 'nl-BE' : 'en-US'
  ).format(amount)
  return `€${formatted}`
}

function monthlyEquivalent(yearly: number): number {
  return Math.round(yearly / 12)
}

export function getStarterAndProPlansLabel(locale: string): string {
  return locale === 'nl' ? 'Bekijk Starter & Pro' : 'View Starter & Pro'
}

export function getStarterPlanSummary(locale: string): string {
  const y = ACCOUNTANT_PRICING.starter.yearly
  const eq = monthlyEquivalent(y)
  return locale === 'nl'
    ? `Starter vanaf ${formatEuroAmount(y, locale)}/jaar (~€${eq}/maand)`
    : `Starter from ${formatEuroAmount(y, locale)}/year (~€${eq}/month)`
}

export function getProPlanSummary(locale: string): string {
  const y = ACCOUNTANT_PRICING.pro.yearly
  const eq = monthlyEquivalent(y)
  return locale === 'nl'
    ? `Pro vanaf ${formatEuroAmount(y, locale)}/jaar (~€${eq}/maand)`
    : `Pro from ${formatEuroAmount(y, locale)}/year (~€${eq}/month)`
}
