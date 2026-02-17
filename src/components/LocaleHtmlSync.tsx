'use client'

import { useEffect } from 'react'

/**
 * Syncs the active locale to document.documentElement.lang
 * Ensures correct lang attribute for accessibility and Dutch locale display
 */
export function LocaleHtmlSync({ locale }: { locale: string }) {
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])
  return null
}
