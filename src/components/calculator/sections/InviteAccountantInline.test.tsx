import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InviteAccountantInline } from './InviteAccountantInline'

// next-intl is not provided in this test env, so useTranslations() returns the bare
// key — buttons/labels are addressed by their key (matches ChatAssistantAgentActionCards.test).

describe('InviteAccountantInline (BET-317)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('sends the in-form invite through the Venus BFF with the agent-tool header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, email_sent: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<InviteAccountantInline />)
    // idle → expand the form
    fireEvent.click(screen.getByRole('button', { name: 'cta' }))
    fireEvent.change(screen.getByLabelText('emailLabel'), {
      target: { value: 'Advisor@Example.COM' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'send' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/client/orphaned-seller/invite-accountant',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({ accountant_email: 'advisor@example.com', surface: 'card' }),
        })
      )
    })
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        'X-Upswitch-Agent-Tool-Name': 'propose_owner_invite_accountant',
      })
    )
    // success state replaces the form
    await screen.findByText('sentTitle')
  })

  it('includes a trimmed custom message when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<InviteAccountantInline />)
    fireEvent.click(screen.getByRole('button', { name: 'cta' }))
    fireEvent.change(screen.getByLabelText('emailLabel'), { target: { value: 'a@b.be' } })
    fireEvent.change(screen.getByLabelText('messageLabel'), {
      target: { value: '  please help  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'send' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/client/orphaned-seller/invite-accountant',
        expect.objectContaining({
          body: JSON.stringify({
            accountant_email: 'a@b.be',
            surface: 'card',
            custom_message: 'please help',
          }),
        })
      )
    })
  })

  it('validates the email before calling the BFF', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<InviteAccountantInline />)
    fireEvent.click(screen.getByRole('button', { name: 'cta' }))
    // empty email
    fireEvent.click(screen.getByRole('button', { name: 'send' }))
    await screen.findByText('missingEmail')
    expect(fetchMock).not.toHaveBeenCalled()

    // invalid email
    fireEvent.change(screen.getByLabelText('emailLabel'), { target: { value: 'not-an-email' } })
    fireEvent.click(screen.getByRole('button', { name: 'send' }))
    await screen.findByText('invalidEmail')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces a server error and stays on the form for retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, message: 'Already invited' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<InviteAccountantInline />)
    fireEvent.click(screen.getByRole('button', { name: 'cta' }))
    fireEvent.change(screen.getByLabelText('emailLabel'), { target: { value: 'a@b.be' } })
    fireEvent.click(screen.getByRole('button', { name: 'send' }))

    // server message shown; not the success state
    await screen.findByText('Already invited')
    expect(screen.queryByText('sentTitle')).toBeNull()
  })
})
