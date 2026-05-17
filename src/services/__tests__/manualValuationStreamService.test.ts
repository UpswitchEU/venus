import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  handleManualValuationStreamEvent,
  type StreamCallbacks,
  type StreamEvent,
} from '../manualValuationStreamService'

const renderableReportHtml = `<html><body><main>${'Templated valuation report content. '.repeat(
  8
)}</main></body></html>`
const safetyNetReportHtml = `<html><body><section class="valuation-summary">${'Fallback summary. '.repeat(
  12
)}</section></body></html>`

function callbacks(): Required<
  Pick<StreamCallbacks, 'onComplete' | 'onError' | 'onSectionUpdate'>
> {
  return {
    onComplete: vi.fn(),
    onError: vi.fn(),
    onSectionUpdate: vi.fn(),
  }
}

describe('handleManualValuationStreamEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('completes report_complete events only with renderable report HTML', () => {
    const cbs = callbacks()
    const event: StreamEvent = {
      type: 'report_complete',
      valuation_id: 'val_123',
      html_report: renderableReportHtml,
      progress: 100,
      status: 'completed',
    }

    handleManualValuationStreamEvent(event, cbs, 'stream_123')

    expect(cbs.onComplete).toHaveBeenCalledWith(
      renderableReportHtml,
      'val_123',
      expect.objectContaining({ html_report: renderableReportHtml })
    )
    expect(cbs.onError).not.toHaveBeenCalled()
  })

  it('rejects safety-net final reports instead of completing with degraded HTML', () => {
    const cbs = callbacks()

    handleManualValuationStreamEvent(
      {
        type: 'report_complete',
        valuation_id: 'val_123',
        html_report: safetyNetReportHtml,
        progress: 100,
        status: 'completed',
      },
      cbs,
      'stream_123'
    )

    expect(cbs.onComplete).not.toHaveBeenCalled()
    expect(cbs.onError).toHaveBeenCalledWith(expect.any(String), 'ReportHtmlUnavailable')
  })

  it('ignores degraded complete_report sections without sending them as section updates', () => {
    const cbs = callbacks()

    handleManualValuationStreamEvent(
      {
        type: 'report_section',
        section: 'complete_report',
        valuation_id: 'val_123',
        html: safetyNetReportHtml,
        phase: 2,
        progress: 90,
      },
      cbs,
      'stream_123'
    )

    expect(cbs.onComplete).not.toHaveBeenCalled()
    expect(cbs.onSectionUpdate).not.toHaveBeenCalled()
    expect(cbs.onError).not.toHaveBeenCalled()
  })

  it('treats renderable complete_report sections as sanitized completion events', () => {
    const cbs = callbacks()

    handleManualValuationStreamEvent(
      {
        type: 'report_section',
        section: 'complete_report',
        valuation_id: 'val_123',
        html: renderableReportHtml,
        phase: 2,
        progress: 90,
      },
      cbs,
      'stream_123'
    )

    expect(cbs.onComplete).toHaveBeenCalledWith(
      renderableReportHtml,
      'val_123',
      expect.objectContaining({
        html: renderableReportHtml,
        html_report: renderableReportHtml,
      })
    )
    expect(cbs.onSectionUpdate).not.toHaveBeenCalled()
  })
})
