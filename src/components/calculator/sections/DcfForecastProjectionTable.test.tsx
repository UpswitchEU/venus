import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DcfForecastProjectionTable } from './DcfForecastProjectionTable'

const translations: Record<string, Record<string, string>> = {
  manualInput: {
    forecastLabel: 'Forecast',
    fillBothFields: 'Enter both revenue and EBITDA for this year',
    'fields.revenue': 'Revenue',
    'fields.ebitda': 'EBITDA',
    'fields.capex': 'CapEx',
    'fields.nwcChange': 'ΔNWC',
    'dcfProjectionTable.title': 'DCF projection table',
    'dcfProjectionTable.description': 'Edit the explicit forecast years used for the DCF calculation.',
    'dcfProjectionTable.columns.year': 'Year',
    'dcfProjectionTable.columns.ebitdaMarginPct': 'EBITDA %',
    'dcfProjectionTable.columns.fcff': 'FCFF',
  },
  common: {
    'actions.delete': 'Delete',
  },
}

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, string>) => {
    if (namespace === 'manualInput.methodSelector' && key === 'recommendedForMethod') {
      return `Recommended for ${values?.method ?? ''}`
    }
    return translations[namespace]?.[key] ?? translations.manualInput?.[key] ?? key
  },
  useLocale: () => 'en',
}))

vi.mock('../ProvenanceDot', () => ({
  ProvenanceDot: () => <span data-testid="provenance-dot" />,
}))

vi.mock('../SpotlightFieldWrapper', () => ({
  SpotlightFieldWrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../CurrencyInput', () => ({
  CurrencyInput: ({
    ariaLabel,
    onChange,
    allowNegative,
  }: {
    ariaLabel?: string
    onChange: (value: number | undefined) => void
    allowNegative?: boolean
  }) => (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => onChange(allowNegative ? -10 : 10)}
    >
      {ariaLabel}
    </button>
  ),
}))

describe('DcfForecastProjectionTable', () => {
  it('renders forecast rows in ascending year order', () => {
    render(
      <DcfForecastProjectionTable
        rows={[
          { year: '2028', revenue: 100, ebitda: 10, isForecast: true },
          { year: '2026', revenue: 100, ebitda: 10, isForecast: true },
          { year: '2027', revenue: 100, ebitda: 10, isForecast: true },
        ]}
        onChange={vi.fn()}
      />
    )

    const labels = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))
      .filter((label): label is string => Boolean(label))

    expect(labels.slice(0, 4)).toEqual([
      'Revenue 2026',
      'EBITDA 2026',
      'CapEx 2026',
      'ΔNWC 2026',
    ])
  })

  it('forwards edits with the selected year and field', () => {
    const handleChange = vi.fn()

    render(
      <DcfForecastProjectionTable
        rows={[{ year: '2026', revenue: 100, ebitda: 10, capex: 5, nwc_change: 2, isForecast: true }]}
        onChange={handleChange}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'ΔNWC 2026' }))

    expect(handleChange).toHaveBeenCalledWith('2026', 'nwc_change', -10)
  })

  it('supports removing an individual forecast row', () => {
    const handleRemoveYear = vi.fn()

    render(
      <DcfForecastProjectionTable
        rows={[{ year: '2026', revenue: 100, ebitda: 10, capex: 5, nwc_change: 2, isForecast: true }]}
        onChange={vi.fn()}
        onRemoveYear={handleRemoveYear}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete forecast 2026' }))

    expect(handleRemoveYear).toHaveBeenCalledWith('2026')
  })

  it('renders row-level validation feedback for forecast inputs', () => {
    render(
      <DcfForecastProjectionTable
        rows={[{ year: '2026', revenue: 100, ebitda: 10, isForecast: true }]}
        fieldValidation={{
          warnings: { 'margin-2026': 'High margin' },
          errors: { 'revenue-2026': 'Revenue required' },
        }}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByText('Revenue required')).toBeInTheDocument()
    expect(screen.getByText('High margin')).toBeInTheDocument()
  })

  it('shows partial-entry guidance when only one core forecast field is filled', () => {
    render(
      <DcfForecastProjectionTable
        rows={[{ year: '2026', revenue: 100, ebitda: 0, isForecast: true }]}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByText('Enter both revenue and EBITDA for this year')).toBeInTheDocument()
  })

  it('renders derived EBITDA margin and FCFF columns', () => {
    render(
      <DcfForecastProjectionTable
        rows={[{ year: '2026', revenue: 1000, ebitda: 250, capex: 50, nwc_change: 20, isForecast: true }]}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByText('EBITDA %')).toBeInTheDocument()
    expect(screen.getByText('FCFF')).toBeInTheDocument()
    expect(screen.getByText(/25/)).toBeInTheDocument()
    expect(screen.getByText(/180/)).toBeInTheDocument()
  })
})
