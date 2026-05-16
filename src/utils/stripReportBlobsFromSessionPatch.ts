/**
 * Session autosave PATCHes were carrying multi‑MB HTML / pdf_html blobs nested in
 * `sessionData.valuation_result`, causing ERR_STREAM_PREMATURE_CLOSE through proxies.
 * Canonical rendered assets belong on `valuation_reports` (PUT …/result / Titan persistence).
 *
 * Titan applies the same stripping on ingest (defense in depth). When adding blob field names,
 * keep in sync with `apps/titan-api/src/valuations/sessions/utils/strip-session-report-blobs.ts`.
 */

const MAX_STRIP_DEPTH = 12

const TOP_LEVEL_BLOB_KEYS = [
  'htmlReport',
  'html_report',
  '_htmlReport',
  'pdfHtmlReport',
  'pdf_html_report',
  'pdfHtml',
] as const

/** Nested shapes produced by bad merges (e.g. PATCH 404 → create) or snake_case echoes. */
const NESTED_SESSION_ENVELOPE_KEYS = [
  'sessionData',
  'partialData',
  'partial_data',
  'session_data',
] as const

function omitKeys<T extends Record<string, unknown>>(obj: T, keys: readonly string[]): T {
  const next = { ...obj }
  for (const k of keys) {
    delete next[k]
  }
  return next
}

function slimEmbeddedValuationForSessionPatch(v: unknown): unknown {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) {
    return v
  }
  const r = v as Record<string, unknown>
  let trimmed = omitKeys(r, ['html_report', 'htmlReport', 'pdf_html_report', 'pdfHtmlReport'])
  const details = trimmed.details
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    trimmed = {
      ...trimmed,
      details: omitKeys(details as Record<string, unknown>, ['html_report', 'pdf_html_report']),
    }
  }
  return trimmed
}

/**
 * Returns a copy with report HTML/PDF strings stripped. Does not mutate the input.
 * Recurses into `sessionData` / `partialData` / `session_data` envelopes (bounded depth).
 */
export function stripReportBlobsFromSessionPatch(sessionData: unknown, depth = 0): unknown {
  if (depth > MAX_STRIP_DEPTH) {
    return sessionData
  }
  if (sessionData == null || typeof sessionData !== 'object' || Array.isArray(sessionData)) {
    return sessionData
  }
  const sd = sessionData as Record<string, unknown>
  let next = omitKeys(sd, TOP_LEVEL_BLOB_KEYS)
  for (const vk of ['valuationResult', 'valuation_result'] as const) {
    if (vk in next) {
      next = { ...next, [vk]: slimEmbeddedValuationForSessionPatch(next[vk]) }
    }
  }
  for (const nest of NESTED_SESSION_ENVELOPE_KEYS) {
    const inner = next[nest]
    if (
      inner != null &&
      typeof inner === 'object' &&
      !Array.isArray(inner) &&
      Object.hasOwn(next, nest)
    ) {
      next = { ...next, [nest]: stripReportBlobsFromSessionPatch(inner, depth + 1) }
    }
  }
  return next
}

/**
 * PATCH body (`updates`) — strips top‑level blobs plus nested `sessionData` / `partialData` /
 * `session_data` (camelCase + snake_case).
 */
export function stripReportsFromValuationSessionPatchUpdates(
  updates: Record<string, unknown> | null | undefined
): Record<string, unknown> | null | undefined {
  if (updates == null || typeof updates !== 'object' || Array.isArray(updates)) {
    return updates as null | undefined
  }
  const next = omitKeys({ ...updates }, TOP_LEVEL_BLOB_KEYS)
  for (const key of NESTED_SESSION_ENVELOPE_KEYS) {
    if (key in next && next[key] != null) {
      next[key] = stripReportBlobsFromSessionPatch(next[key])
    }
  }
  return next
}
