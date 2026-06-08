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
    registrationNumberFr: 'numéro BCE',
    registrationNumberShortFr: 'BCE',
    registrationNumberPlaceholder: 'Zoek op KBO-nummer of bedrijfsnaam',
    registrationNumberPlaceholderFr: 'Rechercher par numéro BCE ou nom d’entreprise',
    director: 'Zaakvoerder',
    taxAuthority: 'FOD Financiën',
    trialBalance: 'Proef- en saldibalans',
    vatNumber: 'BTW-nummer',
    legalForm: 'Rechtsvorm',
    legalFormFr: 'Forme juridique',
    registrySearchLink: 'Zoek op KBO',
    registrySearchLinkFr: 'Rechercher dans la BCE',
    activityCode: 'NACE-code',
    activityCodeFr: 'Code NACE',
    searchOnRegistry: 'Zoek op KBO-databank',
    searchOnRegistryFr: 'Rechercher dans la Banque-Carrefour',
  },
  NL: {
    registrationNumber: 'KVK-nummer',
    registrationNumberShort: 'KVK',
    registrationNumberEn: 'KVK number',
    registrationNumberFr: 'numéro KvK',
    registrationNumberShortFr: 'KvK',
    registrationNumberPlaceholder: 'Zoek op KVK-nummer of bedrijfsnaam',
    registrationNumberPlaceholderFr: 'Rechercher par numéro KvK ou nom d’entreprise',
    director: 'Directeur / Bestuurder',
    taxAuthority: 'Belastingdienst',
    trialBalance: 'Kolommenbalans',
    vatNumber: 'BTW-nummer',
    legalForm: 'Rechtsvorm',
    legalFormFr: 'Forme juridique',
    registrySearchLink: 'Zoek op KVK',
    registrySearchLinkFr: 'Rechercher dans le KvK',
    activityCode: 'SBI-code',
    activityCodeFr: 'Code SBI',
    searchOnRegistry: 'Zoek op KVK.nl',
    searchOnRegistryFr: 'Rechercher sur KvK.nl',
  },
}

export type FinancialTermKey = keyof (typeof FINANCIAL_TERMS)['BE']

export function getFinancialTerm(
  key: FinancialTermKey,
  countryCode?: string | null,
  locale?: 'nl' | 'en' | 'fr'
): string {
  const code: CountryCode = countryCode?.toUpperCase() === 'NL' ? 'NL' : 'BE'
  const terms = FINANCIAL_TERMS[code] as Record<string, string>
  if (locale === 'fr') {
    const frenchKey = `${key}Fr`
    if (terms[frenchKey]) return terms[frenchKey]
  }
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
