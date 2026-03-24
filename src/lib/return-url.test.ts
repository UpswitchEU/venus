import { describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/getMercuryUrl', () => ({
  getMercuryUrl: () => 'https://upswitch.app',
}))

import { applyMercuryCelebrationQuery, getSafeMercuryReturnUrl } from './return-url'

describe('applyMercuryCelebrationQuery', () => {
  it('strips from when not celebrating', () => {
    expect(
      applyMercuryCelebrationQuery(
        'https://upswitch.app/nl/accountant/clients/x?from=venus',
        false
      )
    ).toBe('https://upswitch.app/nl/accountant/clients/x')
  })

  it('sets from=venus on accountant client paths when celebrating', () => {
    const u = applyMercuryCelebrationQuery('https://upswitch.app/nl/accountant/clients/abc', true)
    expect(u).toContain('from=venus')
  })

  it('does not add from=venus on dashboard URLs when celebrating', () => {
    const u = applyMercuryCelebrationQuery('https://upswitch.app/nl/accountant/dashboard', true)
    expect(u).not.toContain('from=venus')
  })
})

describe('getSafeMercuryReturnUrl', () => {
  it('strips legacy from=venus from stored absolute URLs when celebrate is false', () => {
    const out = getSafeMercuryReturnUrl(
      'https://upswitch.app/nl/accountant/clients/c1?from=venus&keep=1',
      { celebrateMercuryReturn: false }
    )
    expect(out).not.toContain('from=venus')
    expect(out).toContain('keep=1')
  })

  it('appends from=venus for client URLs when celebrate is true', () => {
    const out = getSafeMercuryReturnUrl('https://upswitch.app/nl/accountant/clients/c1', {
      celebrateMercuryReturn: true,
    })
    expect(out).toContain('from=venus')
  })

  it('does not append from=venus to dashboard fallback when celebrate is true', () => {
    const out = getSafeMercuryReturnUrl(null, {
      celebrateMercuryReturn: true,
      sourceApp: 'mercury',
      locale: 'nl',
    })
    expect(out).toBe('https://upswitch.app/nl/accountant/dashboard')
    expect(out).not.toContain('from=venus')
  })
})
