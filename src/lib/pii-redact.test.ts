/**
 * P0-4 — Venus PostHog scrubber contract.
 *
 * Mirrors apps/mercury/tests/unit/shared/lib/pii-redact.test.ts. See
 * docs/security/data-anonymization-architecture-2026-05-17.md §P0-4.
 */

import { describe, expect, it } from 'vitest'

import { redactStructuredPii, scrubPostHogParams } from './pii-redact'

describe('redactStructuredPii (Venus observability scrubber)', () => {
  it('redacts email, URL, IBAN, VAT, KBO, phone, long digit runs', () => {
    const out = redactStructuredPii(
      'Contact admin@acme.be BTW BE0123456789 kbo 0123.456.789 zie https://x.test en +32 475 12 34 56'
    )
    expect(out).toContain('[email]')
    expect(out).toContain('[vat]')
    expect(out).toContain('[ondernemingsnummer]')
    expect(out).toContain('[url]')
    expect(out).toContain('[telefoon]')
    expect(out).not.toContain('admin@')
    expect(out).not.toContain('https://')
  })

  it('preserves whitespace and newlines', () => {
    const out = redactStructuredPii('line1\n  line2 admin@acme.be')
    expect(out).toContain('\n  ')
    expect(out).toContain('[email]')
  })

  it('returns empty string for null / undefined', () => {
    expect(redactStructuredPii(null)).toBe('')
    expect(redactStructuredPii(undefined)).toBe('')
  })

  it('is idempotent', () => {
    const once = redactStructuredPii('email me at admin@acme.be')
    const twice = redactStructuredPii(once)
    expect(once).toBe(twice)
  })
})

describe('scrubPostHogParams (Venus observability scrubber)', () => {
  it('redacts string param values; passes numbers + booleans through', () => {
    const params = {
      event_kind: 'profile_update',
      user_email: 'jane@acme.be',
      amount_eur: 1500,
      internal: true,
    }
    const out = scrubPostHogParams(params)
    expect(out).toBeDefined()
    if (!out) throw new Error('Expected scrubbed PostHog params')
    expect(out.event_kind).toBe('profile_update')
    expect(out.user_email).toBe('[email]')
    expect(out.amount_eur).toBe(1500)
    expect(out.internal).toBe(true)
  })

  it('returns undefined when params is undefined (no-op queue path)', () => {
    expect(scrubPostHogParams(undefined)).toBeUndefined()
  })

  it('does not mutate the input', () => {
    const input = { foo: 'admin@acme.be', count: 1 }
    const out = scrubPostHogParams(input)
    expect(out).toBeDefined()
    if (!out) throw new Error('Expected scrubbed PostHog params')
    expect(input.foo).toBe('admin@acme.be')
    expect(out.foo).toBe('[email]')
    expect(out).not.toBe(input)
  })
})
