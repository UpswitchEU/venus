import { dateLikeToUnixMs } from '@/utils/date-like'

export type FormatImportTimeT = (key: string, values?: Record<string, number | string>) => string
export type ImportTimeLocale = 'en' | 'nl' | 'fr'

export function formatCurrency(amount: number): string {
  if (amount >= 1000) return `\u20ac${(amount / 1000).toFixed(1)}K`
  return `\u20ac${amount.toFixed(0)}`
}

export function normalizeImportTimeLocale(locale: string): ImportTimeLocale {
  if (locale === 'nl' || locale === 'fr') return locale
  return 'en'
}

export function formatImportTime(
  date: Date,
  t: FormatImportTimeT,
  locale: ImportTimeLocale = 'nl'
): string {
  const pastMs = dateLikeToUnixMs(date)
  const diff = pastMs === null ? 0 : Date.now() - pastMs
  const minutes = Math.floor(diff / 60000)

  if (minutes < 1) return t('justNow')
  if (minutes < 60) return t('minutesAgo', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('hoursAgo', { count: hours })
  const display =
    pastMs !== null ? new Date(pastMs) : date instanceof Date ? date : new Date(String(date))
  const dateLocale = locale === 'nl' ? 'nl-BE' : locale === 'fr' ? 'fr-BE' : 'en-GB'
  return display.toLocaleDateString(dateLocale, {
    day: 'numeric',
    month: 'short',
  })
}
