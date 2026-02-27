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

let activeRefreshPromise: Promise<boolean> | null = null;

export function getActiveRefreshPromise(): Promise<boolean> | null {
  return activeRefreshPromise;
}

export function setActiveRefreshPromise(p: Promise<boolean> | null): void {
  activeRefreshPromise = p;
}
