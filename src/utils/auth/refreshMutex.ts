/**
 * Shared token refresh mutex.
 *
 * `checkSession()` (auth store), `useTokenRefresh`, the bootstrap `AuthResolver`,
 * and the API-error `recovery` strategy each call POST /api/auth/refresh. Without
 * a shared mutex they fire concurrently — the second request uses an
 * already-rotated refresh token and gets a spurious 401. This module is the
 * single source of truth for the one in-flight refresh promise; every caller
 * checks here before starting a new refresh.
 */

/**
 * Why a refresh attempt did not succeed.
 *
 * A bare success boolean conflates a real auth rejection (refresh token genuinely
 * expired → the user IS logged out) with a transient backend failure (pool
 * pressure / 5xx / network / timeout → the session is still valid, just retry).
 * `checkSession()` must NOT log the user out on the latter, so the refresh
 * outcome carries this verdict.
 *
 * Convention: `none` on success; `auth_failed` ONLY on a definitive 401/403;
 * `transient` for everything else. An awaiter that sees anything other than
 * `auth_failed` PRESERVES the session — only `auth_failed` may clear it.
 */
export type RefreshFailureKind = 'none' | 'auth_failed' | 'transient'

/**
 * The resolved value of a shared refresh. The verdict travels WITH the
 * resolution to every awaiter, so each awaiter reads the classification that
 * belongs to the exact attempt it awaited — there is no shared mutable flag to
 * race against (a previous design used a module-level `lastRefreshFailureKind`
 * that a concurrent re-registration could clobber between resolve and read).
 */
export interface RefreshOutcome {
  ok: boolean
  kind: RefreshFailureKind
}

/** Fail-safe outcome for callers with no in-flight refresh to await. */
export const TRANSIENT_REFRESH_OUTCOME: RefreshOutcome = { ok: false, kind: 'transient' }

let activeRefreshPromise: Promise<RefreshOutcome> | null = null

export function getActiveRefreshPromise(): Promise<RefreshOutcome> | null {
  return activeRefreshPromise
}

export function setActiveRefreshPromise(p: Promise<RefreshOutcome> | null): void {
  activeRefreshPromise = p
}

/**
 * Await the shared refresh (or `null`) and reduce it to a plain success boolean.
 * Convenience for the callers that only need "did it work?" and not the verdict.
 */
export async function awaitRefreshOk(p: Promise<RefreshOutcome> | null): Promise<boolean> {
  if (!p) return false
  return (await p).ok
}

/** Classify a non-ok refresh HTTP status into a verdict. */
export function classifyRefreshStatus(status: number | undefined): RefreshFailureKind {
  // Only a definitive auth rejection may clear a session. Everything else
  // (5xx / 408 / 429 / unknown) is transient — preserve and retry.
  return status === 401 || status === 403 ? 'auth_failed' : 'transient'
}
