import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SaasMetricsSection } from './SaasMetricsSection'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (key === 'saasImported.title') return 'Imported SaaS snapshot'
    if (key === 'saasImported.description') {
      return `Imported from ${values?.provider} for fiscal year ${values?.year} with ${values?.confidence}% confidence.`
    }
    return values
      ? `${key}:${Object.entries(values)
          .map(([entryKey, value]) => `${entryKey}=${value}`)
          .join(',')}`
      : key
  },
  /** Used by `useManualPreviewFormatters` inside SaasMetricsSection */
  useLocale: () => 'en',
}))

vi.mock('../CurrencyInput', () => ({
  CurrencyInput: ({ label }: { label: string }) => <div>{label}</div>,
}))

vi.mock('./AdaptivePercentInput', () => ({
  AdaptivePercentInput: ({ label }: { label: string }) => <div>{label}</div>,
}))

describe('SaasMetricsSection', () => {
  it('shows imported SaaS provenance when provider-backed metrics were hydrated', () => {
    render(
      <SaasMetricsSection
        onFieldChange={vi.fn()}
        importedSaasProvenance={{
          source: 'exact',
          confidence: 0.82,
          fiscal_year: 2024,
        }}
      />
    )

    expect(screen.getByText('Imported SaaS snapshot')).toBeInTheDocument()
    expect(
      screen.getByText('Imported from Exact for fiscal year 2024 with 82% confidence.')
    ).toBeInTheDocument()
  })

  it('keeps advanced inputs collapsed by default', () => {
    render(<SaasMetricsSection onFieldChange={vi.fn()} />)

    expect(screen.getByText('saasPanels.advancedLockedDescription')).toBeInTheDocument()
    expect(screen.getByText('saasPanels.showAdvancedButton')).toBeInTheDocument()
    expect(screen.queryByText('fields.saasCac')).not.toBeInTheDocument()
  })

  it('does not mark the section ready when only ARR and advanced metrics are filled', () => {
    render(
      <SaasMetricsSection
        onFieldChange={vi.fn()}
        saasArr={500000}
        saasCac={1500}
        saasSmSpend={120000}
      />
    )

    expect(screen.queryByText('saasProgress.ready')).not.toBeInTheDocument()
    expect(screen.getByText('saasProgress.filled:count=3,total=11')).toBeInTheDocument()
  })

  it('reveals advanced inputs automatically once the core SaaS inputs are ready', () => {
    render(
      <SaasMetricsSection
        onFieldChange={vi.fn()}
        saasArr={500000}
        saasArrGrowthPct={25}
        saasNrrPct={110}
      />
    )

    expect(screen.getByText('saasProgress.ready')).toBeInTheDocument()
    expect(screen.getByText('fields.saasCac')).toBeInTheDocument()
    expect(screen.getByText('fields.saasSmSpend')).toBeInTheDocument()
  })

  it('lets users open advanced inputs early when they already know them', () => {
    render(<SaasMetricsSection onFieldChange={vi.fn()} />)

    fireEvent.click(screen.getByText('saasPanels.showAdvancedButton'))

    expect(screen.getByText('fields.saasCac')).toBeInTheDocument()
    expect(screen.getByText('fields.saasCustomerConcentrationPct')).toBeInTheDocument()
  })
})
