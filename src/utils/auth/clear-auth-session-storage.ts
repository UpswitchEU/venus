/**
 * Auth-related sessionStorage keys only — preserves calculator/report UX keys
 * (e.g. venus_new_valuation_prefill, report caches) unlike sessionStorage.clear().
 */
const AUTH_RELATED_SESSION_KEYS = [
  'venus_init_ok_at',
  'venus_reload_count',
  'venus_reload_window_start',
  'upswitch_venus_redirect_count',
  'upswitch_return_url',
  'upswitch_source',
  'auth_redirect',
] as const

export function removeAuthRelatedSessionStorageKeys(): void {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return
  for (const key of AUTH_RELATED_SESSION_KEYS) {
    try {
      sessionStorage.removeItem(key)
    } catch {
      // ignore
    }
  }
}
