import { hydrateClientValuationResultsMap } from './extractValuationResultsMap'

/**
 * Stable per-run key for Venus (dedupe, warning reset keys, one-shot toasts).
 * Prefer server `valuation_id` / `id` (string, number, or bigint); otherwise fingerprint
 * hydrated per-method rows + headline fields + HTML digest + `updated_at` when present.
 */
export function valuationResultRunKey(result: unknown): string {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return ''

  const r = result as Record<string, unknown>
  const idRaw = r['valuation_id'] ?? r['id']
  if (typeof idRaw === 'string' && idRaw.trim().length > 0) return idRaw.trim()
  if (typeof idRaw === 'number' && Number.isFinite(idRaw)) return String(idRaw)
  if (typeof idRaw === 'bigint') return idRaw.toString()

  const hydrated = hydrateClientValuationResultsMap(result) ?? {}
  const sorted = Object.keys(hydrated)
    .sort()
    .map((k) => {
      const entry = hydrated[k] as { value?: unknown; available?: unknown } | undefined
      return `${k}:${entry?.available ?? ''}:${entry?.value ?? ''}`
    })
    .join('|')

  const details = r['details'] as Record<string, unknown> | undefined
  const asking = r['recommended_asking_price'] ?? details?.['recommended_asking_price'] ?? ''
  const selected = r['selected_valuation_method'] ?? ''
  const wv = r['weighted_valuation'] as { blended_equity_value?: unknown } | undefined
  const blended = wv?.blended_equity_value ?? ''

  const htmlRaw = r['html_report'] ?? details?.['html_report']
  const html = typeof htmlRaw === 'string' ? htmlRaw : ''
  const htmlSig = `${html.length}:${fnv1a(html.slice(0, 768))}`

  const rcd = r['current_year_data'] as Record<string, unknown> | null | undefined
  const headline =
    rcd && typeof rcd === 'object' && !Array.isArray(rcd)
      ? `${rcd['year'] ?? ''}:${rcd['revenue'] ?? ''}:${rcd['ebitda'] ?? ''}`
      : ''

  const updatedAt = r['updated_at']
  let ts = ''
  if (updatedAt instanceof Date && !Number.isNaN(updatedAt.getTime())) {
    ts = String(updatedAt.getTime())
  } else if (typeof updatedAt === 'string' || typeof updatedAt === 'number') {
    ts = String(updatedAt)
  }

  return `fp:${fnv1a(`${String(selected)}|${String(asking)}|${String(blended)}|${sorted}|${htmlSig}|${headline}|${ts}`)}`
}

function fnv1a(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}
