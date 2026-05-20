const INIT_SUCCESS_KEY = 'venus_init_ok_at'
const INIT_THROTTLE_MS = 10_000

export function wasRecentlyInitialized(): boolean {
  try {
    const ts = parseInt(sessionStorage.getItem(INIT_SUCCESS_KEY) || '0', 10)
    return Date.now() - ts < INIT_THROTTLE_MS
  } catch {
    return false
  }
}

export function markInitSuccess(): void {
  try {
    sessionStorage.setItem(INIT_SUCCESS_KEY, String(Date.now()))
  } catch {
    /* ignore non-critical failure */
  }
}

export function clearInitThrottle(): void {
  try {
    sessionStorage.removeItem(INIT_SUCCESS_KEY)
  } catch {
    /* ignore non-critical failure */
  }
}

// Reload-loop circuit breaker. If the page reloads more than MAX times within
// WINDOW ms, stop retrying and surface an error.
const RELOAD_COUNT_KEY = 'venus_reload_count'
const RELOAD_WINDOW_KEY = 'venus_reload_window_start'
const MAX_RELOADS_IN_WINDOW = 4
const RELOAD_WINDOW_MS = 30_000

export function isReloadLooping(): boolean {
  try {
    const now = Date.now()
    const windowStart = parseInt(sessionStorage.getItem(RELOAD_WINDOW_KEY) || '0', 10)
    let count = parseInt(sessionStorage.getItem(RELOAD_COUNT_KEY) || '0', 10)

    if (now - windowStart > RELOAD_WINDOW_MS) {
      sessionStorage.setItem(RELOAD_WINDOW_KEY, String(now))
      count = 0
    }

    count++
    sessionStorage.setItem(RELOAD_COUNT_KEY, String(count))
    return count > MAX_RELOADS_IN_WINDOW
  } catch {
    return false
  }
}

export function clearReloadCounter(): void {
  try {
    sessionStorage.removeItem(RELOAD_COUNT_KEY)
    sessionStorage.removeItem(RELOAD_WINDOW_KEY)
  } catch {
    /* ignore non-critical failure */
  }
}
