'use client'

import { useEffect, useRef } from 'react'
import { useLocale } from 'next-intl'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '../lib/auth'
import type { Locale } from '../../i18n'

const SUPPORTED_LOCALES: readonly string[] = ['en', 'nl']

/**
 * Syncs the authenticated user's language_preference from Titan
 * with the current Venus locale. If they differ, sets the NEXT_LOCALE
 * cookie and navigates to the correct locale path.
 *
 * Must be rendered inside a next-intl provider and after auth is ready.
 */
export function useLanguageSync() {
  const user = useAuthStore((s) => s.user)
  const locale = useLocale() as Locale
  const pathname = usePathname()
  const synced = useRef(false)

  useEffect(() => {
    if (synced.current) return
    if (!user?.language_preference) return

    const preferred = user.language_preference
    if (!SUPPORTED_LOCALES.includes(preferred)) return
    if (preferred === locale) {
      synced.current = true
      return
    }

    synced.current = true

    document.cookie = `NEXT_LOCALE=${preferred}; path=/; max-age=31536000; SameSite=Lax`

    const pathWithoutLocale = pathname.replace(/^\/(en|nl)/, '')
    const newPath = `/${preferred}${pathWithoutLocale}`
    window.location.replace(newPath)
  }, [user, locale, pathname])
}
