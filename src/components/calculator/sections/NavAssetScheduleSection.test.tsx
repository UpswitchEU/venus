import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { NavAssetScheduleSection } from './NavAssetScheduleSection'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values
      ? `${key}:${Object.entries(values)
          .map(([entryKey, value]) => `${entryKey}=${value}`)
          .join(',')}`
      : key,
  useLocale: () => 'nl',
}))

vi.mock('../CurrencyInput', () => ({
  CurrencyInput: ({ label }: { label: string }) => <div>{label}</div>,
}))

vi.mock('./AdaptivePercentInput', () => ({
  AdaptivePercentInput: ({ label }: { label: string }) => <div>{label}</div>,
}))

// Round-4 audit stripped the schedule-summary preview cards from the
// section (advisory output → moved to the report). The PreviewMetricCard
// mock is no longer needed; left as a no-op breadcrumb in case future
// regression tests want to verify it stays out.

describe('NavAssetScheduleSection', () => {
  it('renders the NAV section header (left panel = data input only)', () => {
    render(<NavAssetScheduleSection step={5} navTaxLatencyPct={25} onFieldChange={vi.fn()} />)

    expect(screen.getByText('sections.navAssetSchedule')).toBeInTheDocument()
  })

  it('does not render the navProgress chrome that was stripped 2026-05-10', () => {
    // Audit pin: the section USED to render a "X of N filled" progress
    // bar + "Mostly prefilled" confidence chip + a "Recommended for NAV"
    // badge.  All three were advisor narrative (status / framing /
    // coaching) on a data-input panel.  The methodology / confidence
    // copy lives in the NAV report (`adjusted_nav_valuation.html`)
    // instead.  This test prevents the chrome creeping back.
    render(
      <NavAssetScheduleSection
        step={5}
        businessType="services"
        navTaxLatencyPct={25}
        navOffBalanceItems={0}
        onFieldChange={vi.fn()}
      />
    )

    expect(screen.queryByText('sections.navProgressReady')).not.toBeInTheDocument()
    expect(screen.queryByText(/sections\.navProgressHint/)).not.toBeInTheDocument()
    expect(screen.queryByText(/recommendedForMethod/)).not.toBeInTheDocument()
    expect(screen.queryByText(/prefill\.confidence/)).not.toBeInTheDocument()
    expect(screen.queryByText('sections.navDefaultsButton')).not.toBeInTheDocument()
  })
})
