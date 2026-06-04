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

  it('usePdfGeneration encodes report IDs for both generation and download routes', () => {
    const source = readVenus('hooks/usePdfGeneration.ts')

    expect(source).toMatch(/\/api\/valuations\/\$\{encodeURIComponent\(targetReportId\)\}\/pdf/)
    expect(source).toMatch(
      /\/api\/valuations\/\$\{encodeURIComponent\(targetReportId\)\}\/pdf\/download/
    )
  })
})
