import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBonusSectionsSaasSignalsFromFormData } from '@/constants/methodFieldConfig'
import {
  AdaptiveSections,
  OfficialFilingTrustPanel,
  getSeedYearlyFinancials,
  shouldAutoConfirmPrefilledFilingYear,
} from './ManualInputPanel'
import { FilingYearPrompt } from './FilingYearPrompt'

vi.mock('next-intl', () => ({
  useLocale: () => 'nl',
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values
      ? `${key}:${Object.entries(values)
          .map(([entryKey, value]) => `${entryKey}=${value}`)
          .join(',')}`
      : key,
}))

afterEach(() => {
  vi.useRealTimers()
})

describe('Manual filing year defaults', () => {
  it('seeds the yearly grid from the filing year in March even when current_year_data carries 2025', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-27T12:00:00Z'))

    const seededYears = getSeedYearlyFinancials({
      current_year_data: {
        year: 2025,
        revenue: 1_000_000,
        ebitda: 100_000,
      },
    } as any)

    expect(seededYears.map((row) => row.year)).toEqual(['2024', '2023', '2022'])
  })

  it('does not auto-confirm a prefilled year that is ahead of the filing year in H1', () => {
    expect(
      shouldAutoConfirmPrefilledFilingYear(
        {
          current_year_data: {
            year: 2025,
          },
        } as any,
        2024
      )
    ).toBe(false)
  })

  it('caps the filing-year prompt to the filing year in H1', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-27T12:00:00Z'))

    render(<FilingYearPrompt defaultYear={2024} onSelect={vi.fn()} />)

    expect(screen.getByText('2024')).toBeInTheDocument()
    expect(screen.queryByText('2025')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'filingYearOther' }))
    expect(screen.getByLabelText('Aangepast boekjaar')).toHaveAttribute('max', '2024')
  })
})

describe('AdaptiveSections', () => {
  const baseProps = {
    formData: {} as any,
    onFieldChange: vi.fn(),
    terminalValueMethod: 'perpetual_growth' as const,
    onTerminalValueMethodChange: vi.fn(),
    disabled: false,
    sectionHeaderSteps: {
      dcfGlobal: 5,
      nav: 6,
      saas: 7,
      revenue: 8,
    },
  }

  it('renders SaaS metrics on adaptive when business_model signals SaaS (no saas in type id)', () => {
    render(
      <AdaptiveSections
        {...baseProps}
        effectiveMethod="upswitch_adaptive"
        businessCategory="technology"
        businessTypeId="software_products"
        formData={{ business_model: 'b2b_saas' } as any}
        saasSignals={getBonusSectionsSaasSignalsFromFormData({
          business_model: 'b2b_saas',
        })}
      />
    )

    expect(screen.getByText('sections.saasMetrics')).toBeInTheDocument()
  })

  it('renders the DCF and SaaS sections together when both rules apply', () => {
    render(
      <AdaptiveSections
        {...baseProps}
        effectiveMethod="dcf"
        businessCategory="tech-digital"
        businessTypeId="saas"
      />
    )

    expect(screen.getByText('sections.dcfGlobalAssumptions')).toBeInTheDocument()
    expect(screen.getByText('sections.saasMetrics')).toBeInTheDocument()
    expect(screen.getByText('fields.saasArrGrowthPct')).toBeInTheDocument()
    expect(screen.getByText('fields.saasGrossMarginPct')).toBeInTheDocument()
    expect(screen.getByText('fields.ruleOf40Score')).toBeInTheDocument()
    expect(screen.queryByText('sections.navAssetSchedule')).not.toBeInTheDocument()
  })

  it('removes method-specific sections when switching back to adaptive and restores them later', async () => {
    const { rerender } = render(
      <AdaptiveSections
        {...baseProps}
        effectiveMethod="dcf"
        businessCategory="tech-digital"
        businessTypeId="saas"
      />
    )

    expect(screen.getByText('sections.dcfGlobalAssumptions')).toBeInTheDocument()

    rerender(
      <AdaptiveSections
        {...baseProps}
        effectiveMethod="upswitch_adaptive"
        businessCategory="tech-digital"
        businessTypeId="saas"
      />
    )

    await waitFor(() => {
      expect(screen.queryByText('sections.dcfGlobalAssumptions')).not.toBeInTheDocument()
    })
    expect(screen.getByText('sections.saasMetrics')).toBeInTheDocument()

    rerender(
      <AdaptiveSections
        {...baseProps}
        effectiveMethod="dcf"
        businessCategory="tech-digital"
        businessTypeId="saas"
      />
    )

    expect(screen.getByText('sections.dcfGlobalAssumptions')).toBeInTheDocument()
  })

  it('renders revenue-led guidance when omzet multiple is pre-selected', () => {
    render(
      <AdaptiveSections
        {...baseProps}
        effectiveMethod="omzet_multiple"
        businessCategory="professional-services"
        businessTypeId="accountancy"
      />
    )

    expect(screen.getByText('revenueDriverTitle')).toBeInTheDocument()
    expect(screen.getByText('revenueDriverText')).toBeInTheDocument()
    expect(screen.getByText('sections.revenueQuality')).toBeInTheDocument()
  })

  it('renders the fiscal disclaimer when fiscal 4x is selected', () => {
    render(
      <AdaptiveSections
        {...baseProps}
        effectiveMethod="fiscal_4x"
        businessCategory="holding"
        businessTypeId="family-holdco"
      />
    )

    expect(screen.getByText('fiscalDisclaimerTitle')).toBeInTheDocument()
    expect(screen.getByText('fiscalDisclaimerText')).toBeInTheDocument()
  })

  it('hides the fiscal disclaimer for NL accountant firms even if fiscal 4x is selected', () => {
    render(
      <AdaptiveSections
        {...baseProps}
        effectiveMethod="fiscal_4x"
        firmCountryCode="NL"
        businessCategory="holding"
        businessTypeId="family-holdco"
      />
    )

    expect(screen.queryByText('fiscalDisclaimerTitle')).not.toBeInTheDocument()
  })

  it('surfaces the DCF autofill action and forwards clicks', () => {
    const handleApply = vi.fn()

    render(
      <AdaptiveSections
        {...baseProps}
        effectiveMethod="dcf"
        businessCategory="professional-services"
        businessTypeId="accountancy"
        formData={{
          yearlyFinancials: [
            { year: '2024', revenue: 1_000_000, ebitda: 150_000 },
            { year: '2025', revenue: 0, ebitda: 0, isForecast: true },
            { year: '2026', revenue: 0, ebitda: 0, isForecast: true },
          ],
        } as any}
        onApplyDcfPercentAutofill={handleApply}
        canApplyDcfPercentAutofill
        terminalValueMethod="perpetual_growth"
        onTerminalValueMethodChange={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'applyForecastYears' })).toBeEnabled()
    expect(screen.getByText('applyForecastYearsDescription:count=2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'applyForecastYears' }))

    expect(handleApply).toHaveBeenCalledTimes(1)
  })
})

describe('OfficialFilingTrustPanel', () => {
  const formatCurrency = (value: number) => `EUR ${value.toLocaleString('nl-BE')}`

  it('renders the verification badge and official values when filing data exists', () => {
    render(
      <OfficialFilingTrustPanel
        locale="nl"
        formatCurrency={formatCurrency}
        officialFinancials={{
          sourceLabel: 'NBB filing via Staatsbladmonitor',
          filingYear: 2024,
          revenue: 1250000,
          ebitda: 150000,
        }}
        officialVerificationBadge={{
          state: 'verified',
          label: 'Verified by NBB',
        }}
        officialVarianceAnalysis={{
          state: 'not_required',
          explanationRequired: false,
        }}
        onExplanationChange={vi.fn()}
      />
    )

    expect(screen.getByText('Controle officiële bron (NBB)')).toBeInTheDocument()
    expect(screen.getByText('Verified by NBB')).toBeInTheDocument()
    expect(screen.getByText(/Boekjaar 2024/)).toBeInTheDocument()
    expect(screen.getByText(/EUR 1.250.000/)).toBeInTheDocument()
    expect(screen.getByText(/EUR 150.000/)).toBeInTheDocument()
  })

  it('renders an explanation field only when variance explanation is required', () => {
    const onExplanationChange = vi.fn()

    render(
      <OfficialFilingTrustPanel
        locale="en"
        formatCurrency={formatCurrency}
        officialFinancials={{
          filingYear: 2024,
          revenue: 800000,
        }}
        officialVerificationBadge={{
          state: 'partial',
          label: 'Partial official filing',
        }}
        officialVarianceAnalysis={{
          state: 'pending',
          explanationRequired: true,
        }}
        onExplanationChange={onExplanationChange}
      />
    )

    const explanation = screen.getByPlaceholderText(
      'Explain why your input differs from the official filing.'
    )
    expect(explanation).toBeInTheDocument()

    fireEvent.change(explanation, { target: { value: 'Seasonal slowdown in Q4' } })
    expect(onExplanationChange).toHaveBeenCalledTimes(1)
    expect(onExplanationChange).toHaveBeenLastCalledWith('Seasonal slowdown in Q4')
  })

  it('hides the explanation field when no variance explanation is required', () => {
    render(
      <OfficialFilingTrustPanel
        locale="en"
        formatCurrency={formatCurrency}
        officialFinancials={{
          filingYear: 2024,
          revenue: 800000,
        }}
        officialVerificationBadge={{
          state: 'verified',
          label: 'Verified by NBB',
        }}
        officialVarianceAnalysis={{
          state: 'not_required',
          explanationRequired: false,
        }}
        onExplanationChange={vi.fn()}
      />
    )

    expect(
      screen.queryByPlaceholderText('Explain why your input differs from the official filing.')
    ).not.toBeInTheDocument()
  })
})
