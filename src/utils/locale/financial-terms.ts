/**
 * Financial Terms Dictionary — BE vs NL (Amsterdam Dictionary)
 *
 * Maps Belgian (BE) vs Dutch (NL) administrative/financial terminology.
 * Duplicated from Mercury for MVP; consider shared package later.
 *
 * @see Ticket 4: [Frontend] UI Localization (The "Amsterdam" Dictionary)
 */

export type CountryCode = 'BE' | 'NL'

export const FINANCIAL_TERMS: Record<CountryCode, Record<string, string>> = {
  BE: {
    registrationNumber: 'KBO-nummer',
    registrationNumberShort: 'KBO',
    registrationNumberEn: 'KBO number',
    director: 'Zaakvoerder',
    taxAuthority: 'FOD Financiën',
    trialBalance: 'Proef- en saldibalans',
  },
  NL: {
    registrationNumber: 'KVK-nummer',
    registrationNumberShort: 'KVK',
    registrationNumberEn: 'KVK number',
    director: 'Directeur / Bestuurder',
    taxAuthority: 'Belastingdienst',
    trialBalance: 'Kolommenbalans',
  },
}

export type FinancialTermKey = keyof (typeof FINANCIAL_TERMS)['BE']

export function getFinancialTerm(
  key: FinancialTermKey,
  countryCode?: string | null,
  locale?: 'nl' | 'en'
): string {
  const code: CountryCode = countryCode?.toUpperCase() === 'NL' ? 'NL' : 'BE'
  if (locale === 'en' && key === 'registrationNumber') {
    return FINANCIAL_TERMS[code].registrationNumberEn ?? FINANCIAL_TERMS.BE.registrationNumberEn
  }
  return FINANCIAL_TERMS[code][key] ?? FINANCIAL_TERMS.BE[key]
}

/** NL-specific grootboek name overrides (zaakvoerder -> directeur/bestuurder) */
export const GROOTBOEK_NL_OVERRIDES: Record<string, string> = {
  '620': 'Bezoldigingen bestuurders en directeuren',
  '649': 'Privékosten directeur',
}
