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
})
