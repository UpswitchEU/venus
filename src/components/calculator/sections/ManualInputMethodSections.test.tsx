import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ManualInputMethodSections } from './ManualInputMethodSections'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}))

vi.mock('./AdvisorControlsTrigger', () => ({
  AdvisorControlsTrigger: () => <div data-testid="advisor-controls-trigger-stub" />,
}))

vi.mock('./AdaptiveSections', () => ({
  AdaptiveSections: () => <div data-testid="adaptive-sections-stub" />,
}))

vi.mock('./index', () => ({
  HistoricalYearWeightingSection: () => <div data-testid="historical-year-weighting-stub" />,
  RealEstateCarveOutSection: () => <div data-testid="real-estate-stub" />,
  SynthesisWeightingSection: () => <div data-testid="synthesis-stub" />,
}))

const baseProps = {
  adaptiveHeaderSteps: {} as never,
  balanceSheetCarveOutStep: 4,
  canApplyDcfProjectionAutofill: false,
  disabled: false,
  effectiveMethod: 'ebitda_multiple',
  effectiveMethods: ['ebitda_multiple'],
  formData: {
    business_context: { ev_ebitda_median: 5.5 },
    current_year_data: { year: 2025, revenue: 1_000_000, ebitda: 100_000 },
    historical_years_data: [],
  } as never,
  hasDcfForecastWorkspace: false,
  historicalCardRows: [{ year: 2025 }],
  normalizedData: { totalYearsWithData: 0, averageNormalizedEbitda: 0 } as never,
  onApplyDcfProjectionAutofill: vi.fn(),
  onTerminalValueMethodChange: vi.fn(),
  previewCurrencyFormatter: new Intl.NumberFormat('en-BE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }),
  saasSignals: {} as never,
  setFormData: vi.fn(),
  showRealEstateCarveOut: false,
  synthesisJustification: '',
  synthesisMethods: [],
  synthesisStep: 8,
  synthesisUnlocked: false,
  synthesisWeights: {},
  terminalValueMethod: 'gordon_growth' as never,
}

describe('ManualInputMethodSections expert mode', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('hides advisor controls by default and reveals them without mutating form data', () => {
    render(<ManualInputMethodSections {...baseProps} advisorExpertModeDefault={false} />)

    expect(screen.queryByTestId('advisor-controls-trigger-stub')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'advisorExpertMode.expert' }))

    expect(screen.getByTestId('advisor-controls-trigger-stub')).toBeInTheDocument()
    expect(baseProps.setFormData).not.toHaveBeenCalled()
  })

  it('shows advisor controls by default for advisor-tier surfaces', () => {
    render(<ManualInputMethodSections {...baseProps} advisorExpertModeDefault />)

    expect(screen.getByTestId('advisor-controls-trigger-stub')).toBeInTheDocument()
  })

  it('explains the multiples-only fallback before a two-year Adaptive calculation', () => {
    render(
      <ManualInputMethodSections
        {...baseProps}
        effectiveMethod="upswitch_adaptive"
        effectiveMethods={['upswitch_adaptive']}
        formData={
          {
            yearlyFinancials: [
              { year: '2025', revenue: 1_000_000, ebitda: 100_000 },
              { year: '2024', revenue: 900_000, ebitda: 100_000 },
              { year: '2023', revenue: 0, ebitda: 0 },
            ],
          } as never
        }
        historicalCardRows={[{ year: 2025 }, { year: 2024 }, { year: 2023 }]}
      />
    )

    expect(screen.getByRole('status')).toHaveTextContent('adaptiveDcfFallbackNotice')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not show a premature Adaptive notice before an actual year is admitted', () => {
    render(
      <ManualInputMethodSections
        {...baseProps}
        effectiveMethod="upswitch_adaptive"
        effectiveMethods={['upswitch_adaptive']}
        formData={
          {
            yearlyFinancials: [{ year: '2025', revenue: 0, ebitda: 0 }],
          } as never
        }
      />
    )

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows an inline blocker for explicit DCF with only two admitted years', () => {
    const onReviewDcfInputs = vi.fn()
    render(
      <ManualInputMethodSections
        {...baseProps}
        effectiveMethod="dcf"
        effectiveMethods={['dcf']}
        formData={
          {
            yearlyFinancials: [
              { year: '2025', revenue: 1_000_000, ebitda: 100_000 },
              { year: '2024', revenue: 900_000, ebitda: 100_000 },
              { year: '2023', revenue: 0, ebitda: 0 },
            ],
          } as never
        }
        onReviewDcfInputs={onReviewDcfInputs}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent('dcfReadinessWarningTitle')
    expect(screen.getByRole('alert')).toHaveTextContent('dcfReadinessWarningDescription')
    fireEvent.click(screen.getByRole('button', { name: 'reviewDcfInputs' }))
    expect(onReviewDcfInputs).toHaveBeenCalledOnce()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('removes the explicit DCF blocker when a future FCFF projection is present', () => {
    render(
      <ManualInputMethodSections
        {...baseProps}
        effectiveMethod="dcf"
        effectiveMethods={['dcf']}
        formData={
          {
            dcf_input_mode: 'fcff_only',
            yearlyFinancials: [
              { year: '2025', revenue: 1_000_000, ebitda: 100_000 },
              { year: '2026', free_cash_flow: 75_000, isForecast: true },
            ],
          } as never
        }
      />
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('treats advisor-entered DCF assumptions as explicit intent before submit', () => {
    render(
      <ManualInputMethodSections
        {...baseProps}
        effectiveMethod="upswitch_adaptive"
        effectiveMethods={['upswitch_adaptive']}
        formData={
          {
            dcf_exit_multiple: 4.5,
            yearlyFinancials: [
              { year: '2025', revenue: 1_000_000, ebitda: 100_000 },
              { year: '2024', revenue: 900_000, ebitda: 100_000 },
            ],
          } as never
        }
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent('dcfReadinessWarningTitle')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
