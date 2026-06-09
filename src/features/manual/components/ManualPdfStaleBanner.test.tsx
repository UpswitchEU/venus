import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ValuationReportData } from '../../../components/calculator'
import { ManualPdfStaleBanner } from './ManualPdfStaleBanner'

function makeReport(): ValuationReportData {
  return {
    id: 'rep_1',
    companyName: 'Test BV',
    valuation: 1_000_000,
    multiple: 5,
    generatedAt: new Date('2026-05-01T00:00:00Z'),
    confidenceLevel: 'high',
    metrics: [],
    htmlReport: '<div>html</div>',
    reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
    pdfGeneratedAt: new Date('2026-05-01T13:00:00Z'),
    pdfUrl: 'https://example/old.pdf',
  } as ValuationReportData
}

const translate = (key: string) => key

describe('ManualPdfStaleBanner', () => {
  it('renders nothing when pdf is not stale', () => {
    const { container } = render(
      <ManualPdfStaleBanner
        canDownloadPdf
        isPdfRetrying={false}
        onRetry={vi.fn()}
        persistedReportLookupId="uuid-1"
        pdfPollErrorCount={0}
        pdfPollTransientCount={0}
        pdfStale={false}
        pdfWaitTimedOut={false}
        report={makeReport()}
        translate={translate}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for the benign updating state (stale but not timed out)', () => {
    // The report is fully viewable and the PDF refreshes silently in the
    // background, so the benign "updating" state must not surface a banner —
    // showing it on every open is the friction the user complained about.
    const { container } = render(
      <ManualPdfStaleBanner
        canDownloadPdf
        isPdfRetrying={false}
        onRetry={vi.fn()}
        persistedReportLookupId="uuid-1"
        pdfPollErrorCount={0}
        pdfPollTransientCount={0}
        pdfStale
        pdfWaitTimedOut={false}
        report={makeReport()}
        translate={translate}
      />
    )
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText('pdfUpdating')).not.toBeInTheDocument()
    expect(screen.queryByText('pdfRetry')).not.toBeInTheDocument()
  })

  it('shows degraded hint after transient poll errors once stalled', () => {
    render(
      <ManualPdfStaleBanner
        canDownloadPdf
        isPdfRetrying={false}
        onRetry={vi.fn()}
        persistedReportLookupId="uuid-1"
        pdfPollErrorCount={0}
        pdfPollTransientCount={2}
        pdfStale
        pdfWaitTimedOut
        report={makeReport()}
        translate={translate}
      />
    )
    expect(screen.getByText('pdfPollDegradedHint')).toBeInTheDocument()
  })

  it('shows retry CTA when stalled', () => {
    render(
      <ManualPdfStaleBanner
        canDownloadPdf
        isPdfRetrying={false}
        onRetry={vi.fn()}
        persistedReportLookupId="uuid-1"
        pdfPollErrorCount={0}
        pdfPollTransientCount={0}
        pdfStale
        pdfWaitTimedOut
        report={makeReport()}
        translate={translate}
      />
    )
    expect(screen.getByText('pdfStalledTitle')).toBeInTheDocument()
    expect(screen.getByText('pdfRetry')).toBeInTheDocument()
    expect(screen.getByText('pdfOpenLastVersion')).toBeInTheDocument()
  })
})
