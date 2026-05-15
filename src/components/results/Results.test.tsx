import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '../../store/useSessionStore'
import type { ValuationResponse, ValuationSession } from '../../types/valuation'
import { Results } from './Results'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

describe('Results', () => {
  afterEach(() => {
    cleanup()
    useSessionStore.setState({
      session: null,
      status: 'idle',
      errorMessage: null,
    })
  })

  it('renders session html report even before result is bridged', () => {
    useSessionStore.setState({
      status: 'loaded',
      errorMessage: null,
      session: {
        reportId: 'val_ready',
        currentView: 'manual',
        dataSource: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        partialData: {},
        htmlReport: '<div>Ready report html</div>',
      } satisfies ValuationSession,
    })

    render(<Results result={null} />)

    expect(screen.getByText('Ready report html')).toBeInTheDocument()
  })

  it('renders transaction readiness from the hydrated session package', () => {
    useSessionStore.setState({
      status: 'loaded',
      errorMessage: null,
      session: {
        reportId: 'val_ready',
        currentView: 'manual',
        dataSource: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        partialData: {},
        htmlReport: '<div>Ready report html</div>',
        buyerReadiness: {
          generatedAt: '2026-05-15T10:00:00Z',
          status: 'needs_attention',
          completionPct: 75,
          summary: { complete: 2, needsAttention: 2, missing: 0, requiredTotal: 4 },
          normalizedEarnings: {
            status: 'documented',
            year: 2025,
            reportedEbitda: 200_000,
            normalizedEbitda: 260_000,
            totalAdjustments: 60_000,
            adjustmentCount: 2,
            categories: ['owner_salary'],
            confidence: 'high',
            taxLatencyCount: 1,
          },
          sellability: {
            assessmentId: 'assessment-1',
            score: 72,
            band: 'sale_ready_in_most_ways',
            confidence: 'high',
            createdAt: '2026-05-15T10:00:00Z',
            topActions: [
              {
                factor: 'customer_concentration',
                action: 'Reduce top customer concentration.',
                eurImpact: 120_000,
                confidence: 'high',
                upliftPct: 0.12,
              },
            ],
          },
          outputs: {
            valuationReport: 'complete',
            normalizedEbitdaBridge: 'complete',
            dataRoomChecklist: 'needs_attention',
            missingDocumentList: 'complete',
            buyerFaq: 'complete',
            teaserImDraft: 'needs_attention',
          },
          checklist: [
            {
              key: 'normalization_workbench',
              label: 'Defensible normalized earnings bridge',
              status: 'complete',
              required: true,
              detail: '2 adjustments documented.',
            },
          ],
          missingDocuments: [
            {
              key: 'normalization_evidence',
              label: 'Evidence for EBITDA add-backs',
              status: 'needs_attention',
              reason: 'Attach support.',
            },
          ],
          buyerFaq: [
            {
              question: 'Which earnings number should a buyer underwrite?',
              answer: 'Use normalized EBITDA.',
            },
          ],
          privateComps: {
            contributionEndpoint: '/api/v2/multiples/contribute',
            eligible: true,
            reason: 'Ready to contribute.',
            suggestedPayload: {
              business_type_id: 'software',
              country_code: 'BE',
              enterprise_value: 1_000_000,
              ebitda: 260_000,
              revenue: 1_200_000,
              observation_type: 'PLATFORM_VALUATION',
              valuation_methodology: 'MULTIPLES',
              contributor_reference: 'val_ready',
            },
          },
          handoff: {
            legalAiHandoffReady: true,
            target: 'lawyer_or_legal_ai',
            detail: 'Use the missing-document and sellability actions before handoff.',
          },
          sourceSignals: ['valuation_package', 'normalization_metadata'],
        },
      } satisfies ValuationSession,
    })

    render(<Results result={null} />)

    expect(screen.getByText('title')).toBeInTheDocument()
    expect(screen.getByText('Reduce top customer concentration.')).toBeInTheDocument()
    expect(screen.getByText('Defensible normalized earnings bridge')).toBeInTheDocument()
    expect(screen.getByText('Ready report html')).toBeInTheDocument()
  })

  it('treats legacy safety-net summary html as no report', () => {
    useSessionStore.setState({
      status: 'loaded',
      errorMessage: null,
      session: {
        reportId: 'val_safety',
        currentView: 'manual',
        dataSource: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        partialData: {},
        htmlReport:
          '<section class="legacy valuation-summary compact"><h1>Waardeschatting — samenvatting</h1></section>',
      } satisfies ValuationSession,
    })

    render(<Results result={null} />)

    expect(screen.queryByText(/Waardeschatting/)).not.toBeInTheDocument()
    expect(screen.getByText('reportNotAvailable')).toBeInTheDocument()
  })

  it('falls back to result html when session html is a legacy safety-net summary', () => {
    useSessionStore.setState({
      status: 'loaded',
      errorMessage: null,
      session: {
        reportId: 'val_fallback',
        currentView: 'manual',
        dataSource: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        partialData: {},
        htmlReport:
          '<section class="legacy valuation-summary compact"><h1>Waardeschatting — samenvatting</h1></section>',
      } satisfies ValuationSession,
    })

    render(
      <Results
        result={{ html_report: '<article>Full ValuationIQ report</article>' } as ValuationResponse}
      />
    )

    expect(screen.queryByText(/Waardeschatting/)).not.toBeInTheDocument()
    expect(screen.getByText('Full ValuationIQ report')).toBeInTheDocument()
  })
})
