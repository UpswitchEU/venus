import { describe, expect, it } from 'vitest'
import {
  isTransientUpstreamFailure,
  shouldRetryTransientBffResponse,
  TRANSIENT_UPSTREAM_MESSAGE,
} from './transientUpstreamMessage'

describe('transientUpstreamMessage', () => {
  it('detects transient upstream HTTP statuses', () => {
    expect(isTransientUpstreamFailure(new Response(null, { status: 503 }), {})).toBe(true)
    expect(isTransientUpstreamFailure(new Response(null, { status: 403 }), {})).toBe(false)
  })

  it('detects the shared transient BFF envelope', () => {
    expect(
      isTransientUpstreamFailure(
        new Response(JSON.stringify({ success: false, message: TRANSIENT_UPSTREAM_MESSAGE }), {
          status: 504,
        }),
        { success: false, message: TRANSIENT_UPSTREAM_MESSAGE }
      )
    ).toBe(true)
  })

  it('feeds fetch retry logic', () => {
    expect(
      shouldRetryTransientBffResponse(
        new Response(null, { status: 503 }),
        { success: false, message: TRANSIENT_UPSTREAM_MESSAGE }
      )
    ).toBe(true)
    expect(
      shouldRetryTransientBffResponse(new Response(null, { status: 403 }), {
        success: false,
        message: 'Forbidden',
      })
    ).toBe(false)
  })
})
