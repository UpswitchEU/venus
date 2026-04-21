import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { isInternalEmail } from '../is-internal-user'

describe('Venus isInternalEmail', () => {
  const originalDomains = process.env.NEXT_PUBLIC_INTERNAL_EMAIL_DOMAINS
  const originalAllowlist = process.env.NEXT_PUBLIC_INTERNAL_EMAILS

  beforeEach(() => {
    process.env.NEXT_PUBLIC_INTERNAL_EMAIL_DOMAINS = undefined
    process.env.NEXT_PUBLIC_INTERNAL_EMAILS = undefined
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_INTERNAL_EMAIL_DOMAINS = originalDomains
    process.env.NEXT_PUBLIC_INTERNAL_EMAILS = originalAllowlist
  })

  it('matches the same default domains as Mercury', () => {
    expect(isInternalEmail('staff@upswitch.com')).toBe(true)
    expect(isInternalEmail('team@upswitch.app')).toBe(true)
    expect(isInternalEmail('eng@upswitch.eu')).toBe(true)
    expect(isInternalEmail('founders@team.upswitch.com')).toBe(true)
  })

  it('returns false for external addresses and falsy input', () => {
    expect(isInternalEmail('jane@example.com')).toBe(false)
    expect(isInternalEmail(null)).toBe(false)
    expect(isInternalEmail(undefined)).toBe(false)
    expect(isInternalEmail('')).toBe(false)
    expect(isInternalEmail('not-an-email')).toBe(false)
  })

  it('honors the env-configured allowlist and extra domains', () => {
    process.env.NEXT_PUBLIC_INTERNAL_EMAILS = 'qa-bot@partner.io'
    process.env.NEXT_PUBLIC_INTERNAL_EMAIL_DOMAINS = 'qa.local'

    expect(isInternalEmail('qa-BOT@partner.io')).toBe(true)
    expect(isInternalEmail('tester@sub.qa.local')).toBe(true)
    expect(isInternalEmail('partner@notInternal.io')).toBe(false)
  })
})
