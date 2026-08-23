import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ManualReportWorkspace } from './ManualReportWorkspace'

vi.mock('framer-motion', () => ({
  motion: { div: 'div' },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../../../components/calculator', () => ({
  HistoryPanel: () => <div data-testid="history-panel" />,
}))

vi.mock('../../../store/useSessionStore', () => ({
  useSessionStore: (selector: (state: { renderError: null }) => unknown) =>
    selector({ renderError: null }),
}))

vi.mock('@/hooks/useSectorMismatchWarning', () => ({
  useSectorMismatchWarning: () => ({
    naceTypeTitle: 'Data Analytics',
    selectedTitle: 'other',
  }),
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === 'forms.warnings.sectorMismatch') {
      return `KBO/NACE activity suggests «${values?.naceType}», but you selected «${values?.selected}».`
    }
    return key
  },
}))

const report = {
  id: 'report-1',
  companyName: 'Acme BV',
  valuation: 1_000_000,
  ebitda: 200_000,
  multiple: 5,
  generatedAt: new Date('2026-01-01T00:00:00.000Z'),
  htmlReport: '<section><h1>Report ready</h1><p>Reviewed valuation output.</p></section>',
}

describe('ManualReportWorkspace', () => {
  it('does not render the KBO/NACE sector mismatch warning in the report panel header', () => {
    render(
      <ManualReportWorkspace
        isCalculating={false}
        isGenerating={false}
        isMethodSwitchRendering={false}
        liveMultipleReportPreview={null}
        onVersionRestore={vi.fn()}
        report={report}
        reportId="report-1"
        rightPanelView="preview"
        translate={(key) => key}
        translateReport={(key) => key}
      />
    )

    expect(screen.getByRole('heading', { name: 'Report ready' })).toBeInTheDocument()
    expect(screen.queryByText(/KBO\/NACE activity suggests/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/forms\.warnings\.sectorMismatch/i)).not.toBeInTheDocument()
  })
})
