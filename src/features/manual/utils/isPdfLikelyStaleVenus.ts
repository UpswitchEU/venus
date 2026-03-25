import type { ValuationReportData } from '../../../components/calculator'

/**
 * True when the stored PDF is older than the last report update (async PDF queue may still be running).
 *
 * If the API returns `pdf_url` but omits `pdf_generated_at`, we do not treat the PDF as stale — the
 * download is still valid and blocking UX would be wrong.
 */
export function isPdfLikelyStaleVenus(r: ValuationReportData | null | undefined): boolean {
  if (!r?.reportUpdatedAt) return false
  const updated = r.reportUpdatedAt.getTime()
  if (!Number.isFinite(updated)) return false

  const url = typeof r.pdfUrl === 'string' ? r.pdfUrl.trim() : ''
  if (url !== '' && r.pdfGeneratedAt == null) {
    return false
  }

  if (r.pdfGeneratedAt == null) return true
  const pdfAt = r.pdfGeneratedAt.getTime()
  if (!Number.isFinite(pdfAt)) return true
  return pdfAt < updated
}
