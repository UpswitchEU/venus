import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildMercuryIntegrationsUrl } from '../getMercuryUrl'

describe('buildMercuryIntegrationsUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('includes tab=integrations and accounting_provider when set', () => {
    vi.stubEnv('NEXT_PUBLIC_MERCURY_URL', 'https://app.example.com')
    const url = buildMercuryIntegrationsUrl('nl', { accountingProvider: 'exact' })
    expect(url).toBe(
      'https://app.example.com/nl/accountant/settings?tab=integrations&accounting_provider=exact'
    )
  })

  it('omits accounting_provider when not passed', () => {
    vi.stubEnv('NEXT_PUBLIC_MERCURY_URL', 'https://app.example.com')
    const url = buildMercuryIntegrationsUrl('en')
    expect(url).toBe('https://app.example.com/en/accountant/settings?tab=integrations')
  })

  it('strips trailing slash on base URL before joining path', () => {
    vi.stubEnv('NEXT_PUBLIC_MERCURY_URL', 'https://app.example.com/')
    const url = buildMercuryIntegrationsUrl('nl', { accountingProvider: 'yuki' })
    expect(url.startsWith('https://app.example.com/nl/accountant/settings?')).toBe(true)
    expect(url).toContain('accounting_provider=yuki')
  })

  it('includes accounting_provider=silverfin when set', () => {
    vi.stubEnv('NEXT_PUBLIC_MERCURY_URL', 'https://app.example.com')
    const url = buildMercuryIntegrationsUrl('en', { accountingProvider: 'silverfin' })
    expect(url).toBe(
      'https://app.example.com/en/accountant/settings?tab=integrations&accounting_provider=silverfin'
    )
  })

  it('includes accounting_provider=bizzcontrol when set', () => {
    vi.stubEnv('NEXT_PUBLIC_MERCURY_URL', 'https://app.example.com')
    const url = buildMercuryIntegrationsUrl('nl', { accountingProvider: 'bizzcontrol' })
    expect(url).toBe(
      'https://app.example.com/nl/accountant/settings?tab=integrations&accounting_provider=bizzcontrol'
    )
  })

  it('includes accounting_provider=octopus when set', () => {
    vi.stubEnv('NEXT_PUBLIC_MERCURY_URL', 'https://app.example.com')
    const url = buildMercuryIntegrationsUrl('en', { accountingProvider: 'octopus' })
    expect(url).toBe(
      'https://app.example.com/en/accountant/settings?tab=integrations&accounting_provider=octopus'
    )
  })
})
