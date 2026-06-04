import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ToolbarOverflowMenu } from './CalculatorNavToolbarOverflowMenu'

const t = ((key: string) => {
  const translations: Record<string, string> = {
    'normalization.title': 'Normalisatie',
    'report.downloadPDF': 'Download PDF',
    'report.fullscreen': 'Volledig scherm',
    'report.generatingPDF': 'PDF genereren',
    'report.history': 'Versiegeschiedenis',
    'report.recentDownloads': 'Recente downloads',
  }

  return translations[key] ?? key
}) as never

describe('CalculatorNavToolbarOverflowMenu', () => {
  it('does not show a normalization badge when the normalization action is hidden', () => {
    render(
      <ToolbarOverflowMenu
        navLocale="nl"
        t={t}
        hasReport
        rightPanelView="report"
        showSourceDataToggle={false}
        sourceDataOpen={false}
        onDownload={vi.fn()}
        normalizationCount={3}
        isExporting={false}
        pdfPlanLocked={false}
        pdfDownloadTooltip={null}
        downloadHistory={[]}
      />
    )

    expect(screen.getByRole('button', { name: 'Meer acties' })).toBeInTheDocument()
    expect(screen.queryByText('3')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Meer acties' }))

    expect(screen.queryByText('Normalisatie')).not.toBeInTheDocument()
  })

  it('shows the normalization badge only when the normalization action is available', () => {
    render(
      <ToolbarOverflowMenu
        navLocale="nl"
        t={t}
        hasReport
        rightPanelView="report"
        showSourceDataToggle={false}
        sourceDataOpen={false}
        onDownload={vi.fn()}
        onOpenNormalization={vi.fn()}
        normalizationCount={3}
        isExporting={false}
        pdfPlanLocked={false}
        pdfDownloadTooltip={null}
        downloadHistory={[]}
      />
    )

    expect(screen.getByRole('button', { name: 'Meer acties' })).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Meer acties' }))

    expect(screen.getByText('Normalisatie')).toBeInTheDocument()
    expect(screen.getAllByText('3')).toHaveLength(2)
  })
})
