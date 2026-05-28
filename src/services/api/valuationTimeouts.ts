/**
 * Shared HTTP timeouts for valuation calculate + result save.
 *
 * Must stay aligned with the bank-grade timeout chain documented in ValuationAPI:
 * Venus (120s) → Titan (100s) → ValuationIQ (90s).
 */
export const VALUATION_OPERATION_TIMEOUT_MS = 120_000

/** Non-idempotent valuation writes must not retry by default. */
export const VALUATION_NO_RETRY = { maxRetries: 0, initialDelay: 0 } as const
