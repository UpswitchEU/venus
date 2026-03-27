/**
 * UI copy for the NBB / Staatsblad registry panel (Venus).
 * Kept in one module so headings stay aligned with valuation-iq `ReportTranslations`
 * (`exec_official_*`); Python remains the source of truth for PDF/HTML reports.
 */
export const officialRegistryLabels = {
  en: {
    registryHead: 'Official registry check (NBB)',
    defaultSourceLine: 'Source: Staatsbladmonitor',
    filingYear: 'Filing year',
  },
  nl: {
    registryHead: 'Controle officiële bron (NBB)',
    defaultSourceLine: 'Bron: Staatsbladmonitor',
    filingYear: 'Boekjaar',
  },
} as const

export function getOfficialRegistryLabels(locale: string) {
  return locale === 'en' ? officialRegistryLabels.en : officialRegistryLabels.nl
}
