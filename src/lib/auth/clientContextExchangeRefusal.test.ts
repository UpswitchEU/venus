import { describe, expect, it } from 'vitest'
import {
  ClientContextExchangeRefusal,
  IDENTITY_MISMATCH_MESSAGE,
  NOT_SIGNED_IN_MESSAGE,
  toClientContextExchangeRefusal,
} from './clientContextExchangeRefusal'

describe('toClientContextExchangeRefusal (titan #231 exchange contract)', () => {
  it('names the account mismatch instead of a generic failure', () => {
    const refusal = toClientContextExchangeRefusal(403, {
      statusCode: 403,
      code: 'CLIENT_CONTEXT_IDENTITY_MISMATCH',
      message: 'This link was opened for a different account than the one signed in.',
    })
    expect(refusal).toBeInstanceOf(ClientContextExchangeRefusal)
    expect(refusal?.message).toBe(IDENTITY_MISMATCH_MESSAGE)
  })

  it('recognises the mismatch even if an exception filter drops the code', () => {
    const refusal = toClientContextExchangeRefusal(403, {
      message: 'This link was opened for a different account than the one signed in.',
    })
    expect(refusal?.message).toBe(IDENTITY_MISMATCH_MESSAGE)
  })

  it('tells a signed-out advisor to log in (the link never signs anyone in)', () => {
    expect(
      toClientContextExchangeRefusal(401, { message: 'Authentication required' })?.message
    ).toBe(NOT_SIGNED_IN_MESSAGE)
  })

  it('keeps the expired-link copy path for a refused pre-#231 token', () => {
    const refusal = toClientContextExchangeRefusal(401, {
      message: 'Client context link expired — reopen it from Upswitch',
    })
    expect(refusal?.message).toContain('expired')
  })

  it('both actionable messages mention "valuation link" so AuthGate shows the error card', () => {
    expect(IDENTITY_MISMATCH_MESSAGE.toLowerCase()).toContain('valuation link')
    expect(NOT_SIGNED_IN_MESSAGE.toLowerCase()).toContain('valuation link')
  })

  it('leaves 5xx and other statuses retryable', () => {
    expect(toClientContextExchangeRefusal(503, {})).toBeNull()
    expect(toClientContextExchangeRefusal(429, {})).toBeNull()
  })
})
