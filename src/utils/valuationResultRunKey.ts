import { hydrateClientValuationResultsMap } from './extractValuationResultsMap'

/**
 * Stable key for “this valuation run” for client-side dedupe (assistant auto-open, blend toast).
 * Prefer Titan `valuation_id` / `id` when present so the same logical run always matches.
 * When missing, fingerprint hydrated method keys + headline fields + weighted summary + HTML shape
 * (length + small hash prefix) so re-renders of the same payload do not look like new runs.
 *
 * Product note: returning `valuation_id` from the API on every response keeps fingerprint mode rare.
 */
export function valuationResultRunKey(
  result: Record<string, unknown> | null | undefined
): string {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return 'unknown'

  const idRaw = result['valuation_id'] ?? result['id']
  if (typeof idRaw === 'string' && idRaw.trim()) return idRaw.trim()
  if (typeof idRaw === 'number' && Number.isFinite(idRaw)) return String(idRaw)
  if (typeof idRaw === 'bigint') return idRaw.toString()

  const map = hydrateClientValuationResultsMap(result as Record<string, any>)
  const keys = map ? Object.keys(map).sort().join(',') : ''

  const wv = result['weighted_valuation'] as Record<string, unknown> | null | undefined
  const wvSig =
    wv && typeof wv === 'object' && !Array.isArray(wv)
      ? String(wv['blended_equity_value'] ?? '')
      : ''

  const html = typeof result['html_report'] === 'string' ? result['html_report'] : ''
  const htmlLen = html.length
  const htmlPrefix = html.slice(0, 200)
  let h = 0
  for (let i = 0; i < htmlPrefix.length; i++) h = (h * 31 + htmlPrefix.charCodeAt(i)) | 0

  const rcd = result['current_year_data'] as Record<string, unknown> | null | undefined
  const headline =
    rcd && typeof rcd === 'object' && !Array.isArray(rcd)
      ? `${rcd['year'] ?? ''}:${rcd['revenue'] ?? ''}:${rcd['ebitda'] ?? ''}`
      : ''

  const updatedAt = result['updated_at']
  let ts = ''
  if (updatedAt instanceof Date && !Number.isNaN(updatedAt.getTime())) {
    ts = String(updatedAt.getTime())
  } else if (typeof updatedAt === 'string' || typeof updatedAt === 'number') {
    ts = String(updatedAt)
  }

  return `fp:${keys}|${wvSig}|${headline}|${htmlLen}|${h}|${ts}`
}
