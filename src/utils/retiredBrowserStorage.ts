/** Delete obsolete stores without reading their identity or analytics payloads. */
export function clearRetiredBrowserStorage(): void {
  for (const key of ['upswitch-analytics', 'upswitch_auth_cache', 'venus_pending_syncs']) {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // SSR and blocked browser storage must not interrupt navigation.
    }
  }
}
