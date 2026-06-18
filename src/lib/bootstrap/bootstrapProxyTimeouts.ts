/**
 * Shared Venus bootstrap proxy timeouts.
 *
 * Keep ROUTE_BUDGET_MS below app/api/bootstrap/route.ts `maxDuration` (30s).
 * Client abort must exceed BFF timeout so the proxy returns 504 before the browser aborts.
 */

/** Per Titan call budget from Venus BFF → Titan. */
export const VENUS_BOOTSTRAP_BFF_TIMEOUT_MS = 28_000

/** Total Venus bootstrap route wall-clock budget (401 refresh + retry included). */
export const VENUS_BOOTSTRAP_ROUTE_BUDGET_MS = 29_000

/** Token refresh sub-call budget inside the bootstrap route. */
export const VENUS_BOOTSTRAP_TOKEN_REFRESH_TIMEOUT_MS = 8_000

/** Browser → Venus BFF fetch abort (must be > BFF timeout). */
export const VENUS_BOOTSTRAP_CLIENT_ABORT_MS = 32_000

export function remainingBootstrapRouteBudgetMs(startTimeMs: number, nowMs = Date.now()): number {
  return Math.max(1_000, VENUS_BOOTSTRAP_ROUTE_BUDGET_MS - (nowMs - startTimeMs))
}

export function bootstrapTitanCallTimeoutMs(startTimeMs: number, nowMs = Date.now()): number {
  return Math.min(
    VENUS_BOOTSTRAP_BFF_TIMEOUT_MS,
    remainingBootstrapRouteBudgetMs(startTimeMs, nowMs)
  )
}
