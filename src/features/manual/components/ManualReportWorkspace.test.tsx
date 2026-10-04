import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useManualResultsStore } from '@/store/manual/useManualResultsStore'
import { usePartialAssessmentStore } from '@/store/manual/usePartialAssessmentStore'
import producer from '../../../utils/__fixtures__/partial-report.v1.json'
import { ManualReportWorkspace } from './ManualReportWorkspace'

vi.mock('@/components/results/SavedPartialReport', () => ({
  SavedPartialReport: ({ reportId }: { reportId: string }) => (
    <div data-testid="partial-report">{reportId}</div>
  ),
}))

const sessionState = vi.hoisted(() => ({
  renderError: null as null | 'html_recovery_failed' | 'payload_too_large',
}))

vi.mock('framer-motion', () => ({
  motion: { button: 'button', div: 'div' },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../../../components/calculator', () => ({
  HistoryPanel: () => <div data-testid="history-panel" />,
}))

vi.mock('../../../store/useSessionStore', () => ({
  useSessionStore: (selector: (state: typeof sessionState) => unknown) => selector(sessionState),
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
  beforeEach(() => {
    sessionState.renderError = null
    usePartialAssessmentStore.getState().clear()
    useManualResultsStore.setState({ result: null })
  })

  it('does not render the KBO/NACE sector mismatch warning in the report panel header', () => {
    render(
      <ManualReportWorkspace
        isCalculating={false}
        isGenerating={false}
        isMethodSwitchRendering={false}
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

  it('shows a newly saved assessment but does not override a restored numerical result', () => {
    usePartialAssessmentStore
      .getState()
      .setSaved('report-1', { partial_valuation: producer.partial_valuation })
    const props = {
      isCalculating: false,
      isGenerating: false,
      isMethodSwitchRendering: false,
      onVersionRestore: vi.fn(),
      report,
      reportId: 'report-1',
      rightPanelView: 'preview' as const,
      translate: (key: string) => key,
      translateReport: (key: string) => key,
    }
    const view = render(<ManualReportWorkspace {...props} />)
    expect(screen.getByTestId('partial-report')).toBeInTheDocument()
    useManualResultsStore.setState({
      result: { valuation_id: 'report-1' } as NonNullable<
        ReturnType<typeof useManualResultsStore.getState>['result']
      >,
    })
    view.rerender(<ManualReportWorkspace {...props} />)
    expect(screen.queryByTestId('partial-report')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Report ready' })).toBeInTheDocument()
  })

  it('offers one-click report recovery without asking the user to recalculate', () => {
    const onRetryReportRecovery = vi.fn()
    sessionState.renderError = 'html_recovery_failed'

    render(
      <ManualReportWorkspace
        isCalculating={false}
        isGenerating={false}
        isMethodSwitchRendering={false}
        onRetryReportRecovery={onRetryReportRecovery}
        onVersionRestore={vi.fn()}
        report={null}
        reportId="report-1"
        rightPanelView="report"
        translate={(key) => key}
        translateReport={(key) => key}
      />
    )

    expect(screen.getByText('reportHtmlRecoveryFailedDesc')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'tryAgain' }))
    expect(onRetryReportRecovery).toHaveBeenCalledTimes(1)
  })
})
