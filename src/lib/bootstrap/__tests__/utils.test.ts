import { describe, expect, it } from 'vitest'
import { parseBootstrapHints, parseUrlToContext } from '../utils'

const REPORT_UUID = 'c61f49cf-3320-41d8-84c5-e4f874edaad2'

describe('bootstrap utils', () => {
  it('extracts UUID report IDs from localized report URLs', () => {
    const context = parseUrlToContext(
      `https://venus.upswitch.app/nl/reports/${REPORT_UUID}?source=mercury&mode=accountant`
    )

    expect(context.reportId).toBe(REPORT_UUID)
    expect(context.locale).toBe('nl')
    expect(context.sourceApp).toBe('mercury')
    // Mercury's mode=accountant is not a Venus report-mode enum and should be omitted.
    expect(context.mode).toBeUndefined()
  })

  it('treats UUID report IDs as existing reports in bootstrap hints', () => {
    const hints = parseBootstrapHints({
      url: `https://venus.upswitch.app/nl/reports/${REPORT_UUID}`,
      reportId: REPORT_UUID,
      locale: 'nl',
    })

    expect(hints.hasReportId).toBe(true)
    expect(hints.isNewReport).toBe(false)
  })

  it('keeps /reports/new as a new report', () => {
    const context = parseUrlToContext('https://venus.upswitch.app/nl/reports/new')
    const hints = parseBootstrapHints(context)

    expect(context.reportId).toBeUndefined()
    expect(hints.hasReportId).toBe(false)
    expect(hints.isNewReport).toBe(true)
  })
})
