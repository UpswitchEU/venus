import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

import { FullscreenReportModal } from './FullscreenReportModal'
import type { ValuationReportData } from './types'

const report = { htmlReport: '<p>REPORT_HTML_MARKER</p>' } as unknown as ValuationReportData

describe('FullscreenReportModal', () => {
  it('renders the graph slot (and not the report) when rightPanelView is graph', () => {
    render(
      <FullscreenReportModal
        open
        onOpenChange={vi.fn()}
        report={report}
        rightPanelView="graph"
        graphSlot={<div data-testid="curve-slot">CURVE</div>}
      />
    )
    expect(screen.getByTestId('curve-slot')).toBeTruthy()
    expect(document.body.textContent).not.toContain('REPORT_HTML_MARKER')
  })

  it('renders the report (and not the graph slot) for any non-graph view', () => {
    render(
      <FullscreenReportModal
        open
        onOpenChange={vi.fn()}
        report={report}
        rightPanelView="preview"
        graphSlot={<div data-testid="curve-slot">CURVE</div>}
      />
    )
    expect(screen.queryByTestId('curve-slot')).toBeNull()
    expect(document.body.textContent).toContain('REPORT_HTML_MARKER')
  })
})
