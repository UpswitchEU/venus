import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatAssistantBuyerReadyCards } from './ChatAssistantBuyerReadyCards'
import type { ChatMessage } from './ChatAssistantTypes'

describe('ChatAssistantBuyerReadyCards', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('submits buyer-ready package generation directly instead of sending a follow-up prompt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { entityId: 'entity-1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const onSendFollowUp = vi.fn()

    const message: ChatMessage = {
      id: 'msg-1',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      buyerReadyCards: [
        {
          id: 'card-1',
          kind: 'buyer_package_generation',
          status: 'pending_approval',
          reportId: 'report-1',
          reason: 'Generate the IM',
          regionLabel: 'Flanders',
          countryCode: 'BE',
          submitPath: '/api/valuations/reports/report-1/buyer-ready-package',
          resultSummary: {
            businessName: 'Acme BV',
            businessType: 'Software',
            valuationMethod: 'dcf',
            currency: 'EUR',
            midpoint: 1_200_000,
            min: null,
            max: null,
          },
        },
      ],
    }

    render(<ChatAssistantBuyerReadyCards message={message} onSendFollowUp={onSendFollowUp} />)

    fireEvent.click(screen.getByRole('button', { name: 'proposalCards.buyerReady.generateAction' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/valuations/reports/report-1/buyer-ready-package',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({ regionLabel: 'Flanders', countryCode: 'BE' }),
        })
      )
    })
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        'X-Upswitch-Agent-Tool-Name': 'generate_buyer_ready_package',
      })
    )
    expect(onSendFollowUp).not.toHaveBeenCalled()
    expect(openSpy).toHaveBeenCalledWith(
      '/en/business/buyer-ready/entity-1',
      '_blank',
      'noopener,noreferrer'
    )
  })

  it('blocks buyer-ready package submit paths outside the exact package endpoint shape', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const message: ChatMessage = {
      id: 'msg-unsafe',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      buyerReadyCards: [
        {
          id: 'card-unsafe',
          kind: 'buyer_package_generation',
          status: 'pending_approval',
          reason: 'Generate the IM',
          submitPath: '/api/auth/logout',
          resultSummary: {
            businessName: 'Acme BV',
            businessType: 'Software',
            valuationMethod: 'dcf',
            currency: 'EUR',
            midpoint: 1_200_000,
            min: null,
            max: null,
          },
        },
      ],
    }

    render(<ChatAssistantBuyerReadyCards message={message} />)
    fireEvent.click(screen.getByRole('button', { name: 'proposalCards.buyerReady.generateAction' }))

    await screen.findByText('proposalCards.buyerReady.endpointMissing')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('turns buyer-ready package status into conversational next steps', () => {
    const onSendFollowUp = vi.fn()
    const message: ChatMessage = {
      id: 'msg-2',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      buyerReadyCards: [
        {
          id: 'package-status-1',
          kind: 'buyer_package_status',
          entityId: 'entity-1',
          packageStatus: 'draft',
          releaseStatus: 'not_ready',
          includedArtifactCount: 2,
          requiredArtifactCount: 4,
          missingRequiredArtifactTypes: ['information_memorandum'],
          openInputCount: 2,
          checklist: {
            overallStatus: 'needs_review',
            greenCount: 3,
            yellowCount: 1,
            redCount: 1,
          },
        },
      ],
    }

    render(<ChatAssistantBuyerReadyCards message={message} onSendFollowUp={onSendFollowUp} />)

    fireEvent.click(
      screen.getByRole('button', { name: 'proposalCards.buyerReady.resolveGapsAction' })
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'proposalCards.buyerReady.reviewDiligenceAction' })
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'proposalCards.buyerReady.reviewDataRoomAction' })
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'proposalCards.buyerReady.checkLegalAction' })
    )

    expect(onSendFollowUp).toHaveBeenNthCalledWith(
      1,
      'Help me resolve buyer-ready package gaps for buyer-ready package entity-1 (missing artifacts: Information Memorandum; 2 open inputs; diligence: 1 missing, 1 review).'
    )
    expect(onSendFollowUp).toHaveBeenNthCalledWith(
      2,
      'Review the diligence checklist for buyer-ready package entity-1.'
    )
    expect(onSendFollowUp).toHaveBeenNthCalledWith(
      3,
      'Review the data room manifest for buyer-ready package entity-1.'
    )
    expect(onSendFollowUp).toHaveBeenNthCalledWith(
      4,
      'Check legal readiness for buyer-ready package entity-1.'
    )
  })

  it('routes diligence checklist gaps to evidence upload and override prompts', () => {
    const onSendFollowUp = vi.fn()
    const message: ChatMessage = {
      id: 'msg-3',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      buyerReadyCards: [
        {
          id: 'dd-1',
          kind: 'dd_checklist',
          entityId: 'entity-2',
          overallStatus: 'needs_review',
          greenCount: 4,
          yellowCount: 1,
          redCount: 1,
          items: [
            {
              category: 'financial_documents',
              status: 'red',
              reason: 'Missing annual accounts',
              advisorOverride: false,
            },
            {
              category: 'tax_clearance',
              status: 'yellow',
              reason: 'Needs confirmation',
              advisorOverride: false,
            },
          ],
        },
      ],
    }

    render(<ChatAssistantBuyerReadyCards message={message} onSendFollowUp={onSendFollowUp} />)

    fireEvent.click(
      screen.getByRole('button', { name: 'proposalCards.buyerReady.resolveDdGapsAction' })
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'proposalCards.buyerReady.uploadEvidenceAction' })
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'proposalCards.buyerReady.proposeOverrideAction' })
    )

    expect(onSendFollowUp).toHaveBeenNthCalledWith(
      1,
      'Help me resolve the diligence checklist gaps for buyer-ready package entity-2: Financial Documents, Tax Clearance.'
    )
    expect(onSendFollowUp).toHaveBeenNthCalledWith(
      2,
      'Prepare a data-room upload for Financial Documents in buyer-ready package entity-2.'
    )
    expect(onSendFollowUp).toHaveBeenNthCalledWith(
      3,
      'Propose a diligence status override for Financial Documents in buyer-ready package entity-2.'
    )
  })

  it('routes legal readiness cards to lawyer handoff and gate-resolution prompts', () => {
    const onSendFollowUp = vi.fn()
    const message: ChatMessage = {
      id: 'msg-4',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      buyerReadyCards: [
        {
          id: 'legal-1',
          kind: 'legal_readiness',
          entityId: 'entity-3',
          jurisdiction: 'BE',
          dealStructure: 'share_deal',
          buyerReleaseStatus: 'blocked',
          counselReviewRequired: true,
          clearCount: 1,
          reviewCount: 1,
          blockedCount: 1,
          items: [
            {
              category: 'share_purchase_agreement',
              status: 'blocked',
              title: 'SPA review',
              owner: 'legal',
              requiredBefore: 'publication',
              reason: 'Counsel review required',
            },
          ],
        },
      ],
    }

    render(<ChatAssistantBuyerReadyCards message={message} onSendFollowUp={onSendFollowUp} />)

    fireEvent.click(
      screen.getByRole('button', { name: 'proposalCards.buyerReady.lawyerHandoffAction' })
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'proposalCards.buyerReady.resolveGatesAction' })
    )

    expect(onSendFollowUp).toHaveBeenNthCalledWith(
      1,
      'Request a lawyer handoff for buyer-ready package entity-3 about Share Purchase Agreement.'
    )
    expect(onSendFollowUp).toHaveBeenNthCalledWith(
      2,
      'Help me resolve legal readiness gates for buyer-ready package entity-3: SPA review.'
    )
  })
})
