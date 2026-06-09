import { describe, expect, it } from 'vitest'
import {
  isPdfTransientUpstreamStatus,
  PDF_TRANSIENT_UPSTREAM_STATUSES,
} from './pdfTransientUpstream'

describe('pdfTransientUpstream', () => {
  it('treats 429/502/503/504 as transient', () => {
    for (const status of [429, 502, 503, 504]) {
      expect(PDF_TRANSIENT_UPSTREAM_STATUSES.has(status)).toBe(true)
      expect(isPdfTransientUpstreamStatus(status)).toBe(true)
    }
  })

  it('does not treat other statuses as transient', () => {
    expect(isPdfTransientUpstreamStatus(500)).toBe(false)
    expect(isPdfTransientUpstreamStatus(401)).toBe(false)
    expect(isPdfTransientUpstreamStatus(404)).toBe(false)
  })
})
