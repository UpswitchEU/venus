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

    render(
      <ChatAssistantAgentActionCards
        message={message}
        onSendFollowUp={onSendFollowUp}
        integrationsEnabled
      />
    )
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

  it('keeps secure credential requests inert when integrations are plan-locked', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const message: ChatMessage = {
      id: 'msg-credential-locked',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      secureCredentialRequests: [
        {
          id: 'proposal-credential-locked',
          status: 'pending_approval',
          provider: 'yuki',
          submitPath: '/api/integrations/accounting/yuki/connect',
          fields: [{ key: 'apiKey', label: 'API key', masked: true, required: true }],
        },
      ],
    }

    render(<ChatAssistantAgentActionCards message={message} />)

    expect(screen.getByText('proposalCards.agent.integrationLocked')).toBeInTheDocument()
    expect(screen.getByText('proposalCards.agent.integrationPlanLocked')).toBeInTheDocument()
    expect(screen.queryByLabelText(/API key/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'proposalCards.agent.credentialAction' })
    ).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
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

    render(
      <ChatAssistantAgentActionCards
        message={message}
        onSendFollowUp={onSendFollowUp}
        integrationsEnabled
      />
    )
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

    render(<ChatAssistantAgentActionCards message={message} integrationsEnabled />)
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

    render(
      <ChatAssistantAgentActionCards
        message={message}
        onSendFollowUp={onSendFollowUp}
        integrationsEnabled
      />
    )
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

    render(
      <ChatAssistantAgentActionCards
        message={message}
        onSendFollowUp={onSendFollowUp}
        integrationsEnabled
      />
    )
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

  it('starts client-scope integration syncs through the Venus BFF', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { job_id: 'job-1' } }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    const message: ChatMessage = {
      id: 'msg-1',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      integrationSyncRequests: [
        {
          id: 'proposal-sync-client',
          status: 'pending_approval',
          provider: 'exact',
          scope: 'client_scope',
          clientId: 'client-1',
          reason: 'Refresh this client before running the valuation.',
        },
      ],
    }

    render(<ChatAssistantAgentActionCards message={message} integrationsEnabled />)
    fireEvent.click(
      screen.getByRole('button', { name: 'proposalCards.agent.integrationSyncAction' })
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/integrations/accounting/resync-client/client-1',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({ force: true }),
        })
      )
    })
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        'X-Upswitch-Agent-Tool-Name': 'propose_integration_sync',
        'X-Upswitch-Agent-Proposal-Id': 'proposal-sync-client',
      })
    )
  })

  it('keeps integration sync proposals inert when integrations are plan-locked', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const message: ChatMessage = {
      id: 'msg-sync-locked',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      integrationSyncRequests: [
        {
          id: 'proposal-sync-locked',
          status: 'pending_approval',
          provider: 'exact',
          scope: 'provider_scope',
          reason: 'The advisor asked to refresh every Exact client.',
        },
      ],
    }

    render(<ChatAssistantAgentActionCards message={message} />)

    expect(screen.getByText('proposalCards.agent.integrationSyncBlocked')).toBeInTheDocument()
    expect(screen.getByText('proposalCards.agent.integrationPlanLocked')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: 'proposalCards.agent.integrationSyncProviderAction',
      })
    ).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends owner accountant invites through the Venus BFF', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, email_sent: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    const message: ChatMessage = {
      id: 'msg-1',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      ownerInviteAccountantRequests: [
        {
          id: 'proposal-owner-invite',
          status: 'pending_approval',
          accountantEmail: 'Advisor@Example.COM',
          customMessage: 'Please review the books.',
          reason: 'The owner wants their accountant involved.',
        },
      ],
    }

    render(<ChatAssistantAgentActionCards message={message} />)
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/client/orphaned-seller/invite-accountant',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({
            accountant_email: 'advisor@example.com',
            surface: 'card',
            custom_message: 'Please review the books.',
          }),
        })
      )
    })
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        'X-Upswitch-Agent-Tool-Name': 'propose_owner_invite_accountant',
        'X-Upswitch-Agent-Proposal-Id': 'proposal-owner-invite',
      })
    )
  })

  it('updates valuation-method preference through the Venus BFF', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    const message: ChatMessage = {
      id: 'msg-1',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      valuationMethodPreferenceRequests: [
        {
          id: 'proposal-method-pref',
          status: 'pending_approval',
          clientId: 'client-1',
          method: 'dcf',
          businessName: 'Acme NV',
          reason: 'Use DCF as the headline lens.',
        },
      ],
    }

    render(<ChatAssistantAgentActionCards message={message} />)
    fireEvent.click(
      screen.getByRole('button', {
        name: 'proposalCards.agent.valuationMethodPreferencePinAction',
      })
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/accountants/clients/client-1/valuation-method-preference',
        expect.objectContaining({
          method: 'PUT',
          credentials: 'include',
          body: JSON.stringify({ value: 'dcf' }),
        })
      )
    })
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        'X-Upswitch-Agent-Tool-Name': 'propose_valuation_method_preference',
        'X-Upswitch-Agent-Proposal-Id': 'proposal-method-pref',
      })
    )
  })

  it('bridges Mercury warning acknowledgements to the real import-review surface', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const openMock = vi.spyOn(window, 'open').mockImplementation(() => null)
    const message: ChatMessage = {
      id: 'msg-1',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      acknowledgeWarningRequests: [
        {
          id: 'proposal-ack-warning',
          status: 'pending_approval',
          code: 'cap_breach:2024:owner_salary',
          warningKind: 'cap_breach',
          summary: 'Owner salary normalization exceeds cap',
          reason: 'Founder confirmed below-market comp.',
          clientId: 'client-1',
          reportId: 'report-1',
        },
      ],
    }

    render(<ChatAssistantAgentActionCards message={message} />)
    fireEvent.click(
      screen.getByRole('button', {
        name: 'proposalCards.agent.acknowledgeWarningAction',
      })
    )

    await waitFor(() => {
      expect(openMock).toHaveBeenCalledWith(
        expect.stringContaining(
          'http://localhost:3000/en/advisor/import-review?source=venus-ai&clientId=client-1&reportId=report-1'
        ),
        '_blank',
        'noopener,noreferrer'
      )
    })
    expect(openMock.mock.calls[0]?.[0]).toContain('warning_code=cap_breach%3A2024%3Aowner_salary')
    expect(openMock.mock.calls[0]?.[0]).toContain('warning_kind=cap_breach')
    expect(fetchMock).not.toHaveBeenCalled()
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

    render(
      <ChatAssistantAgentActionCards
        message={message}
        onSendFollowUp={onSendFollowUp}
        integrationsEnabled
      />
    )
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

  it('opens owner integration proposals on the Mercury owner integrations surface', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const openMock = vi.spyOn(window, 'open').mockImplementation(() => null)
    const message: ChatMessage = {
      id: 'msg-owner-connect',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      integrationConnectRequests: [
        {
          id: 'proposal-owner-connect',
          status: 'pending_approval',
          provider: 'exact',
          authMode: 'oauth',
          reason: 'The owner asked to connect Exact.',
        },
      ],
    }

    render(
      <ChatAssistantAgentActionCards
        message={message}
        integrationsEnabled
        integrationAudience="owner"
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'proposalCards.agent.integrationAction' }))

    await waitFor(() => {
      expect(openMock).toHaveBeenCalledWith(
        'http://localhost:3000/en/users/profile?tab=integrations&source=venus_chat&accounting_provider=exact',
        '_blank',
        'noopener,noreferrer'
      )
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps integration connect proposals inert when integrations are plan-locked', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const openMock = vi.spyOn(window, 'open').mockImplementation(() => null)
    const message: ChatMessage = {
      id: 'msg-connect-locked',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      integrationConnectRequests: [
        {
          id: 'proposal-connect-locked',
          status: 'pending_approval',
          provider: 'xero',
          authMode: 'oauth',
          reason: 'The advisor asked to connect Xero.',
        },
      ],
    }

    render(<ChatAssistantAgentActionCards message={message} />)

    expect(screen.getByText('proposalCards.agent.integrationLocked')).toBeInTheDocument()
    expect(screen.getByText('proposalCards.agent.integrationPlanLocked')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'proposalCards.agent.integrationAction' })
    ).not.toBeInTheDocument()
    expect(openMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('opens client-create proposals with registry-safe Mercury query params', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const openMock = vi.spyOn(window, 'open').mockImplementation(() => null)
    const message: ChatMessage = {
      id: 'msg-client-create',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      clientCreateRequests: [
        {
          id: 'proposal-client-create',
          status: 'pending_approval',
          businessName: 'Decostere NV',
          companyNumber: 'BE0123456789',
          customerEmail: 'owner@example.test',
        },
      ],
    }

    render(<ChatAssistantAgentActionCards message={message} />)
    fireEvent.click(screen.getByRole('button', { name: 'proposalCards.agent.clientCreateAction' }))

    await waitFor(() => {
      expect(openMock).toHaveBeenCalledWith(
        'http://localhost:3000/en/advisor/clients/create?kbo=BE0123456789&name=Decostere+NV&country=BE&email=owner%40example.test&source=venus-ai',
        '_blank',
        'noopener,noreferrer'
      )
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('blocks malformed client-create proposals without a company number', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const openMock = vi.spyOn(window, 'open').mockImplementation(() => null)
    const message: ChatMessage = {
      id: 'msg-client-create-invalid',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      clientCreateRequests: [
        {
          id: 'proposal-client-create-invalid',
          status: 'pending_approval',
          businessName: 'Name Only NV',
        },
      ],
    }

    render(<ChatAssistantAgentActionCards message={message} />)

    expect(screen.getByText('proposalCards.agent.clientCreateBlocked')).toBeInTheDocument()
    expect(screen.getByText('proposalCards.agent.missingCompanyNumber')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'proposalCards.agent.clientCreateAction' })).toBe(
      null
    )
    expect(openMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
