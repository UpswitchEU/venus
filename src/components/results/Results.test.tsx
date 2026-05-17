import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
          dataRoomPlan: {
            status: 'needs_attention',
            completionPct: 88,
            readyCount: 3,
            totalRequired: 4,
            sections: [
              {
                key: 'financials',
                label: 'Financials',
                status: 'complete',
                items: [
                  {
                    key: 'financial_history',
                    label: 'Last two to three years of financials',
                    category: 'financials',
                    status: 'complete',
                    required: true,
                    detail: 'Three years available.',
                    evidence: ['2023-2025 accounts'],
                  },
                ],
              },
              {
                key: 'normalization',
                label: 'Normalization evidence',
                status: 'needs_attention',
                items: [
                  {
                    key: 'normalization_evidence',
                    label: 'Evidence for EBITDA add-backs',
                    category: 'normalization',
                    status: 'needs_attention',
                    required: true,
                    detail: 'Attach support.',
                    evidence: ['620000'],
                  },
                ],
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
          },
          buyerFaq: [
            {
              question: 'Which earnings number should a buyer underwrite?',
              answer: 'Use normalized EBITDA.',
            },
          ],
          normalizationBridge: {
            status: 'complete',
            year: 2025,
            reportedEbitda: 200_000,
            normalizedEbitda: 260_000,
            totalAdjustments: 60_000,
            currency: 'EUR',
            confidence: 'high',
            source: 'valuation.normalization_metadata',
            rows: [
              {
                key: 'owner-salary',
                label: 'Owner salary normalization',
                category: 'owner_compensation_adjustment',
                amount: 60_000,
                rationale: 'Owner salary above market benchmark.',
                source: '620000',
                confidence: 'high',
                evidenceStatus: 'complete',
              },
            ],
            auditTrail: {
              adjustmentCount: 1,
              customAdjustmentCount: 0,
              taxLatencyCount: 1,
              evidenceMissingCount: 0,
            },
          },
          workingCapital: {
            status: 'complete',
            currentYear: 2025,
            currentNwc: 280_000,
            nwcChange: 30_000,
            nwcSurplusDeficit: 10_000,
            actualNwcYears: 2,
            basis: 'current_assets_liabilities',
            confidence: 'medium',
            evidence: ['Current assets/current liabilities basis', 'Current NWC EUR 280,000'],
            missingInputs: [],
            detail:
              'Working capital is supported by 2 actual year(s), current NWC of EUR 280,000, and NWC change of EUR 30,000.',
          },
          sellabilityPlan: {
            status: 'needs_attention',
            assessmentId: 'assessment-1',
            score: 72,
            band: 'sale_ready_in_most_ways',
            confidence: 'high',
            factorBreakdown: [
              {
                key: 'customer_concentration',
                label: 'Customer concentration',
                score: 42,
                weight: 0.2,
                contribution: 8.4,
                dataAvailable: true,
                status: 'needs_attention',
                detail: 'Customer concentration is a buyer-risk driver to improve before outreach.',
              },
            ],
            actions: [
              {
                key: 'primary:customer_concentration:0',
                factor: 'customer_concentration',
                action: 'Reduce top customer concentration.',
                priority: 'primary',
                eurImpact: 120_000,
                confidence: 'high',
                upliftPct: 0.12,
              },
            ],
            evidenceGaps: [
              'Customer concentration is a buyer-risk driver to improve before outreach.',
            ],
          },
          commercialReadiness: {
            status: 'needs_attention',
            readyCount: 4,
            totalRequired: 6,
            signals: [
              {
                key: 'customer_concentration',
                label: 'Customer concentration',
                status: 'needs_attention',
                score: 42,
                value: '42/100',
                detail: 'Customer concentration is a buyer-risk driver to improve before outreach.',
                evidence: ['Titan sellability assessment', 'Customer concentration 42/100'],
                action: 'Reduce top customer concentration.',
                source: 'sellability_assessment',
              },
              {
                key: 'contract_coverage',
                label: 'Contract coverage',
                status: 'missing',
                score: null,
                value: null,
                detail: 'Customer contracts, backlog, or contracted-share evidence is missing.',
                evidence: [],
                action: null,
                source: 'missing',
              },
            ],
            priorityActions: [
              {
                key: 'primary:customer_concentration:0',
                factor: 'customer_concentration',
                action: 'Reduce top customer concentration.',
                priority: 'primary',
                eurImpact: 120_000,
                confidence: 'high',
                upliftPct: 0.12,
              },
            ],
            evidenceGaps: [
              'Customer concentration is a buyer-risk driver to improve before outreach.',
              'Customer contracts, backlog, or contracted-share evidence is missing.',
            ],
          },
          teaserImDraft: {
            status: 'needs_attention',
            title: 'Preliminary buyer teaser for Acme BV',
            summary: 'Vertical software for installers.',
            highlights: ['Operating in vertical SaaS.', 'Normalized earnings basis: EUR 260,000.'],
            buyerConsiderations: ['Attach support.'],
            nextSteps: [
              'Attach source evidence for each EBITDA normalization before buyer outreach.',
            ],
          },
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
    expect(screen.getByText('Owner salary normalization')).toBeInTheDocument()
    expect(screen.getAllByText('workingCapital')).toHaveLength(2)
    expect(screen.getByText('Current NWC EUR 280,000')).toBeInTheDocument()
    expect(screen.getByText('3/4')).toBeInTheDocument()
    expect(screen.getByText('dataRoomPlan')).toBeInTheDocument()
    expect(screen.getByText('Financials')).toBeInTheDocument()
    expect(screen.getAllByText('Customer concentration').length).toBeGreaterThan(0)
    expect(screen.getByText('commercialReadiness')).toBeInTheDocument()
    expect(screen.getByText('Contract coverage')).toBeInTheDocument()
    expect(screen.getByText('Preliminary buyer teaser for Acme BV')).toBeInTheDocument()
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

  it('shows the EV-to-equity waterfall by default when bridge steps are present', () => {
    render(
      <Results
        result={
          {
            html_report: '<article>Full ValuationIQ report</article>',
            ev_equity_waterfall_steps: [
              {
                label: 'Enterprise value',
                short_label: 'EV',
                kind: 'base',
                end_value: 1_000_000,
              },
              {
                label: 'Net debt',
                short_label: 'Debt',
                kind: 'adjustment',
                tone: 'negative',
                delta_value: -150_000,
                end_value: 850_000,
              },
              {
                label: 'Equity value',
                short_label: 'Equity',
                kind: 'total',
                end_value: 850_000,
              },
            ],
          } as ValuationResponse
        }
      />
    )

    expect(screen.getByText('Full ValuationIQ report')).toBeInTheDocument()
    expect(screen.getByLabelText('ariaLabel')).toBeInTheDocument()
  })

  it('hides the EV-to-equity waterfall when the advisor transparency toggle is off', () => {
    render(
      <Results
        result={
          {
            html_report: '<article>Full ValuationIQ report</article>',
            metadata: {
              show_enterprise_to_equity_bridge: false,
            },
            ev_equity_waterfall_steps: [
              {
                label: 'Enterprise value',
                short_label: 'EV',
                kind: 'base',
                end_value: 1_000_000,
              },
              {
                label: 'Equity value',
                short_label: 'Equity',
                kind: 'total',
                end_value: 850_000,
              },
            ],
          } as ValuationResponse
        }
      />
    )

    expect(screen.getByText('Full ValuationIQ report')).toBeInTheDocument()
    expect(screen.queryByLabelText('ariaLabel')).not.toBeInTheDocument()
  })

  it('lets advisors toggle the EV-to-equity bridge from the Results page', () => {
    render(
      <Results
        result={
          {
            html_report:
              '<article><div class="ev-equity-waterfall-section">Backend bridge</div>Full ValuationIQ report</article>',
            ev_equity_waterfall_steps: [
              {
                label: 'Enterprise value',
                short_label: 'EV',
                kind: 'base',
                end_value: 1_000_000,
              },
              {
                label: 'Equity value',
                short_label: 'Equity',
                kind: 'total',
                end_value: 850_000,
              },
            ],
          } as ValuationResponse
        }
      />
    )

    const toggle = screen.getByRole('switch', { name: 'enterpriseBridgeToggle' })
    const container = screen
      .getByText('Full ValuationIQ report')
      .closest('.valuation-report-container')

    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(container).toHaveAttribute('data-show-enterprise-bridge', 'true')
    expect(screen.getByLabelText('ariaLabel')).toBeInTheDocument()

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(container).toHaveAttribute('data-show-enterprise-bridge', 'false')
    expect(screen.queryByLabelText('ariaLabel')).not.toBeInTheDocument()
  })
})
