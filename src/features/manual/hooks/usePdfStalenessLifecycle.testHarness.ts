import { vi } from 'vitest'
import type { ValuationReportData } from '@/components/calculator'
import { useManualResultsStore } from '@/store/manual'
import type { ValuationResponse } from '@/types/valuation'
import {
  type UsePdfStalenessLifecycleParams,
  usePdfStalenessLifecycle,
} from './usePdfStalenessLifecycle'

export function makeReport(partial: Partial<ValuationReportData> = {}): ValuationReportData {
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

export function makeFreshResponse(partial: Partial<ValuationResponse> = {}): ValuationResponse {
  return {
    valuation_id: 'rep_1',
    company_name: 'Test BV',
    updated_at: '2026-05-01T13:00:00.000Z',
    pdf_generated_at: '2026-05-01T13:00:01.000Z',
    pdf_url: 'https://example/new.pdf',
    ...partial,
  } as ValuationResponse
}

export function makeParams(
  override: Partial<UsePdfStalenessLifecycleParams> = {}
): UsePdfStalenessLifecycleParams {
  return {
    report: makeReport(),
    isPdfReady: false,
    isPdfGenerating: false,
    pdfGenerationState: { url: null },
    persistedReportLookupId: 'uuid-aaaa-bbbb',
    canDownloadPdf: true,
    generatePdf: vi.fn().mockResolvedValue(undefined),
    getReport: vi.fn(),
    setResult: vi.fn(),
    setReport: vi.fn(),
    openStarterPaywall: vi.fn(),
    showRetryFailureToast: vi.fn(),
    translate: vi.fn((key: string) => key),
    ...override,
  }
}

export function resetPdfStalenessHarness() {
  vi.useFakeTimers({ shouldAdvanceTime: false })
  useManualResultsStore.setState({ result: null })
}

export function restorePdfStalenessHarness() {
  vi.clearAllTimers()
  vi.useRealTimers()
  useManualResultsStore.setState({ result: null })
}

export { usePdfStalenessLifecycle }
export type { UsePdfStalenessLifecycleParams }
