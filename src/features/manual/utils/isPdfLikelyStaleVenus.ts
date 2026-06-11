import type { ValuationReportData } from '../../../components/calculator'
import { dateLikeToUnixMs } from '../../../utils/date-like'

export type PdfStalenessMeta = Pick<
  ValuationReportData,
  | 'reportUpdatedAt'
  | 'pdfGeneratedAt'
  | 'pdfUrl'
  | 'renderFingerprint'
  | 'pdfRenderFingerprint'
  | 'pdfCoherent'
>

function trimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * True when the downloadable PDF no longer reflects the current valuation.
 *
 * Authoritative-first: when Titan reports `pdfCoherent === true`, the persisted
 * PDF provably matches the current economics. That flag is computed server-side
 * by the SAME raw-vs-raw primitive (`getCoherentPersistedPdfUrl`) the bootstrap
 * and PDF controller use, so it never diverges from how the PDF was actually
 * fingerprinted. We short-circuit to "fresh" on `true` and never fall through to
 * the heuristics below (which compare a reconciled/hoisted `render_fingerprint`
 * against the raw `pdf_render_fingerprint` and can spuriously diverge for reports
 * carrying academic-validation issues). We intentionally do NOT treat `false`
 * as definitive: it also covers "no PDF yet", so we let the heuristics decide.
 *
 * Fingerprint-next: when both the current economic-snapshot fingerprint
 * (`renderFingerprint`) and the fingerprint the persisted PDF was built from
 * (`pdfRenderFingerprint`) are known, compare them directly. This deliberately
 * IGNORES `updated_at` vs `pdf_generated_at` so a no-op report open — which bumps
 * `updated_at` via the read-path HTML self-heal without changing economics — does
 * not falsely mark a present, current PDF as stale (the cause of the perpetual
 * "PDF wordt bijgewerkt…" banner + needless regen stampede).
 *
 * Falls back to the timestamp heuristic only when fingerprint evidence is
 * unavailable. If the API returns `pdf_url` but omits `pdf_generated_at`, we do
 * not treat the PDF as stale; otherwise a URL alone means "downloadable previous
 * PDF exists", not necessarily "fresh".
 *
 * Uses epoch-ms parsing so `Date` / ISO strings from JSON both work at runtime.
 */
export function isPdfLikelyStaleVenus(r: PdfStalenessMeta | null | undefined): boolean {
  if (!r) return false

  if (r.pdfCoherent === true) return false

  const renderFp = trimmedString(r.renderFingerprint)
  const pdfFp = trimmedString(r.pdfRenderFingerprint)
  if (renderFp !== '' && pdfFp !== '') {
    return renderFp !== pdfFp
  }

  if (!r.reportUpdatedAt) return false
  const updated = dateLikeToUnixMs(r.reportUpdatedAt)
  if (updated === null) return false

  const url = trimmedString(r.pdfUrl)
  if (url !== '' && r.pdfGeneratedAt == null) {
    return false
  }

  if (r.pdfGeneratedAt == null) return true
  const pdfAt = dateLikeToUnixMs(r.pdfGeneratedAt)
  if (pdfAt === null) return true
  return pdfAt < updated
}
