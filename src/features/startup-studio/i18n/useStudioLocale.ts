'use client'

import { useLocale } from 'next-intl'

export type StudioLocale = 'en' | 'nl'

/** Route locale coerced to the Studio copy locale union (defaults to EN). */
export function useStudioLocale(): StudioLocale {
  return useLocale() === 'nl' ? 'nl' : 'en'
}
