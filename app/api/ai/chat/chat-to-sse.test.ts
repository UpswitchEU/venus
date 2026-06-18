import { describe, expect, it } from 'vitest'
import { encodeStreamFallbackErrorSseBytes, encodeStreamRecoveryMetaSseBytes } from './chat-to-sse'

describe('encodeStreamRecoveryMetaSseBytes', () => {
  it('emits a BFF-only stream_recovery chunk the FE uses to skip duplicate fallback', () => {
    const [chunk] = encodeStreamRecoveryMetaSseBytes('bff-fallback')
    const text = new TextDecoder().decode(chunk)
    expect(text).toContain('"type":"stream_recovery"')
    expect(text).toContain('"source":"bff-fallback"')
  })
})

describe('encodeStreamFallbackErrorSseBytes', () => {
  it('emits a terminal error chunk the FE dispatcher routes to onError', () => {
    const [chunk] = encodeStreamFallbackErrorSseBytes()
    const text = new TextDecoder().decode(chunk)
    expect(text).toContain('"type":"error"')
    expect(text).toContain('AI stream fallback failed')
  })
})
