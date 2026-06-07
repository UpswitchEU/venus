'use client'

import { useLocale } from 'next-intl'

export type StudioLocale = 'en' | 'nl' | 'fr'

export function coerceStudioLocale(locale: string): StudioLocale {
  if (locale === 'nl' || locale === 'fr') return locale
  return 'en'
}

export function studioIntlLocale(locale: StudioLocale): 'en-BE' | 'nl-BE' | 'fr-BE' {
  if (locale === 'fr') return 'fr-BE'
  return locale === 'nl' ? 'nl-BE' : 'en-BE'
}

/** Route locale coerced to the Studio copy locale union (defaults to EN). */
export function useStudioLocale(): StudioLocale {
  return coerceStudioLocale(useLocale())
}
