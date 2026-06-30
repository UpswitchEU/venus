import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatAssistantAdvisoryPreviewCards } from './ChatAssistantAdvisoryPreviewCards'
import type { ChatMessage } from './ChatAssistantTypes'

describe('ChatAssistantAdvisoryPreviewCards', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('turns a ready listing preview into buyer-profile and listing-draft follow-ups', () => {
    const onSendFollowUp = vi.fn()
    const message: ChatMessage = {
      id: 'msg-1',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      listingPreviews: [
        {
          id: 'listing-preview-1',
          status: 'ok',
          reportId: 'report-1',
          sourceBusinessName: 'Acme BV',
          preview: {
            title: 'B2B software company',
            sector: 'Software',
            region: 'Flanders',
            revenueRange: '€1M-€2M',
            employeeRange: '10-20',
          },
        },
      ],
    }

    render(<ChatAssistantAdvisoryPreviewCards message={message} onSendFollowUp={onSendFollowUp} />)

    fireEvent.click(
      screen.getByRole('button', { name: 'proposalCards.listingPreview.profileBuyersAction' })
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'proposalCards.listingPreview.createDraftAction' })
    )

    expect(onSendFollowUp).toHaveBeenNthCalledWith(
      1,
      'Profile likely buyers for valuation report report-1.'
    )
    expect(onSendFollowUp).toHaveBeenNthCalledWith(
      2,
      'Prepare a private marketplace listing draft for valuation report report-1.'
    )
  })

  it('renders Advisor Co-Pilot drafts and keeps follow-ups advisor-review-only', () => {
    const onSendFollowUp = vi.fn()
    const message: ChatMessage = {
      id: 'msg-copilot',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      advisorCopilotDrafts: [
        {
          id: 'copilot-1',
          status: 'pending_review',
          reportId: 'report-1',
          businessName: 'Acme BV',
          yearPlan: [
            {
              title: 'Reduce customer concentration',
              objective: 'Move top-3 concentration below 45%.',
              targetDelta: 180000,
              sourceKeys: ['valuation'],
            },
          ],
          firstCheckInAgenda: [
            {
              title: 'Owner commitments',
              durationMinutes: 20,
              ownerPrompt: 'Which accounts can shift to contracted revenue this quarter?',
              sourceKeys: ['valuation'],
            },
          ],
          talkingPoints: [
            {
              point: 'Concentration is the largest value-up lever.',
              euroDelta: 180000,
              sourceKeys: ['valuation'],
            },
          ],
          billableServiceAngles: [
            {
              title: 'Revenue quality sprint',
              scope: 'Four weekly advisor sessions.',
              sourceKeys: ['valuation'],
            },
          ],
          citations: [{ key: 'valuation', label: 'Latest valuation', source: 'valuation' }],
          message: 'Draft ready for advisor review.',
        },
      ],
    }

    render(<ChatAssistantAdvisoryPreviewCards message={message} onSendFollowUp={onSendFollowUp} />)

    expect(screen.getByText('Reduce customer concentration')).toBeInTheDocument()
    expect(screen.getByText('Revenue quality sprint')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'proposalCards.advisorCopilot.editAction' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'proposalCards.advisorCopilot.createSessionAction' })
    )

    expect(onSendFollowUp).toHaveBeenNthCalledWith(
      1,
      'Refine the Advisor Co-Pilot draft for Acme BV: tighten the year plan, agenda, talking points and service angles while keeping every € impact cited.'
    )
    expect(onSendFollowUp).toHaveBeenNthCalledWith(
      2,
      'Turn this Advisor Co-Pilot draft into the first trajectory check-in session for Acme BV.'
    )
  })

  it('omits Belgian bootstrap accounting follow-ups when integrations are plan-locked', () => {
    const onSendFollowUp = vi.fn()
    const message: ChatMessage = {
      id: 'msg-bootstrap-locked',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      belgianCompanyBootstraps: [
        {
          id: 'bootstrap-locked',
          status: 'ok',
          identity: {
            legalName: 'Locked BV',
            kboNumber: '0123456789',
          },
        },
      ],
    }

    render(<ChatAssistantAdvisoryPreviewCards message={message} onSendFollowUp={onSendFollowUp} />)

    expect(
      screen.queryByRole('button', {
        name: 'proposalCards.belgianBootstrap.connectAccountingAction',
      })
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'proposalCards.belgianBootstrap.startValuationAction' })
    )

    expect(onSendFollowUp).toHaveBeenCalledWith(
      'Start a valuation for Locked BV using the public data, then ask me for any missing inputs.'
    )
  })

  it('uses listing preview gap hints as a conversational repair action', () => {
    const onSendFollowUp = vi.fn()
    const message: ChatMessage = {
      id: 'msg-1',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      listingPreviews: [
        {
          id: 'listing-preview-2',
          status: 'blocked',
          sourceBusinessName: 'Acme BV',
          missingFields: ['region', 'employee_range'],
          nextActionHint: 'Ask the owner for region and employee range.',
        },
      ],
    }

    render(<ChatAssistantAdvisoryPreviewCards message={message} onSendFollowUp={onSendFollowUp} />)

    fireEvent.click(
      screen.getByRole('button', { name: 'proposalCards.listingPreview.resolveGapsAction' })
    )

    expect(onSendFollowUp).toHaveBeenCalledWith('Ask the owner for region and employee range.')
  })

  it('defaults missing client-data readiness to manual figures when integrations are locked', () => {
    const onSendFollowUp = vi.fn()
    const message: ChatMessage = {
      id: 'msg-readiness-locked',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      clientDataReadinessPreviews: [
        {
          id: 'readiness-locked',
          status: 'missing_financials',
          clientId: 'client-locked',
          businessName: 'Locked Client BV',
          hasSyncedFinancials: false,
        },
      ],
    }

    render(<ChatAssistantAdvisoryPreviewCards message={message} onSendFollowUp={onSendFollowUp} />)

    expect(
      screen.queryByRole('button', {
        name: 'proposalCards.clientDataReadiness.connectAccountingAction',
      })
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'proposalCards.clientDataReadiness.enterFiguresAction',
      })
    )

    expect(onSendFollowUp).toHaveBeenCalledWith(
      'Enter financials manually for Locked Client BV: revenue + EBITDA by fiscal year.'
    )
  })

  it('routes buyer-profile cards toward listing creation or missing-field completion', () => {
    const onSendFollowUp = vi.fn()
    const message: ChatMessage = {
      id: 'msg-1',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      buyerProfilePreviews: [
        {
          id: 'buyer-profile-1',
          status: 'ok',
          reportId: 'report-2',
          sourceBusinessName: 'Beta BV',
          listingReadiness: {
            status: 'ready',
            missingFields: [],
          },
          buyerSegments: [{ label: 'Strategic buyer', fitScore: 91 }],
        },
        {
          id: 'buyer-profile-2',
          status: 'blocked',
          sourceBusinessName: 'Gamma BV',
          listingReadiness: {
            status: 'missing_fields',
            missingFields: ['asking_price', 'region'],
          },
        },
      ],
    }

    render(<ChatAssistantAdvisoryPreviewCards message={message} onSendFollowUp={onSendFollowUp} />)

    fireEvent.click(
      screen.getByRole('button', { name: 'proposalCards.buyerProfile.createListingAction' })
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'proposalCards.buyerProfile.resolveGapsAction' })
    )

    expect(onSendFollowUp).toHaveBeenNthCalledWith(
      1,
      'Prepare a private marketplace listing draft for valuation report report-2.'
    )
    expect(onSendFollowUp).toHaveBeenNthCalledWith(
      2,
      'Help me complete the missing listing fields for Gamma BV: asking_price, region.'
    )
  })

  it('turns Belgian public-data bootstrap cards into onboarding and valuation follow-ups', () => {
    const onSendFollowUp = vi.fn()
    const message: ChatMessage = {
      id: 'msg-2',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      belgianCompanyBootstraps: [
        {
          id: 'bootstrap-1',
          status: 'ok',
          identity: {
            legalName: 'Acme BV',
            kboNumber: '0123456789',
            city: 'Gent',
            isActive: true,
          },
          filingSummary: {
            status: 'ok',
            filingYear: 2025,
            revenue: 1_200_000,
            ebitda: 180_000,
          },
          valuationPreview: {
            status: 'ok',
            equityMid: 900_000,
          },
        },
      ],
    }

    render(
      <ChatAssistantAdvisoryPreviewCards
        message={message}
        onSendFollowUp={onSendFollowUp}
        integrationsEnabled
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'proposalCards.belgianBootstrap.createClientAction' })
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'proposalCards.belgianBootstrap.connectAccountingAction',
      })
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'proposalCards.belgianBootstrap.startValuationAction' })
    )

    expect(onSendFollowUp).toHaveBeenNthCalledWith(
      1,
      'Create an advisor client for Acme BV from this KBO/NBB public-data bootstrap.'
    )
    expect(onSendFollowUp).toHaveBeenNthCalledWith(
      2,
      'Connect accounting data for Acme BV and continue onboarding.'
    )
    expect(onSendFollowUp).toHaveBeenNthCalledWith(
      3,
      'Start a valuation for Acme BV using the public data, then ask me for any missing inputs.'
    )
  })

  it('routes blocked Belgian public-data bootstrap cards toward gap resolution', () => {
    const onSendFollowUp = vi.fn()
    const message: ChatMessage = {
      id: 'msg-2b',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      belgianCompanyBootstraps: [
        {
          id: 'bootstrap-blocked',
          status: 'blocked',
          message: 'No KBO identity could be resolved.',
          identity: {
            legalName: 'Fallback BV',
            kboNumber: '9876543210',
          },
        },
      ],
    }

    render(<ChatAssistantAdvisoryPreviewCards message={message} onSendFollowUp={onSendFollowUp} />)

    fireEvent.click(
      screen.getByRole('button', { name: 'proposalCards.belgianBootstrap.resolveGapsAction' })
    )

    expect(screen.getByText('No KBO identity could be resolved.')).toBeInTheDocument()
    expect(onSendFollowUp).toHaveBeenCalledWith(
      'Help me bootstrap Fallback BV from KBO/NBB public data and resolve the data gaps.'
    )
  })

  it('routes client-data readiness toward review, valuation, and accounting import paths', () => {
    const onSendFollowUp = vi.fn()
    const message: ChatMessage = {
      id: 'msg-3',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      clientDataReadinessPreviews: [
        {
          id: 'readiness-1',
          status: 'needs_import_review',
          clientId: 'client-1',
          businessName: 'Acme BV',
          hasSyncedFinancials: true,
          recommendedNextTool: 'open_import_review',
          importQualitySummary: {
            years: ['2025'],
            actionableFlagCount: 1,
            topFlags: [{ year: '2025', code: 'EBITDA_REVIEW', severity: 'warning' }],
          },
        },
        {
          id: 'readiness-2',
          status: 'ready_for_valuation',
          clientId: 'client-2',
          businessName: 'Beta BV',
          hasSyncedFinancials: true,
        },
        {
          id: 'readiness-3',
          status: 'missing_financials',
          clientId: 'client-3',
          businessName: 'Gamma BV',
          hasSyncedFinancials: false,
        },
      ],
    }

    render(
      <ChatAssistantAdvisoryPreviewCards
        message={message}
        onSendFollowUp={onSendFollowUp}
        integrationsEnabled
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'proposalCards.clientDataReadiness.openReviewAction' })
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'proposalCards.clientDataReadiness.startValuationAction' })
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'proposalCards.clientDataReadiness.connectAccountingAction',
      })
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'proposalCards.clientDataReadiness.enterFiguresAction',
      })
    )

    expect(onSendFollowUp).toHaveBeenNthCalledWith(
      1,
      'Open the import review for Acme BV and walk me through the accounting flags.'
    )
    expect(onSendFollowUp).toHaveBeenNthCalledWith(
      2,
      'Start a valuation for Beta BV using the synced accounting data.'
    )
    expect(onSendFollowUp).toHaveBeenNthCalledWith(
      3,
      'Help me connect or import accounting data for Gamma BV.'
    )
    expect(onSendFollowUp).toHaveBeenNthCalledWith(
      4,
      'Enter financials manually for Gamma BV: revenue + EBITDA by fiscal year.'
    )
  })

  it('turns method-readiness previews into run, unlock, and explain follow-ups', () => {
    const onSendFollowUp = vi.fn()
    const message: ChatMessage = {
      id: 'msg-4',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      methodReadinessPreviews: [
        {
          id: 'method-readiness-1',
          status: 'ok',
          reportId: 'report-3',
          businessName: 'Acme BV',
          readyMethods: ['dcf', 'ev_ebitda'],
          blockedMethods: ['scorecard'],
        },
      ],
    }

    render(<ChatAssistantAdvisoryPreviewCards message={message} onSendFollowUp={onSendFollowUp} />)

    fireEvent.click(
      screen.getByRole('button', { name: 'proposalCards.methodReadiness.runReadyAction' })
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'proposalCards.methodReadiness.unlockMethodsAction' })
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'proposalCards.methodReadiness.explainAction' })
    )

    expect(onSendFollowUp).toHaveBeenNthCalledWith(
      1,
      'Run the ready valuation methods for Acme BV: Dcf, Ev Ebitda.'
    )
    expect(onSendFollowUp).toHaveBeenNthCalledWith(
      2,
      'Help me unlock these valuation methods for Acme BV: Scorecard.'
    )
    expect(onSendFollowUp).toHaveBeenNthCalledWith(
      3,
      'Explain the valuation-method readiness for Acme BV and recommend the next best method.'
    )
  })
})
