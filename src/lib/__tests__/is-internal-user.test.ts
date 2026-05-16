import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import internalEmailContract from '../../../../../tests/contracts/internal-email-contract.json'
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
    for (const email of internalEmailContract.defaultInternalEmails) {
      expect(isInternalEmail(email)).toBe(true)
    }
    for (const email of internalEmailContract.subdomainInternalEmails) {
      expect(isInternalEmail(email)).toBe(true)
    }
  })

  it('returns false for external addresses and falsy input', () => {
    for (const email of internalEmailContract.externalOrInvalidEmails) {
      expect(isInternalEmail(email as string | null | undefined)).toBe(false)
    }
    for (const email of internalEmailContract.substringTrapEmails) {
      expect(isInternalEmail(email)).toBe(false)
    }
  })

  it('honors the env-configured allowlist and extra domains', () => {
    process.env.NEXT_PUBLIC_INTERNAL_EMAILS = internalEmailContract.allowlistRaw
    process.env.NEXT_PUBLIC_INTERNAL_EMAIL_DOMAINS = internalEmailContract.extraDomainsRaw

    expect(isInternalEmail(internalEmailContract.allowlistInternalEmail)).toBe(true)
    for (const email of internalEmailContract.extraDomainInternalEmails) {
      expect(isInternalEmail(email)).toBe(true)
    }
    expect(isInternalEmail(internalEmailContract.allowlistExternalEmail)).toBe(false)
  })
})
