/**
 * Shared token refresh mutex.
 *
 * Both `checkSession()` in auth.ts and `useTokenRefresh` call
 * POST /api/auth/refresh independently. Without a shared mutex, they
 * can fire concurrently — the second request uses an already-rotated
 * refresh token and gets 401.
 *
 * This module is the single source of truth for the in-flight refresh
 * promise. Both consumers check here before starting a new refresh.
 */

let activeRefreshPromise: Promise<boolean> | null = null

export function getActiveRefreshPromise(): Promise<boolean> | null {
  return activeRefreshPromise
}

export function setActiveRefreshPromise(p: Promise<boolean> | null): void {
  activeRefreshPromise = p
}

/**
 * Why the most recent refresh attempt did not succeed.
 *
 * The shared refresh promise resolves to a bare `boolean`, which conflates a
 * real auth rejection (the refresh token is genuinely expired → the user IS
 * logged out) with a transient backend failure (pool pressure / 5xx / network
 * / timeout → the session is still valid, just retry). `checkSession()` must
 * NOT log the user out on the latter. The refresh creators classify their
 * outcome here so any awaiter can tell the two apart.
 *
 * Fail-safe default is `auth_failed` → only set explicitly. The convention is:
 * a refresh creator resets this to `transient` at the START of an attempt, then
 * promotes it to `auth_failed` ONLY on a definitive 401/403. That way an
 * awaiter that reads an ambiguous/unset value preserves the session rather than
 * ejecting the user on a backend blip.
 */
export type RefreshFailureKind = 'none' | 'auth_failed' | 'transient'

let lastRefreshFailureKind: RefreshFailureKind = 'transient'

export function setLastRefreshFailureKind(kind: RefreshFailureKind): void {
  lastRefreshFailureKind = kind
}

export function getLastRefreshFailureKind(): RefreshFailureKind {
  return lastRefreshFailureKind
}
