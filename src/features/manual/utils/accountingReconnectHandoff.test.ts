import { describe, expect, it, vi } from 'vitest'
import {
  accountingReconnectProviderName,
  buildMercuryAccountingReconnectUrl,
  generateAccountingReconnectHandoffNonce,
} from './accountingReconnectHandoff'

describe('accounting reconnect Mercury handoff', () => {
  it('returns to the same report without leaking callback or bootstrap secrets', () => {
    const result = new URL(
      buildMercuryAccountingReconnectUrl({
        currentUrl:
          'https://valuation.upswitch.app/nl/reports/val_123?flow=manual&clientId=client-1&clientToken=secret&code=old&state=old-state&return_url=https%3A%2F%2Fwww.upswitch.app%2Fnl%2Fadvisor%2Fclients%2Fclient-1',
        locale: 'nl',
        provider: 'horus',
        clientId: 'client-1',
        nonce: 'nonce-1',
        mercuryOrigin: 'https://www.upswitch.app',
      })
    )

    expect(result.pathname).toBe('/nl/advisor/settings')
    expect(result.searchParams.get('accounting_provider')).toBe('horus')
    const returnTarget = new URL(result.searchParams.get('return_to') ?? '')
    expect(returnTarget.pathname).toBe('/nl/reports/val_123')
    expect(returnTarget.searchParams.get('flow')).toBe('manual')
    expect(returnTarget.searchParams.get('clientId')).toBe('client-1')
    expect(returnTarget.searchParams.get('accounting_resume')).toBe('nonce-1')
    expect(returnTarget.searchParams.has('clientToken')).toBe(false)
    expect(returnTarget.searchParams.has('code')).toBe(false)
    expect(returnTarget.searchParams.has('state')).toBe(false)
  })

  it('rejects malformed providers and formats every known connector name', () => {
    expect(() =>
      buildMercuryAccountingReconnectUrl({
        currentUrl: 'https://valuation.upswitch.app/en/reports/val_123',
        locale: 'en',
        provider: '../evil',
        clientId: 'client-1',
        nonce: 'nonce-1',
        mercuryOrigin: 'https://www.upswitch.app',
      })
    ).toThrow()
    expect(accountingReconnectProviderName('exact')).toBe('Exact Online')
    expect(accountingReconnectProviderName('winbooks')).toBe('WinBooks')
  })

  it('uses a cryptographically generated nonce', () => {
    const randomUUID = vi.spyOn(crypto, 'randomUUID').mockReturnValue('uuid-1')
    expect(generateAccountingReconnectHandoffNonce()).toBe('uuid-1')
    randomUUID.mockRestore()
  })
})
