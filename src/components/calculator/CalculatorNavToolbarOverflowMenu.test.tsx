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

  it('shows preview on compact mobile overflow when onPreview is provided', () => {
    const onPreview = vi.fn()
    render(
      <ToolbarOverflowMenu
        navLocale="nl"
        t={t}
        hasReport
        rightPanelView="report"
        showSourceDataToggle={false}
        sourceDataOpen={false}
        onDownload={vi.fn()}
        onPreview={onPreview}
        isExporting={false}
        pdfPlanLocked={false}
        pdfDownloadTooltip={null}
        downloadHistory={[]}
        compactTouchTarget
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Meer acties' }))
    fireEvent.click(screen.getByText('report.preview'))
    expect(onPreview).toHaveBeenCalledTimes(1)
  })

  it('shows approve and sign actions when enabled', () => {
    const onApprove = vi.fn()
    const onSignAttest = vi.fn()

    render(
      <ToolbarOverflowMenu
        navLocale="en"
        t={t}
        hasReport
        rightPanelView="report"
        showSourceDataToggle={false}
        sourceDataOpen={false}
        onDownload={vi.fn()}
        isExporting={false}
        pdfPlanLocked={false}
        pdfDownloadTooltip={null}
        downloadHistory={[]}
        showApproveValuation
        onApproveValuation={onApprove}
        approveValuationLabel="Approve valuation"
        showSignAttest
        onSignAttest={onSignAttest}
        signAttestLabel="Sign & attest report"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByText('Approve valuation'))
    fireEvent.click(screen.getByText('Sign & attest report'))

    expect(onApprove).toHaveBeenCalledTimes(1)
    expect(onSignAttest).toHaveBeenCalledTimes(1)
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
