import type { ValuationReportData } from '../../../components/calculator'
import { dateLikeToUnixMs } from '../../../utils/date-like'

/**
 * True when the stored PDF is older than the last report update (async PDF queue may still be running).
 *
 * If the API returns `pdf_url` but omits `pdf_generated_at`, we do not treat the PDF as stale — the
 * download is still valid and blocking UX would be wrong.
 *
 * Uses epoch-ms parsing so `Date` / ISO strings from JSON both work at runtime.
 */
export function isPdfLikelyStaleVenus(r: ValuationReportData | null | undefined): boolean {
  if (!r?.reportUpdatedAt) return false
  const updated = dateLikeToUnixMs(r.reportUpdatedAt)
  if (updated === null) return false

  const url = typeof r.pdfUrl === 'string' ? r.pdfUrl.trim() : ''
  if (url !== '' && r.pdfGeneratedAt == null) {
    return false
  }

  if (r.pdfGeneratedAt == null) return true
  const pdfAt = dateLikeToUnixMs(r.pdfGeneratedAt)
  if (pdfAt === null) return true
  return pdfAt < updated
}
