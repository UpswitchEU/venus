import React from 'react'
import { render, screen } from '@testing-library/react'
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

vi.mock('./previewMetricCards', () => ({
  PreviewMetricCard: ({ label }: { label: string }) => <div>{label}</div>,
}))

describe('NavAssetScheduleSection', () => {
  it('counts deduction fields in the NAV progress text', () => {
    render(
      <NavAssetScheduleSection
        step={5}
        navTaxLatencyPct={25}
        onFieldChange={vi.fn()}
      />
    )

    expect(screen.getByText('sections.navAssetSchedule')).toBeInTheDocument()
    expect(screen.getByText('sections.navProgressHint:filled=1,total=8')).toBeInTheDocument()
  })

  it('treats deduction inputs as real progress and hides sector defaults', () => {
    render(
      <NavAssetScheduleSection
        step={5}
        businessType="services"
        navTaxLatencyPct={25}
        navOffBalanceItems={0}
        onFieldChange={vi.fn()}
      />
    )

    expect(screen.getByText('sections.navProgressReady')).toBeInTheDocument()
    expect(screen.queryByText('sections.navDefaultsButton')).not.toBeInTheDocument()
  })
})
