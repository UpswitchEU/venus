import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AccountingReconnectRecovery } from './AccountingReconnectRecovery'

vi.mock('next-intl', () => ({ useLocale: () => 'en' }))

const getSilverfinAuthorizeUrl = vi.hoisted(() => vi.fn())
vi.mock('@/services/api/accounting', () => ({
  accountingAPI: { getSilverfinAuthorizeUrl },
}))

describe('AccountingReconnectRecovery', () => {
  it('shows a non-interrupting resync state and disables duplicate reconnects', () => {
    render(
      <AccountingReconnectRecovery
        context={{
          provider: 'horus',
          client_id: 'client-1',
          recovery_phase: 'resyncing',
        }}
      />
    )

    expect(screen.getByRole('dialog', { name: 'Refreshing Horus' })).toBeInTheDocument()
    expect(screen.getByText(/resume calculation automatically/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refreshing dossier…' })).toBeDisabled()
  })

  it('restores a failed return as an accessible, retryable state', () => {
    render(
      <AccountingReconnectRecovery
        context={{
          provider: 'winbooks',
          client_id: 'client-1',
          recovery_phase: 'failed',
          failure: 'The provider session expired.',
        }}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent('WinBooks connection failed')
    expect(screen.queryByText('The provider session expired.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeEnabled()
  })

  it('starts a reconnect only once when the primary action is activated twice', () => {
    getSilverfinAuthorizeUrl.mockReturnValue(new Promise(() => undefined))
    render(
      <AccountingReconnectRecovery
        context={{
          provider: 'silverfin',
          client_id: 'client-1',
          firm_id: '400689',
        }}
      />
    )

    const reconnect = screen.getByRole('button', { name: 'Reconnect' })
    fireEvent.click(reconnect)
    fireEvent.click(reconnect)

    expect(getSilverfinAuthorizeUrl).toHaveBeenCalledTimes(1)
  })
})
