import { extractValuationResultsMap } from './extractValuationResultsMap'

/**
 * Stable per-run key for Venus effects (assistant auto-open, one-shot toasts).
 * Prefer server `valuation_id` / `id`; otherwise a fingerprint so nested legacy payloads and
 * distinct HTML outputs still get unique keys when ids are absent.
 *
 * Fingerprint ingredients (aligned with {@link extractValuationResultsMap} / UI hydration):
 * - Hydrated per-method `available` / `value` (not only top-level `valuation_results`)
 * - Headline: `selected_valuation_method`, `recommended_asking_price`, blended equity if present
 * - Stable digest of rendered HTML (length + hash of prefix) so two runs rarely collide
 */
export function valuationResultRunKey(result: unknown): string {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return ''

  const r = result as Record<string, any>
  const vid = r.valuation_id ?? r.id
  if (typeof vid === 'string' && vid.trim().length > 0) {
    return vid.trim()
  }

  const hydrated =
    extractValuationResultsMap(r, {
      selectedValuationMethod:
        typeof r.selected_valuation_method === 'string' ? r.selected_valuation_method : null,
    }) ?? {}

  const sorted = Object.keys(hydrated)
    .sort()
    .map((k) => {
      const entry = hydrated[k] as { value?: unknown; available?: unknown } | undefined
      return `${k}:${entry?.available ?? ''}:${entry?.value ?? ''}`
    })
    .join('|')

  const details = r.details as Record<string, unknown> | undefined
  const asking =
    r.recommended_asking_price ?? details?.recommended_asking_price ?? ''
  const selected = r.selected_valuation_method ?? ''
  const wv = r.weighted_valuation as { blended_equity_value?: unknown } | undefined
  const blended = wv?.blended_equity_value ?? ''

  const htmlRaw = r.html_report ?? details?.html_report
  const html = typeof htmlRaw === 'string' ? htmlRaw : ''
  const htmlSig = `${html.length}:${fnv1a(html.slice(0, 768))}`

  return `fp:${fnv1a(`${String(selected)}|${String(asking)}|${String(blended)}|${sorted}|${htmlSig}`)}`
}

function fnv1a(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}
