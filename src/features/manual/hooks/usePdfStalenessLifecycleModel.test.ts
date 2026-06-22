import { describe, expect, it } from 'vitest'
import type { ValuationReportData } from '@/components/calculator'
import { APIError } from '@/types/errors'
import {
  derivePdfStale,
  getBySession404BackoffDelayMs,
  getNextPdfWaitExtensionMs,
  getPdfWaitDelayMs,
  getTransientPollBackoffDelayMs,
  isTransientPollError,
  PDF_STALE_WAIT_EXTENSION_MS,
  PDF_STALE_WAIT_MAX_MS,
  PDF_STALE_WAIT_TIMEOUT_MS,
} from './usePdfStalenessLifecycleModel'

function makeReport(partial: Partial<ValuationReportData> = {}): ValuationReportData {
  return {
    id: 'rep_1',
    companyName: 'Test BV',
    valuation: 1_000_000,
    multiple: 5,
    generatedAt: new Date('2026-05-01T00:00:00Z'),
    confidenceLevel: 'high',
    metrics: [],
    htmlReport: '<div>html</div>',
    reportUpdatedAt: new Date('2026-05-01T12:00:00Z'),
    pdfGeneratedAt: new Date('2026-05-01T11:00:00Z'),
    pdfUrl: 'https://example/old.pdf',
    ...partial,
  } as ValuationReportData
}

describe('usePdfStalenessLifecycleModel', () => {
  it('derives stale PDF state while trusting fresh local generation', () => {
    const staleReport = makeReport({
      reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
      pdfGeneratedAt: new Date('2026-05-01T13:00:00Z'),
    })

    expect(
      derivePdfStale({
        report: staleReport,
        isPdfReady: false,
        pdfGenerationUrl: null,
      })
    ).toBe(true)
    expect(
      derivePdfStale({
        report: staleReport,
        isPdfReady: true,
        pdfGenerationUrl: 'https://example/fresh.pdf',
      })
    ).toBe(false)
    expect(
      derivePdfStale({
        report: makeReport({ pdfGeneratedAt: null }),
        isPdfReady: true,
        pdfGenerationUrl: null,
      })
    ).toBe(false)
  })

  it('caps wait-timeout extension at the lifecycle maximum', () => {
    expect(getPdfWaitDelayMs(0)).toBe(PDF_STALE_WAIT_TIMEOUT_MS)
    expect(getNextPdfWaitExtensionMs(0)).toBe(PDF_STALE_WAIT_EXTENSION_MS)

    let extension = 0
    for (let i = 0; i < 20; i++) {
      extension = getNextPdfWaitExtensionMs(extension)
    }

    expect(getPdfWaitDelayMs(extension)).toBe(PDF_STALE_WAIT_MAX_MS)
  })

  it('calculates bounded backoff for session 404 and transient poll errors', () => {
    expect(getBySession404BackoffDelayMs(1)).toBe(2_500)
    expect(getBySession404BackoffDelayMs(2)).toBe(5_000)
    expect(getBySession404BackoffDelayMs(99)).toBe(60_000)

    expect(getTransientPollBackoffDelayMs(1)).toBe(2_500)
    expect(getTransientPollBackoffDelayMs(2)).toBe(5_000)
    expect(getTransientPollBackoffDelayMs(99)).toBe(30_000)
  })

  it('classifies only transient upstream API errors as transient poll errors', () => {
    expect(isTransientPollError(new APIError('pooler', 503))).toBe(true)
    expect(isTransientPollError(new APIError('rate limited', 429))).toBe(true)
    expect(isTransientPollError(new APIError('bad request', 400))).toBe(false)
    expect(isTransientPollError(new Error('network'))).toBe(false)
  })
})
