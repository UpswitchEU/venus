import { describe, expect, it } from 'vitest'
import { getMercuryAppOrigin } from './getMercuryAppOrigin'

describe('getMercuryAppOrigin', () => {
  it('uses the env value when set, stripping trailing slashes', () => {
    expect(
      getMercuryAppOrigin('https://app.upswitch.com/', {
        protocol: 'https:',
        host: 'venus.upswitch.com',
      })
    ).toBe('https://app.upswitch.com')

    expect(getMercuryAppOrigin('https://app.upswitch.com', null)).toBe('https://app.upswitch.com')
  })

  it('strips a Venus subdomain prefix from the current host', () => {
    expect(
      getMercuryAppOrigin(undefined, {
        protocol: 'https:',
        host: 'venus.upswitch.com',
      })
    ).toBe('https://upswitch.com')

    expect(
      getMercuryAppOrigin(undefined, {
        protocol: 'https:',
        host: 'calculator.upswitch.com',
      })
    ).toBe('https://upswitch.com')
  })

  it('falls back to the current origin when the host has no known Venus prefix', () => {
    // Single-deploy preview topology: Venus and Mercury share the host.
    expect(
      getMercuryAppOrigin(undefined, {
        protocol: 'https:',
        host: 'preview-pr-42.vercel.app',
      })
    ).toBe('https://preview-pr-42.vercel.app')
  })

  it('returns null on the server when no env is set and there is no location', () => {
    expect(getMercuryAppOrigin(undefined, null)).toBeNull()
    expect(getMercuryAppOrigin('', null)).toBeNull()
    expect(getMercuryAppOrigin('   ', null)).toBeNull()
  })

  it('returns null when the location object is missing fields', () => {
    expect(getMercuryAppOrigin(undefined, { protocol: '', host: 'venus.upswitch.com' })).toBeNull()
    expect(getMercuryAppOrigin(undefined, { protocol: 'https:', host: '' })).toBeNull()
  })
})
