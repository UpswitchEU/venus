import { describe, expect, it } from 'vitest'
import { getRenderableReportHtmlFromCurrentOrFallback } from '../safetyNetReportHtml'

describe('getRenderableReportHtmlFromCurrentOrFallback', () => {
  it('returns fallback html when current html is missing and no fingerprint is provided', () => {
    const html = getRenderableReportHtmlFromCurrentOrFallback(
      [null, undefined],
      ['<html><body>Fresh enough fallback</body></html>']
    )
    expect(html).toContain('fallback')
  })

  it('blocks fallback html when render fingerprint does not match current snapshot', () => {
    const html = getRenderableReportHtmlFromCurrentOrFallback(
      [null],
      ['<html><body>Stale fallback</body></html>'],
      {
        currentRenderFingerprint: 'fp-current',
        fallbackRenderFingerprint: 'fp-older',
      }
    )
    expect(html).toBeUndefined()
  })

  it('allows fallback html when render fingerprint matches current snapshot', () => {
    const html = getRenderableReportHtmlFromCurrentOrFallback(
      [null],
      ['<html><body>Matching fallback</body></html>'],
      {
        currentRenderFingerprint: 'fp-same',
        fallbackRenderFingerprint: 'fp-same',
      }
    )
    expect(html).toContain('Matching fallback')
  })
})
