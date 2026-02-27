'use client'

import { usePathname } from 'next/navigation'
import { useLocale } from 'next-intl'
import { useEffect, useRef } from 'react'
import type { Locale } from '../../i18n'
import { useAuthStore } from '../lib/auth'

const SUPPORTED_LOCALES: readonly string[] = ['en', 'nl']

/** RELOAD LOOP FIX: Minimum delay (ms) after auth ready before locale redirect. */
const LOCALE_REDIRECT_DELAY_MS = 1500

/**
 * Syncs the authenticated user's language_preference from Titan
 * with the current Venus locale. If they differ, sets the NEXT_LOCALE
 * cookie and navigates to the correct locale path.
 *
 * IMPORTANT: Only redirects when the current locale is the default (en).
 * When the user landed on /nl/ (e.g. from Mercury or a shared link), we
 * respect the URL locale and do NOT override with DB preference. This
 * prevents "Ask Assistant" / "Normalizations" etc. from reverting to
 * English when the user explicitly navigated to Dutch.
 *
 * RELOAD LOOP FIX: Defers locale redirect until 1s after auth ready.
 * Redirecting during auth/bootstrap init can trigger full reloads and
 * contribute to perceived reload loops.
 *
 * Must be rendered inside a next-intl provider and after auth is ready.
 */
export function useLanguageSync() {
  const user = useAuthStore((s) => s.user)
  const isInitializing = useAuthStore((s) => s.isInitializing)
  const locale = useLocale() as Locale
  const pathname = usePathname()
  const synced = useRef(false)
  const authReadyAt = useRef<number | null>(null)

  useEffect(() => {
    if (synced.current) return
    // Skip locale redirect when coming from Mercury - avoids extra reload during critical flow
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('source') === 'mercury') {
        synced.current = true
        return
      }
    }
    // Defer locale redirect until auth initialization is fully complete.
    // Redirecting while initializeAuth() is still running would abort the
    // client context exchange and cause a broken state on the new page.
    if (isInitializing) return
    if (!user?.language_preference) return

    const preferred = user.language_preference
    if (!SUPPORTED_LOCALES.includes(preferred)) return
    if (preferred === locale) {
      synced.current = true
      return
    }

    // Only redirect when we're on the default locale. If the user is on /nl/
    // (from Mercury, shared link, or cookie), respect it — don't override with DB.
    if (locale !== 'en') {
      synced.current = true
      return
    }

    // RELOAD LOOP FIX: Defer redirect until past critical init phase.
    // Record when auth became ready and only redirect after delay.
    const now = Date.now()
    if (authReadyAt.current === null) {
      authReadyAt.current = now
    }
    const elapsed = now - authReadyAt.current
    if (elapsed < LOCALE_REDIRECT_DELAY_MS) {
      const remaining = LOCALE_REDIRECT_DELAY_MS - elapsed
      const t = setTimeout(() => {
        if (synced.current) return
        synced.current = true
        document.cookie = `NEXT_LOCALE=${preferred}; path=/; max-age=31536000; SameSite=Lax`
        const pathWithoutLocale = pathname.replace(/^\/(en|nl)/, '')
        const newPath = `/${preferred}${pathWithoutLocale}`
        window.location.replace(newPath)
      }, remaining)
      return () => clearTimeout(t)
    }

    synced.current = true

    document.cookie = `NEXT_LOCALE=${preferred}; path=/; max-age=31536000; SameSite=Lax`

    const pathWithoutLocale = pathname.replace(/^\/(en|nl)/, '')
    const newPath = `/${preferred}${pathWithoutLocale}`
    window.location.replace(newPath)
  }, [user, locale, pathname, isInitializing])
}
