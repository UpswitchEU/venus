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

  it('blocks model-emitted credential submit paths outside the agent allow-list', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const message: ChatMessage = {
      id: 'msg-1',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      secureCredentialRequests: [
        {
          id: 'proposal-unsafe',
          status: 'pending_approval',
          provider: 'yuki',
          submitPath: '/api/auth/logout',
          fields: [{ key: 'api_key', label: 'API key', masked: true, required: true }],
        },
      ],
    }

    render(<ChatAssistantAgentActionCards message={message} />)
    fireEvent.change(screen.getByLabelText(/API key/), { target: { value: 'secret-token' } })
    fireEvent.click(screen.getByRole('button', { name: 'proposalCards.agent.credentialAction' }))

    await screen.findByText('proposalCards.agent.endpointMissing')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not post host-applied single-select choices without a host handler', async () => {
    const fetchMock = vi.fn()
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

    await screen.findByText('proposalCards.agent.endpointMissing')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onSendFollowUp).not.toHaveBeenCalled()
  })

  it('lets the host app apply valuation-method choices without hitting a missing BFF route', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const onApplyAgentChoice = vi.fn().mockResolvedValue(true)
    const message: ChatMessage = {
      id: 'msg-1',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      multiSelectRequests: [
        {
          id: 'proposal-methods',
          status: 'pending_approval',
          title: 'Pick valuation methods',
          submitPath: '/api/valuations/methods',
          options: [
            { value: 'dcf', label: 'DCF' },
            { value: 'ebitda_multiple', label: 'EBITDA multiple' },
          ],
          minSelections: 1,
          maxSelections: 2,
        },
      ],
    }

    render(
      <ChatAssistantAgentActionCards message={message} onApplyAgentChoice={onApplyAgentChoice} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'DCF' }))
    fireEvent.click(screen.getByRole('button', { name: 'proposalCards.agent.submitChoices' }))

    await waitFor(() => {
      expect(onApplyAgentChoice).toHaveBeenCalledWith({
        id: 'proposal-methods',
        kind: 'multi_select',
        title: 'Pick valuation methods',
        submitPath: '/api/valuations/methods',
        values: ['dcf'],
        selectedOptions: [{ value: 'dcf', label: 'DCF' }],
      })
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not fall through to fetch when a host choice handler declines a host-only path', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const onApplyAgentChoice = vi.fn().mockResolvedValue(false)
    const message: ChatMessage = {
      id: 'msg-1',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      singleSelectRequests: [
        {
          id: 'proposal-weights',
          status: 'pending_approval',
          title: 'Pick weights',
          submitPath: '/api/valuations/method-weights',
          options: [
            { value: 'equal', label: 'Equal' },
            { value: 'custom', label: 'Custom' },
          ],
        },
      ],
    }

    render(
      <ChatAssistantAgentActionCards message={message} onApplyAgentChoice={onApplyAgentChoice} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Equal' }))
    fireEvent.click(screen.getByRole('button', { name: 'proposalCards.agent.submitChoice' }))

    await screen.findByText('proposalCards.agent.endpointMissing')
    expect(onApplyAgentChoice).toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('starts provider-scope integration syncs through the Venus BFF', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { job_id: 'job-1' } }), {
        status: 202,
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
      integrationSyncRequests: [
        {
          id: 'proposal-sync-1',
          status: 'pending_approval',
          provider: 'exact',
          scope: 'provider_scope',
          reason: 'The advisor asked to refresh every Exact client.',
        },
      ],
    }

    render(<ChatAssistantAgentActionCards message={message} onSendFollowUp={onSendFollowUp} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'proposalCards.agent.integrationSyncProviderAction' })
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/integrations/accounting/sync-provider/exact',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({ chain_to_bulk: false }),
        })
      )
    })
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        'X-Upswitch-Agent-Tool-Name': 'propose_integration_sync',
        'X-Upswitch-Agent-Proposal-Id': 'proposal-sync-1',
      })
    )
    expect(onSendFollowUp).not.toHaveBeenCalled()
  })

  it('opens integration proposals on Mercury provider deep links instead of bypassing OAuth state', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const openMock = vi.spyOn(window, 'open').mockImplementation(() => null)
    const onSendFollowUp = vi.fn()
    const message: ChatMessage = {
      id: 'msg-1',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      integrationConnectRequests: [
        {
          id: 'proposal-connect-1',
          status: 'pending_approval',
          provider: 'xero',
          authMode: 'oauth',
          reason: 'The advisor asked to connect Xero.',
        },
      ],
    }

    render(<ChatAssistantAgentActionCards message={message} onSendFollowUp={onSendFollowUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'proposalCards.agent.integrationAction' }))

    await waitFor(() => {
      expect(openMock).toHaveBeenCalledWith(
        'http://localhost:3000/en/advisor/settings?tab=integrations&source=venus_chat&accounting_provider=xero',
        '_blank',
        'noopener,noreferrer'
      )
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onSendFollowUp).not.toHaveBeenCalled()
  })
})
