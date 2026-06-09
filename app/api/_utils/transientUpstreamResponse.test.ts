import { describe, expect, it } from 'vitest'
import { TRANSIENT_UPSTREAM_MESSAGE } from '@/utils/transientUpstreamMessage'
import {
  isTransientUpstreamStatus,
  transientUpstreamFailureBody,
} from './transientUpstreamResponse'

describe('transientUpstreamResponse', () => {
  it('covers the shared transient upstream status set', () => {
    expect(isTransientUpstreamStatus(429)).toBe(true)
    expect(isTransientUpstreamStatus(502)).toBe(true)
    expect(isTransientUpstreamStatus(503)).toBe(true)
    expect(isTransientUpstreamStatus(504)).toBe(true)
    expect(isTransientUpstreamStatus(403)).toBe(false)
  })

  it('returns a stable BFF failure envelope', () => {
    expect(transientUpstreamFailureBody()).toEqual({
      success: false,
      message: TRANSIENT_UPSTREAM_MESSAGE,
    })
  })
})
