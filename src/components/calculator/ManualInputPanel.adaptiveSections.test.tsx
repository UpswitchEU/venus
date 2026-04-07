import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBonusSectionsSaasSignalsFromFormData } from '@/constants/methodFieldConfig'
import { createManualCurrencyFormatter } from '@/lib/omniPreview'
import { FilingYearPrompt } from './FilingYearPrompt'
import {
  AdaptiveSections,
  getSeedYearlyFinancials,
  shouldAutoConfirmPrefilledFilingYear,
} from './ManualInputPanel'

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
  const previewCurrencyFormatter = createManualCurrencyFormatter('nl-BE')

  const baseProps = {
    formData: {} as any,
    onFieldChange: vi.fn(),
    terminalValueMethod: 'perpetual_growth' as const,
    onTerminalValueMethodChange: vi.fn(),
    disabled: false,
    previewCurrencyFormatter,
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

  it('does not render DCF global assumptions when suppressDcfGlobalAssumptions is true (embedded in main panel)', () => {
    render(
      <AdaptiveSections
        {...baseProps}
        effectiveMethod="dcf"
        businessCategory="tech-digital"
        businessTypeId="saas"
        suppressDcfGlobalAssumptions
      />
    )

    expect(screen.queryByText('sections.dcfGlobalAssumptions')).not.toBeInTheDocument()
    expect(screen.getByText('sections.saasMetrics')).toBeInTheDocument()
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

  it('renders revenue quality inputs when omzet multiple is pre-selected', () => {
    render(
      <AdaptiveSections
        {...baseProps}
        effectiveMethod="omzet_multiple"
        businessCategory="professional-services"
        businessTypeId="accountancy"
      />
    )

    expect(screen.getByText('sections.revenueQuality')).toBeInTheDocument()
  })

  it('renders the NAV section with the cleaned-up fields when adjusted NAV is selected', () => {
    render(
      <AdaptiveSections
        {...baseProps}
        effectiveMethod="adjusted_nav"
        businessCategory="holding"
        businessTypeId="family-holdco"
      />
    )

    expect(screen.getByText('sections.navAssetSchedule')).toBeInTheDocument()
    expect(screen.getByText('fields.navLead')).toBeInTheDocument()
    expect(screen.getByText('fields.navRealEstateAdjustment')).toBeInTheDocument()
    expect(screen.getByText('fields.navTaxLatencyPct')).toBeInTheDocument()
    expect(screen.queryByText('sections.saasMetrics')).not.toBeInTheDocument()
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
        formData={
          {
            yearlyFinancials: [
              { year: '2024', revenue: 1_000_000, ebitda: 150_000 },
              { year: '2025', revenue: 0, ebitda: 0, isForecast: true },
              { year: '2026', revenue: 0, ebitda: 0, isForecast: true },
            ],
          } as any
        }
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

