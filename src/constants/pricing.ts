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

export function getStarterAndProPlansLabel(locale: string): string {
  return locale === 'nl' ? 'Bekijk Starter & Pro' : 'View Starter & Pro'
}

export function getStarterPlanSummary(locale: string): string {
  return locale === 'nl'
    ? `Starter vanaf €${ACCOUNTANT_PRICING.starter.monthly}/maand of €${ACCOUNTANT_PRICING.starter.yearly}/jaar`
    : `Starter from €${ACCOUNTANT_PRICING.starter.monthly}/mo or €${ACCOUNTANT_PRICING.starter.yearly}/year`
}
