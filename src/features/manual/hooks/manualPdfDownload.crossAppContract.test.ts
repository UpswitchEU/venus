/**
 * Regression guards for Venus PDF downloads.
 *
 * Titan still exposes a legacy accountant-only PDF route for compatibility,
 * but Venus user-facing downloads must use the BFF `/api/valuations/:id/pdf`
 * routes so sellers/advisors get the same access checks, stale-PDF recovery,
 * and paywall JSON contract.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const venusRoot = join(__dirname, '../../..')

function readVenus(pathFromSrc: string): string {
  return readFileSync(join(venusRoot, pathFromSrc), 'utf8')
}

describe('manual PDF download contract', () => {
  it('manual toolbar uses the modern BFF PDF download hook, not the legacy accountant route', () => {
    const source = readVenus('features/manual/hooks/useManualToolbar.ts')

    expect(source).toMatch(/usePdfGeneration/)
    expect(source).toMatch(/downloadPdf\(undefined, filename, abortController\.signal, reportId\)/)
    expect(source).toMatch(/isPdfTransientUpstreamStatus/)
    expect(source).not.toMatch(/downloadAccountantViewPDF/)
    expect(source).not.toMatch(/accountant-view/)
  })

  it('Venus report APIs do not expose the legacy accountant-view PDF helper', () => {
    for (const path of [
      'services/api/report/ReportAPI.ts',
      'services/backendApi.ts',
      'services/downloadService.ts',
    ]) {
      const source = readVenus(path)
      expect(source).not.toMatch(/downloadAccountantViewPDF/)
      expect(source).not.toMatch(/\/api\/v2\/valuations\/pdf\/accountant-view/)
      expect(source).not.toMatch(/\/api\/valuations\/pdf\/accountant-view/)
    }
  })

  it('PDF generation client encodes report IDs for both generation and download routes', () => {
    const source = readVenus('hooks/pdfGenerationClient.ts')

    expect(source).toMatch(/\/api\/valuations\/\$\{encodeURIComponent\(reportId\)\}\/pdf/)
    expect(source).toMatch(/\/api\/valuations\/\$\{encodeURIComponent\(reportId\)\}\/pdf\/download/)
  })

  it('usePdfGeneration forwards delegated client-context headers on PDF BFF fetches', () => {
    const source = readVenus('hooks/usePdfGeneration.ts')

    expect(source).toMatch(/getContextHeaders/)
    expect(source).toMatch(/pdfFetchHeaders/)
  })

  it('ManualPdfStaleBanner surfaces transient poll degradation', () => {
    const source = readVenus('features/manual/components/ManualPdfStaleBanner.tsx')
    expect(source).toMatch(/pdfPollTransientCount/)
    expect(source).toMatch(/pdfPollDegradedHint/)
  })

  it('PDF transient upstream statuses are centralized', () => {
    expect(readVenus('utils/pdfTransientUpstream.ts')).toMatch(/PDF_TRANSIENT_UPSTREAM_STATUSES/)
    expect(readVenus('utils/pdfTransientUpstream.ts')).toMatch(
      /isPdfTransientUpstreamStatus\(status: number \| undefined\)/
    )
    expect(readVenus('hooks/usePdfGeneration.ts')).toMatch(/isPdfTransientUpstreamStatus/)
    expect(readVenus('features/manual/hooks/usePdfStalenessLifecycleModel.ts')).toMatch(
      /isPdfTransientUpstreamStatus/
    )
    expect(readVenus('features/manual/hooks/usePdfStalenessLifecycle.ts')).toMatch(
      /isTransientPollError/
    )
    expect(readVenus('features/manual/hooks/useManualPdfExportController.ts')).toMatch(
      /isPdfTransientUpstreamStatus/
    )
    expect(readVenus('features/manual/hooks/useManualReportApproval.ts')).toMatch(
      /fetchBffJsonWithTransientRetry/
    )
    expect(readVenus('features/manual/hooks/useManualReportApproval.ts')).toMatch(
      /isTransientUpstreamFailure/
    )
    expect(readVenus('hooks/valuationToolbar/useValuationToolbarDownload.ts')).toMatch(
      /isPdfTransientUpstreamStatus/
    )
  })

  it('PDF BFF routes forward client-context headers to Titan', () => {
    for (const path of [
      '../app/api/valuations/[id]/pdf/route.ts',
      '../app/api/valuations/pdf/status/[jobId]/route.ts',
      '../app/api/valuations/[id]/pdf/download/route.ts',
    ]) {
      const source = readVenus(path)
      expect(source).toMatch(/getTitanClientContextHeaders/)
    }
  })
})
