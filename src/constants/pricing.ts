/** Advisor list prices — keep `starter.yearly` aligned with Mercury `starterPlan.yearlyTotal` + Titan Starter `pricing.yearly`. */
export const ACCOUNTANT_PRICING = {
  starter: {
    monthly: 149,
    yearly: 1490,
  },
  pro: {
    monthly: 299,
    yearly: 2990,
  },
} as const

/** Locale-aware € display: NL `€2.990`, EN `€2,990` */
export function formatEuroAmount(amount: number, locale: string): string {
  const formatted = new Intl.NumberFormat(locale === 'nl' ? 'nl-BE' : 'en-US').format(amount)
  return `€${formatted}`
}

export function getStarterAndProPlansLabel(locale: string): string {
  return locale === 'nl' ? 'Bekijk Starter & Pro' : 'View Starter & Pro'
}

export function getStarterPlanSummary(locale: string): string {
  const y = ACCOUNTANT_PRICING.starter.yearly
  const monthlyReference = ACCOUNTANT_PRICING.starter.monthly
  return locale === 'nl'
    ? `Starter ${formatEuroAmount(y, locale)}/jaar (~€${monthlyReference}/maand)`
    : `Starter ${formatEuroAmount(y, locale)}/year (~€${monthlyReference}/month)`
}

export function getProPlanSummary(locale: string): string {
  const y = ACCOUNTANT_PRICING.pro.yearly
  const monthlyReference = ACCOUNTANT_PRICING.pro.monthly
  return locale === 'nl'
    ? `Pro ${formatEuroAmount(y, locale)}/jaar (~€${monthlyReference}/maand)`
    : `Pro ${formatEuroAmount(y, locale)}/year (~€${monthlyReference}/month)`
}
