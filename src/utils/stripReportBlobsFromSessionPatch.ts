/**
 * Session autosave PATCHes were carrying multi-MB HTML / pdf_html blobs nested in
 * `sessionData.valuation_result`, causing ERR_STREAM_PREMATURE_CLOSE through proxies.
 * Canonical rendered assets belong on `valuation_reports` (PUT /result / Titan persistence).
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
  '_pdfHtmlReport',
  'pdfHtml',
  'reportHtml',
] as const

/** Nested shapes produced by bad merges (e.g. PATCH 404 -> create) or snake_case echoes. */
const NESTED_SESSION_ENVELOPE_KEYS = [
  'sessionData',
  'partialData',
  'partial_data',
  'session_data',
] as const

// Titan's calculation response includes the complete saved version row. That
// receipt recursively contains the result again (version_data/trigger_metadata)
// and is already stored in valuation_versions. Match Titan's persistence strip;
// retain every economic field and calculation trace in the result itself.
const RESULT_ARTIFACT_KEYS = [...TOP_LEVEL_BLOB_KEYS, 'version', 'pdf_bytes', 'pdf_base64']
const NESTED_RESULT_KEYS = ['details', 'valuation_result', 'valuationResult', 'outputs'] as const

function omitKeys<T extends Record<string, unknown>>(obj: T, keys: readonly string[]): T {
  const next = { ...obj }
  for (const k of keys) {
    delete next[k]
  }
  return next
}

function slimEmbeddedValuationForSessionPatch(v: unknown, depth = 0): unknown {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) {
    return v
  }
  if (depth > MAX_STRIP_DEPTH) throw new Error('Result envelope nesting exceeds the save limit')
  const trimmed = omitKeys(v as Record<string, unknown>, RESULT_ARTIFACT_KEYS)
  for (const key of NESTED_RESULT_KEYS) {
    if (Object.hasOwn(trimmed, key)) {
      trimmed[key] = slimEmbeddedValuationForSessionPatch(trimmed[key], depth + 1)
    }
  }
  return trimmed
}

/**
 * Slims a valuation result for PUT `/result` transport. The canonical HTML is sent once via
 * `htmlReport`; Titan reattaches it to the saved valuation/report payload.
 */
export function stripReportBlobsFromValuationResult<T>(valuationResult: T): T {
  return slimEmbeddedValuationForSessionPatch(valuationResult) as T
}

/**
 * PUT /result already carries the authoritative calculation separately. Restored
 * sessions contain both result aliases, each with the full calculation trace;
 * sending them again can triple the request size and exceed the server limit.
 * Only use this when the request includes its own valuationResult.
 */
export function omitSessionValuationMirrors(sessionData: unknown, depth = 0): unknown {
  if (sessionData == null || typeof sessionData !== 'object' || Array.isArray(sessionData)) {
    return sessionData
  }
  if (depth > MAX_STRIP_DEPTH) throw new Error('Session envelope nesting exceeds the save limit')
  const next = omitKeys(sessionData as Record<string, unknown>, [
    'valuationResult',
    'valuation_result',
  ])
  for (const key of NESTED_SESSION_ENVELOPE_KEYS) {
    if (Object.hasOwn(next, key)) {
      next[key] = omitSessionValuationMirrors(next[key], depth + 1)
    }
  }
  return next
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
 * PATCH body (`updates`) - strips top-level blobs plus nested `sessionData` / `partialData` /
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
