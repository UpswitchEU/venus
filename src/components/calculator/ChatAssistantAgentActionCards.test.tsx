import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatAssistantAgentActionCards } from './ChatAssistantAgentActionCards'
import type { ChatMessage } from './ChatAssistantTypes'

describe('ChatAssistantAgentActionCards', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('saves owner-profile answers through the Venus BFF instead of sending chat text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { id: 'assessment-1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    const onSendFollowUp = vi.fn()
    const message: ChatMessage = {
      id: 'msg-1',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      ownerProfileAnswerRequests: [
        {
          id: 'proposal-1',
          field: 'ownerHoursPerWeek',
          value: 45,
          label: 'Owner hours',
          reason: 'User said 45 hours.',
        },
      ],
    }

    render(<ChatAssistantAgentActionCards message={message} onSendFollowUp={onSendFollowUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'proposalCards.agent.ownerProfileAction' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/profile/owner-assessment',
        expect.objectContaining({
          method: 'PUT',
          credentials: 'include',
          body: JSON.stringify({ ownerHoursPerWeek: 45 }),
        })
      )
    })
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        'X-Upswitch-Agent-Tool-Name': 'update_owner_profile_answer',
        'X-Upswitch-Agent-Proposal-Id': 'proposal-1',
      })
    )
    expect(onSendFollowUp).not.toHaveBeenCalled()
  })

  it('posts secure credentials directly and never echoes the secret through chat', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    const onSendFollowUp = vi.fn()
    const message: ChatMessage = {
      id: 'msg-1',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      secureCredentialRequests: [
        {
          id: 'proposal-2',
          status: 'pending_approval',
          provider: 'yuki',
          submitPath: '/api/integrations/accounting/yuki/connect',
          fields: [{ key: 'apiKey', label: 'API key', masked: true, required: true }],
        },
      ],
    }

    render(<ChatAssistantAgentActionCards message={message} onSendFollowUp={onSendFollowUp} />)
    fireEvent.change(screen.getByLabelText(/API key/), { target: { value: 'secret-token' } })
    fireEvent.click(screen.getByRole('button', { name: 'proposalCards.agent.credentialAction' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/integrations/accounting/yuki/connect',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({ apiKey: 'secret-token' }),
        })
      )
    })
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        'X-Upswitch-Agent-Tool-Name': 'propose_secure_credential',
        'X-Upswitch-Agent-Proposal-Id': 'proposal-2',
      })
    )
    expect(onSendFollowUp).not.toHaveBeenCalled()
  })

  it('posts single-select choices to the emitted submit path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    const onSendFollowUp = vi.fn()
    const message: ChatMessage = {
      id: 'msg-1',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      singleSelectRequests: [
        {
          id: 'proposal-3',
          status: 'pending_approval',
          title: 'Pick scenario',
          submitPath: '/api/valuations/scenario',
          options: [
            { value: 'base', label: 'Base' },
            { value: 'upside', label: 'Upside' },
          ],
        },
      ],
    }

    render(<ChatAssistantAgentActionCards message={message} onSendFollowUp={onSendFollowUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'Upside' }))
    fireEvent.click(screen.getByRole('button', { name: 'proposalCards.agent.submitChoice' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/valuations/scenario',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({ value: 'upside' }),
        })
      )
    })
    expect(onSendFollowUp).not.toHaveBeenCalled()
  })
})
