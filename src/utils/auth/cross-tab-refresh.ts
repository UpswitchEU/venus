/**
 * Cross-tab Refresh Coordinator
 *
 * The dual-token system rotates the refresh token on every successful
 * `POST /api/auth/refresh`. If two tabs proactively refresh in the same
 * window (very likely at the 5-minute boundary), both POST with the same
 * refresh token; one wins, the other gets `401 Invalid or expired refresh
 * token` and logs the user out across all tabs.
 *
 * This module coordinates refresh attempts across tabs of the same origin
 * via:
 *   - A timestamp in localStorage (`upswitch:auth:last-refresh-at`) that
 *     records when the most recent refresh succeeded anywhere in this origin.
 *   - A `BroadcastChannel` (`upswitch-auth-refresh`) so a successful refresh
 *     wakes up other tabs immediately, without waiting for the next storage
 *     poll.
 *
 * Tabs check the timestamp before refreshing. If a refresh succeeded within
 * the recency window, they skip their own attempt — the rotated cookies are
 * already in the shared `.upswitch.app` cookie jar.
 */

const LAST_REFRESH_KEY = 'upswitch:auth:last-refresh-at'
const BROADCAST_CHANNEL_NAME = 'upswitch-auth-refresh'

/**
 * Skip our refresh if any other tab refreshed within this window. Must be
 * shorter than the access-token lifetime (15 min) so we still refresh in
 * time, but long enough to absorb the 5-min proactive interval.
 */
export const RECENT_REFRESH_WINDOW_MS = 4 * 60 * 1000

export interface RefreshBroadcastMessage {
  type: 'refresh-completed'
  at: number
}

export function readLastRefreshAt(): number {
  if (typeof localStorage === 'undefined') return 0
  try {
    const raw = localStorage.getItem(LAST_REFRESH_KEY)
    if (!raw) return 0
    const n = Number(raw)
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

export function wasRefreshedRecently(windowMs: number = RECENT_REFRESH_WINDOW_MS): boolean {
  const last = readLastRefreshAt()
  if (!last) return false
  return Date.now() - last < windowMs
}

/**
 * Clear the cross-tab refresh marker. Call from logout so the next session
 * cannot inherit a stale "we just refreshed" hint from the previous user.
 */
export function clearLastRefreshAt(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(LAST_REFRESH_KEY)
  } catch {
    /* non-fatal */
  }
}

export function markRefreshCompleted(): void {
  const now = Date.now()
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(LAST_REFRESH_KEY, String(now))
    } catch {
      /* quota or sandbox — non-fatal */
    }
  }
  if (typeof BroadcastChannel === 'undefined') return
  try {
    const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)
    const message: RefreshBroadcastMessage = {
      type: 'refresh-completed',
      at: now,
    }
    channel.postMessage(message)
    channel.close()
  } catch {
    /* non-fatal */
  }
}

const noop = (): void => {
  /* no broadcast channel available; nothing to subscribe to */
}

export function subscribeRefreshCompleted(callback: (at: number) => void): () => void {
  if (typeof BroadcastChannel === 'undefined') {
    return noop
  }
  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)
  } catch {
    return noop
  }
  const handler = (event: MessageEvent<RefreshBroadcastMessage>) => {
    if (!event.data || event.data.type !== 'refresh-completed') return
    const at =
      typeof event.data.at === 'number' && Number.isFinite(event.data.at)
        ? event.data.at
        : Date.now()
    try {
      callback(at)
    } catch {
      /* listener errors are non-fatal */
    }
  }
  channel.addEventListener('message', handler)
  return () => {
    try {
      channel?.removeEventListener('message', handler)
      channel?.close()
    } catch {
      /* ignore */
    }
  }
}
