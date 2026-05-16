/**
 * Aligns Titan session payloads with Venus routing: prefer stable `val_*` session keys over
 * valuation_reports UUIDs when both appear on the same object (fixes ensure-html + PDF export).
 * Also merges `sessionData` / `session_data` envelopes without letting `{}` hide the sibling blob.
 */

import { isSessionKey, isUuid } from './identifiers'

function trimString(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t.length > 0 ? t : undefined
}

/**
 * Merge top-level `sessionData` + `session_data` on a session-ish root (GET session payload,
 * Zustand session, etc.). Camel `sessionData` wins key conflicts (matches SessionAPI).
 *
 * Plain `{}` is treated as “absent” so it cannot hide a populated sibling envelope (same bug
 * class as ensure-html / mergeSessionFields missing valuation HTML).
 */
export function mergeSessionDataEnvelopesFromRoot(
  root: Record<string, any> | null | undefined
): Record<string, unknown> {
  if (!root || typeof root !== 'object') return {}

  const sd = root.sessionData
  const snake = root.session_data

  const rawSdObj =
    sd && typeof sd === 'object' && !Array.isArray(sd) ? (sd as Record<string, unknown>) : null
  const rawSnakeObj =
    snake && typeof snake === 'object' && !Array.isArray(snake)
      ? (snake as Record<string, unknown>)
      : null

  const sdObj = rawSdObj && Object.keys(rawSdObj).length === 0 ? null : rawSdObj
  const snakeObj = rawSnakeObj && Object.keys(rawSnakeObj).length === 0 ? null : rawSnakeObj

  if (!sdObj && !snakeObj) return {}
  if (!sdObj) return { ...(snakeObj ?? {}) }
  if (!snakeObj) return { ...sdObj }
  return { ...snakeObj, ...sdObj }
}

/**
 * Best-effort stable session key from merged session (top-level or nested sessionData).
 */
export function extractStableSessionKeyFromMergedSession(
  s: Record<string, any> | null | undefined
): string | undefined {
  if (!s || typeof s !== 'object') return undefined

  const candidates: (string | undefined)[] = [trimString(s.session_key), trimString(s.sessionKey)]

  // Both shapes can appear on merged sessions; prefer scanning both — an empty `sessionData`
  // object must not hide `session_data.session_key` from Titan payloads.
  for (const nested of [s.sessionData, s.session_data]) {
    if (nested && typeof nested === 'object') {
      const n = nested as Record<string, unknown>
      candidates.push(trimString(n.session_key))
      candidates.push(trimString(n.sessionKey))
    }
  }

  for (const c of candidates) {
    if (c && isSessionKey(c)) return c
  }
  return undefined
}

/**
 * Prefer `session_key` / `sessionKey` for `reportId` when it is a stable `val_*` handle and the
 * explicit `reportId` is missing, is a UUID, or disagrees with that handle.
 * Mutates `payload` in place (API boundary normalization).
 *
 * Scans nested `sessionData` / `session_data` so this runs safely before SessionAPI merges
 * envelopes (same ordering bug as empty `sessionData` hiding snake_case blobs).
 */
export function applyStableReportIdFromSessionKeys(payload: Record<string, any>): void {
  const sessionKeyCandidate = extractStableSessionKeyFromMergedSession(payload)

  const explicitReportId = trimString(payload.reportId) ?? ''

  if (sessionKeyCandidate) {
    if (!explicitReportId || explicitReportId !== sessionKeyCandidate || isUuid(explicitReportId)) {
      payload.reportId = sessionKeyCandidate
    }
  } else if (!explicitReportId) {
    const fallback = trimString(payload.session_key)
    if (fallback) payload.reportId = fallback
  }
}
