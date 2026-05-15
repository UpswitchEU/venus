// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { hasManualRestorableReport } from './manualRestorableReport'

describe('manualRestorableReport', () => {
  it('detects top-level rendered report HTML', () => {
    expect(hasManualRestorableReport({ htmlReport: '<main>real report</main>' })).toBe(true)
  })

  it('detects legacy sessionData report envelopes', () => {
    expect(
      hasManualRestorableReport({
        sessionData: {
          html_report: '<section>stored report</section>',
        },
      })
    ).toBe(true)
  })

  it('detects valuation results on either session surface', () => {
    expect(hasManualRestorableReport({ valuationResult: { value: 1 } })).toBe(true)
    expect(hasManualRestorableReport({ sessionData: { valuation_result: { value: 1 } } })).toBe(
      true
    )
  })

  it('ignores empty and safety-net-only sessions', () => {
    expect(hasManualRestorableReport(null)).toBe(false)
    expect(hasManualRestorableReport({ sessionData: {} })).toBe(false)
    expect(
      hasManualRestorableReport({
        htmlReport: '<div class="valuation-summary">Valuation — Summary</div>',
      })
    ).toBe(false)
  })
})
