import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HistoricalYearWeightingSection } from './HistoricalYearWeightingSection'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.weights ? `${key}: ${values.weights}` : key,
  useLocale: () => 'en',
}))

const baseProps = {
  historicalYears: [2023, 2024, 2025],
  onFieldChange: vi.fn(),
}

describe('HistoricalYearWeightingSection', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders the title + hint in the inline variant', () => {
    render(<HistoricalYearWeightingSection {...baseProps} variant="inline" />)
    expect(screen.getByText('historicalWeightingTitle')).toBeInTheDocument()
    expect(screen.getByText('historicalWeightingHint')).toBeInTheDocument()
  })

  it('omits the title in the modal variant', () => {
    render(<HistoricalYearWeightingSection {...baseProps} variant="modal" />)
    expect(screen.queryByText('historicalWeightingTitle')).not.toBeInTheDocument()
    // Controls still render.
    expect(screen.getByRole('radio', { name: 'standardAverage' })).toBeInTheDocument()
  })

  it('seeds custom weights on the recency default (50/33/17) when switching to weighted', () => {
    render(<HistoricalYearWeightingSection {...baseProps} variant="inline" />)

    fireEvent.click(screen.getByRole('radio', { name: 'weightedAverage' }))

    expect(baseProps.onFieldChange).toHaveBeenCalledWith(
      'historical_ebitda_weighting_mode',
      'weighted'
    )
    expect(baseProps.onFieldChange).toHaveBeenCalledWith('historical_ebitda_weights', {
      2023: 17,
      2024: 33,
      2025: 50,
    })
  })

  it('disables custom weighting and explains why with fewer than three years', () => {
    render(
      <HistoricalYearWeightingSection
        historicalYears={[2024, 2025]}
        onFieldChange={vi.fn()}
        variant="inline"
      />
    )

    expect(screen.getByRole('radio', { name: 'weightedAverage' })).toBeDisabled()
    expect(screen.getByText('needsThreeYears')).toBeInTheDocument()
    expect(screen.getByText('standardWeightingSummary: 2025 67% · 2024 33%')).toBeInTheDocument()
  })

  it('renders one slider per year when already in weighted mode', () => {
    render(
      <HistoricalYearWeightingSection
        {...baseProps}
        historicalEbitdaWeightingMode="weighted"
        historicalEbitdaWeights={{ 2023: 17, 2024: 33, 2025: 50 }}
        variant="inline"
      />
    )

    expect(screen.getByRole('slider', { name: /2023/ })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: /2024/ })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: /2025/ })).toBeInTheDocument()
  })
})
