/**
 * Helpers for the blob passed to `saveReportAssets` (session package + valuation result).
 */

export const LAST_VALUATION_REQUEST_SESSION_KEY = '_last_valuation_request' as const

/**
 * Fields derived in `buildValuationRequest` that must match the durable draft after calculate,
 * so restore does not show a pre-clamp year or pre-normalization EBITDA while the report used the canonical values.
 */
const SESSION_SNAPSHOT_KEYS_FROM_VALUATION_REQUEST = [
  'current_year_data',
  'historical_years_data',
  'forecast_years_data',
  'recurring_revenue_percentage',
  /** Derived from forecast length vs default 5 — must match the request sent to calculate. */
  'projection_years',
  /** SDE owner compensation — must match the request Titan/ValuationIQ used. */
  'owner_salary_addback',
  /** Present when FCFF-only DCF mode was used — must match calculate payload. */
  'dcf_input_mode',
  /** Titan uses this for methodology hints; request is source of truth after calculate. */
  'user_configured_dcf',
  /** Multiples / adaptive comparables as sent to the API. */
  'comparables',
  /** Waarderingssynthese — must match calculate payload when blending methods. */
  'user_weights',
  'user_weight_justification',
] as const

function applyCanonicalFieldsFromValuationRequest(
  base: Record<string, unknown>,
  request: Record<string, unknown>
): void {
  for (const key of SESSION_SNAPSHOT_KEYS_FROM_VALUATION_REQUEST) {
    if (key in request && request[key] !== undefined) {
      base[key] = request[key]
    }
  }
  const cyd = request.current_year_data
  if (cyd && typeof cyd === 'object' && !Array.isArray(cyd)) {
    const row = cyd as Record<string, unknown>
    if (row.revenue !== undefined) base.revenue = row.revenue
    if (row.ebitda !== undefined) base.ebitda = row.ebitda
  }
}

/** Attach the exact request body sent to `calculateValuation` for Titan / audit parity. */
export function mergeLastValuationRequestIntoSessionData<T extends Record<string, unknown>>(
  sessionData: T | null | undefined,
  request: Record<string, unknown>
): T & { _last_valuation_request: Record<string, unknown> } {
  const base =
    sessionData && typeof sessionData === 'object' && !Array.isArray(sessionData)
      ? { ...sessionData }
      : {}
  return {
    ...base,
    [LAST_VALUATION_REQUEST_SESSION_KEY]: request,
  } as T & { _last_valuation_request: Record<string, unknown> }
}

/**
 * Session blob for `saveReportAssets`: form snapshot + authoritative calculate payload + tax latencies
 * so restore does not depend on a separate `_taxLatencies` flush timing.
 */
export function mergeSessionDataForReportAssets<T extends Record<string, unknown>>(
  sessionData: T | null | undefined,
  lastValuationRequest: Record<string, unknown>,
  taxLatencyItems: unknown[]
): Record<string, unknown> {
  const base =
    sessionData && typeof sessionData === 'object' && !Array.isArray(sessionData)
      ? { ...sessionData }
      : {}
  applyCanonicalFieldsFromValuationRequest(base, lastValuationRequest)
  return {
    ...base,
    _taxLatencies: taxLatencyItems,
    [LAST_VALUATION_REQUEST_SESSION_KEY]: lastValuationRequest,
  }
}
