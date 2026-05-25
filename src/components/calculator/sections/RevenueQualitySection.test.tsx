import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { RevenueQualitySection } from './RevenueQualitySection'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values
      ? `${key}:${Object.entries(values)
          .map(([entryKey, value]) => `${entryKey}=${value}`)
          .join(',')}`
      : key,
  useLocale: () => 'en',
}))

vi.mock('../CurrencyInput', () => ({
  CurrencyInput: ({ label }: { label: string }) => <div>{label}</div>,
}))

vi.mock('./AdaptivePercentInput', () => ({
  AdaptivePercentInput: ({ label }: { label: string }) => <div>{label}</div>,
}))

vi.mock('./previewMetricCards', () => ({
  PreviewMetricCard: ({ label, value }: { label: string; value: string }) => (
    <div>{`${label}:${value}`}</div>
  ),
}))

describe('RevenueQualitySection', () => {
  it('shows the EV/EBITDA badge and marks the section ready in EBITDA-only context after two core inputs', () => {
    render(
      <RevenueQualitySection
        step={6}
        effectiveMethods={['ebitda_multiple']}
        revRecurringAmount={400000}
        revTopClientAmount={150000}
        onFieldChange={vi.fn()}
      />
    )

    expect(screen.getByText('revenueQualityBadgeEbitda')).toBeInTheDocument()
    expect(screen.getByText('revenueQualityPanels.ready')).toBeInTheDocument()
    expect(screen.getByText('fields.revTopClientCurrencyEbitda')).toBeInTheDocument()
  })

  it('uses churn as the third core input for SaaS revenue context', () => {
    render(
      <RevenueQualitySection
        step={6}
        effectiveMethods={['omzet_multiple']}
        businessTypeId="saas"
        revRecurringAmount={400000}
        revTopClientAmount={150000}
        onFieldChange={vi.fn()}
      />
    )

    expect(screen.getByText('revenueQualityBadgeOmzet')).toBeInTheDocument()
    expect(screen.getByText('revenueQualityPanels.progress:filled=2,total=3')).toBeInTheDocument()
    expect(screen.getByText('fields.revGrossChurnPct')).toBeInTheDocument()
    expect(screen.queryByText('fields.revContractBacklog')).not.toBeInTheDocument()
  })

  it('accepts object-shaped business categories without crashing', () => {
    render(
      <RevenueQualitySection
        step={6}
        effectiveMethods={['omzet_multiple']}
        businessCategory={{ id: 'technology', name: 'Technologie' }}
        revRecurringAmount={400000}
        revTopClientAmount={150000}
        onFieldChange={vi.fn()}
      />
    )

    expect(screen.getByText('fields.revGrossChurnPct')).toBeInTheDocument()
    expect(screen.queryByText('fields.revContractBacklog')).not.toBeInTheDocument()
  })

  it('derives preview ratios from latest revenue when available', () => {
    render(
      <RevenueQualitySection
        step={6}
        effectiveMethods={['omzet_multiple', 'ebitda_multiple']}
        latestRevenue={1200000}
        revRecurringAmount={600000}
        revTopClientAmount={300000}
        revContractBacklog={600000}
        onFieldChange={vi.fn()}
      />
    )

    expect(screen.getByText('revenueQualityBadgeBoth')).toBeInTheDocument()
    expect(screen.getByText('fields.revRecurringPct:50%')).toBeInTheDocument()
    expect(screen.getByText('fields.revTopClientConcentrationPct:25%')).toBeInTheDocument()
    expect(
      screen.getByText('fields.revenueQualityBacklogMonths:6 fields.revenueQualityMonthsSuffix')
    ).toBeInTheDocument()
  })
})
