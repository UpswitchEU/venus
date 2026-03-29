/**
 * Set NEXT_LOCALE before locale navigation so Mercury (parent app) and Venus share preference.
 * Matches Mercury `setNextLocaleCookie` — domain `.upswitch.app` in production.
 */

export function setNextLocaleCookie(locale: string): void {
  if (typeof window === 'undefined') return
  const normalized = locale?.trim()?.toLowerCase()
  if (normalized !== 'en' && normalized !== 'nl') return
  const isProd = window.location.hostname.includes('upswitch.app')
  document.cookie = `NEXT_LOCALE=${normalized}; path=/; max-age=31536000; SameSite=Lax${isProd ? '; domain=.upswitch.app' : ''}`
}
