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
})
