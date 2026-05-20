import { afterEach, describe, expect, it, vi } from 'vitest'

import { getEnv } from './env'

describe('getEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reads NEXT_PUBLIC variables in browser-like contexts', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://public.example')

    expect(getEnv('API_URL')).toBe('https://public.example')
  })

  it('does not expose unprefixed variables in browser-like contexts', () => {
    vi.stubEnv('API_URL', 'https://server-only.example')

    expect(getEnv('API_URL', 'fallback')).toBe('fallback')
  })
})
