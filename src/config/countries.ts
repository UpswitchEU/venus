// 🗺️ Target Countries Configuration
// Aligned with Upswitch Index / Athena `INDEX_COUNTRY_ISO2_ORDERED` so operating country,
// registry hints, and Titan benchmark enrichment (per-country multiples) stay consistent.
// Use ISO 3166-1 alpha-2 (GB for United Kingdom, not UK).

export interface Country {
  code: string
  name: string
  flag: string
  currency: string
  currencySymbol: string
  locale: string
  taxSystem: string
}

/** Same ISO2 order as Athena `INDEX_COUNTRY_ISO2_ORDERED` (toolbar / index markets). */
export const TARGET_COUNTRIES: Country[] = [
  {
    code: 'BE',
    name: 'Belgium',
    flag: '🇧🇪',
    currency: 'EUR',
    currencySymbol: '€',
    locale: 'nl-BE',
    taxSystem: 'belgian',
  },
  {
    code: 'NL',
    name: 'Netherlands',
    flag: '🇳🇱',
    currency: 'EUR',
    currencySymbol: '€',
    locale: 'nl-NL',
    taxSystem: 'dutch',
  },
  {
    code: 'LU',
    name: 'Luxembourg',
    flag: '🇱🇺',
    currency: 'EUR',
    currencySymbol: '€',
    locale: 'fr-LU',
    taxSystem: 'luxembourg',
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    flag: '🇬🇧',
    currency: 'GBP',
    currencySymbol: '£',
    locale: 'en-GB',
    taxSystem: 'uk',
  },
  {
    code: 'FR',
    name: 'France',
    flag: '🇫🇷',
    currency: 'EUR',
    currencySymbol: '€',
    locale: 'fr-FR',
    taxSystem: 'french',
  },
  {
    code: 'DE',
    name: 'Germany',
    flag: '🇩🇪',
    currency: 'EUR',
    currencySymbol: '€',
    locale: 'de-DE',
    taxSystem: 'german',
  },
  {
    code: 'AT',
    name: 'Austria',
    flag: '🇦🇹',
    currency: 'EUR',
    currencySymbol: '€',
    locale: 'de-AT',
    taxSystem: 'austrian',
  },
  {
    code: 'CH',
    name: 'Switzerland',
    flag: '🇨🇭',
    currency: 'CHF',
    currencySymbol: 'CHF',
    locale: 'de-CH',
    taxSystem: 'swiss',
  },
  {
    code: 'SE',
    name: 'Sweden',
    flag: '🇸🇪',
    currency: 'SEK',
    currencySymbol: 'kr',
    locale: 'sv-SE',
    taxSystem: 'swedish',
  },
  {
    code: 'FI',
    name: 'Finland',
    flag: '🇫🇮',
    currency: 'EUR',
    currencySymbol: '€',
    locale: 'fi-FI',
    taxSystem: 'finnish',
  },
  {
    code: 'DK',
    name: 'Denmark',
    flag: '🇩🇰',
    currency: 'DKK',
    currencySymbol: 'kr',
    locale: 'da-DK',
    taxSystem: 'danish',
  },
  {
    code: 'NO',
    name: 'Norway',
    flag: '🇳🇴',
    currency: 'NOK',
    currencySymbol: 'kr',
    locale: 'nb-NO',
    taxSystem: 'norwegian',
  },
]

export const DEFAULT_COUNTRY = TARGET_COUNTRIES[0]

export function getCountryByCode(code: string): Country | undefined {
  return TARGET_COUNTRIES.find((c) => c.code === code)
}

export function formatCurrency(amount: number, countryCode: string): string {
  const country = getCountryByCode(countryCode)
  if (!country) return `€${amount.toLocaleString()}`

  return new Intl.NumberFormat(country.locale, {
    style: 'currency',
    currency: country.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function getCurrencySymbol(countryCode: string): string {
  const country = getCountryByCode(countryCode)
  return country?.currencySymbol || '€'
}

export const INDUSTRIES = [
  'Technology & Software',
  'E-commerce & Retail',
  'Manufacturing',
  'Professional Services',
  'Healthcare & Life Sciences',
  'Financial Services',
  'Real Estate',
  'Hospitality & Tourism',
  'Transportation & Logistics',
  'Construction',
  'Energy & Utilities',
  'Food & Beverage',
  'Media & Entertainment',
  'Education',
  'Agriculture',
  'Other',
] as const

export type Industry = (typeof INDUSTRIES)[number]
