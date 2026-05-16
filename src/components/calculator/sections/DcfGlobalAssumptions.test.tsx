import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DcfGlobalAssumptions } from './DcfGlobalAssumptions'

// Minimal i18n stub — the seed effect doesn't depend on any specific copy.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// Stub heavy children so we can isolate the seed effect.
vi.mock('./AdaptivePercentInput', () => ({
  AdaptivePercentInput: ({ label }: { label: string }) => <span data-testid={label} />,
}))
vi.mock('./WaccBreakdownPanel', () => ({
  WaccBreakdownPanel: () => <span data-testid="wacc-breakdown" />,
}))
vi.mock('./ValuationSectionHeader', () => ({
  ValuationSectionHeader: ({ title }: { title: React.ReactNode }) => <h3>{title}</h3>,
}))
vi.mock('@/design-system/components/SegmentedControl', () => ({
  SegmentedControl: () => <div data-testid="segmented" />,
}))
vi.mock('@/design-system/components/Switch', () => ({
  Switch: ({ label }: { label: string }) => <span>{label}</span>,
}))
vi.mock('framer-motion', () => ({
  motion: { section: 'section', div: 'div' },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const baseProps = {
  step: 1,
  variant: 'forecastDefaultsOnly' as const,
  terminalValueMethod: 'perpetual_growth' as const,
  onTerminalValueMethodChange: () => undefined,
  dcfInputMode: 'ebitda' as const,
}

describe('DcfGlobalAssumptions — smart-defaults seed effect', () => {
  it('seeds blank fields with smart defaults (history > engine fallback)', () => {
    const onFieldChange = vi.fn()
    const smartDefaults = {
      revenueGrowthPct: 12, // historical CAGR — should win over the static 3 fallback
      ebitdaMarginPct: 22,
      capexPct: 4.4,
      daPct: 3.3,
      nwcPct: 1.2,
      taxRatePct: 25,
      waccPct: 11,
      terminalGrowthPct: 2.5,
      exitMultiple: 6,
    }

    render(
      <DcfGlobalAssumptions
        {...baseProps}
        onFieldChange={onFieldChange}
        smartDefaults={smartDefaults}
      />
    )

    // Each smart-default value lands in the corresponding form field.
    expect(onFieldChange).toHaveBeenCalledWith('dcf_revenue_growth_pct', 12)
    expect(onFieldChange).toHaveBeenCalledWith('dcf_ebitda_margin_pct', 22)
    expect(onFieldChange).toHaveBeenCalledWith('dcf_capex_pct', 4.4)
    expect(onFieldChange).toHaveBeenCalledWith('dcf_da_pct', 3.3)
    expect(onFieldChange).toHaveBeenCalledWith('dcf_nwc_pct', 1.2)
    expect(onFieldChange).toHaveBeenCalledWith('dcf_tax_rate_pct', 25)
  })

  it('prefers integration overrides over smart defaults for CapEx and D&A', () => {
    const onFieldChange = vi.fn()
    const smartDefaults = {
      revenueGrowthPct: 5,
      ebitdaMarginPct: 15,
      capexPct: 4, // smart default
      daPct: 3,
      taxRatePct: 25,
    }

    render(
      <DcfGlobalAssumptions
        {...baseProps}
        onFieldChange={onFieldChange}
        smartDefaults={smartDefaults}
        integrationCapexPct={5.7} // wins over smart default
        integrationDaPct={2.1}
      />
    )

    expect(onFieldChange).toHaveBeenCalledWith('dcf_capex_pct', 5.7)
    expect(onFieldChange).toHaveBeenCalledWith('dcf_da_pct', 2.1)
  })

  it('does not overwrite a field the user has already filled in', () => {
    const onFieldChange = vi.fn()
    const smartDefaults = { revenueGrowthPct: 12 }

    render(
      <DcfGlobalAssumptions
        {...baseProps}
        onFieldChange={onFieldChange}
        dcfRevenueGrowthPct={4.2} // user-typed value present
        smartDefaults={smartDefaults}
      />
    )

    // Revenue growth should NOT be re-seeded — user's 4.2 stays.
    const calls = onFieldChange.mock.calls
    const revenueGrowthCalls = calls.filter(([field]) => field === 'dcf_revenue_growth_pct')
    expect(revenueGrowthCalls).toHaveLength(0)
  })

  it('falls back to engine static defaults when no smartDefaults provided', () => {
    const onFieldChange = vi.fn()

    render(<DcfGlobalAssumptions {...baseProps} onFieldChange={onFieldChange} />)

    // Static fallbacks from dcfEngineDefaults.ts: 3% growth, 10% margin (fallback constant).
    expect(onFieldChange).toHaveBeenCalledWith('dcf_revenue_growth_pct', 3)
    expect(onFieldChange).toHaveBeenCalledWith('dcf_ebitda_margin_pct', 10)
  })

  it('does not seed forecast-defaults fields in FCFF-only mode', () => {
    const onFieldChange = vi.fn()
    const smartDefaults = { revenueGrowthPct: 12, ebitdaMarginPct: 22 }

    render(
      <DcfGlobalAssumptions
        {...baseProps}
        dcfInputMode="fcff_only"
        onFieldChange={onFieldChange}
        smartDefaults={smartDefaults}
      />
    )

    const calls = onFieldChange.mock.calls.map(([field]) => field)
    expect(calls).not.toContain('dcf_revenue_growth_pct')
    expect(calls).not.toContain('dcf_ebitda_margin_pct')
    expect(calls).not.toContain('dcf_capex_pct')
  })

  it('does not seed any field when disabled', () => {
    const onFieldChange = vi.fn()

    render(
      <DcfGlobalAssumptions
        {...baseProps}
        onFieldChange={onFieldChange}
        smartDefaults={{ revenueGrowthPct: 12 }}
        disabled
      />
    )

    expect(onFieldChange).not.toHaveBeenCalled()
  })
})
