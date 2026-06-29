import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The panel reads translations + locale; the key-returning mock keeps assertions
// stable and lets us check the forecast legend by its label key.
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))

import { useManualResultsStore } from '../../../store/manual'
import type { ValuationResponse } from '../../../types/valuation'
import { ManualValuationCurvePanel } from './ManualValuationCurvePanel'

const timeline = [
  { fiscal_year: 2022, equity_low: 360000, equity_mid: 470000, equity_high: 560000 },
  { fiscal_year: 2023, equity_low: 430000, equity_mid: 540000, equity_high: 640000 },
  { fiscal_year: 2024, equity_low: 480000, equity_mid: 610000, equity_high: 720000 },
  {
    fiscal_year: 2025,
    equity_low: 520000,
    equity_mid: 790000,
    equity_high: 980000,
    is_forecast: true,
  },
]

function seed(result: Partial<ValuationResponse>) {
  act(() => {
    useManualResultsStore.setState({ result: result as ValuationResponse, isCalculating: false })
  })
}

afterEach(() => {
  act(() => {
    useManualResultsStore.setState({ result: null, isCalculating: false })
  })
})

describe('ManualValuationCurvePanel', () => {
  it('renders the visx chart and the sr-only data table for a multi-year timeline', () => {
    seed({ currency: 'EUR', valuation_timeline: timeline })
    const { container } = render(<ManualValuationCurvePanel />)
    expect(container.querySelector('[data-testid="valuation-chart-hitbox"]')).toBeTruthy()
    const table = container.querySelector('table.sr-only')
    expect(table).toBeTruthy()
    expect(table?.textContent).toMatch(/\b2022\b/)
    expect(table?.textContent).not.toMatch(/31|Dec/)
    // Forecast present ⇒ the forecast legend + the data-table status cell render
    // the label (the i18n mock returns the key), so it appears more than once.
    expect(screen.getAllByText('labels.forecast').length).toBeGreaterThan(0)
  })

  it('headlines the latest ACTUAL year, never the forecast', () => {
    seed({ currency: 'EUR', valuation_timeline: timeline })
    render(<ManualValuationCurvePanel />)
    const headline = screen.getByTestId('valuation-curve-headline').textContent ?? ''
    // Latest actual is 2024 / €610k — the report headline. The 2025 forecast (€790k)
    // must NOT be the headline number, or the curve would contradict the report.
    expect(headline).toMatch(/2024/)
    expect(headline).toMatch(/610/)
    expect(headline).not.toMatch(/790/)
  })

  it('keeps DCF forecast rows out of the valuation-snapshot curve', () => {
    seed({
      currency: 'EUR',
      selected_valuation_method: 'dcf',
      dcf_valuation: { enterprise_value: 610000 },
      valuation_timeline: timeline,
    } as unknown as Partial<ValuationResponse>)
    render(<ManualValuationCurvePanel />)

    expect(screen.queryByText('labels.forecast')).toBeNull()
    expect(screen.getByText(/footnoteDcfForecast/)).toBeTruthy()
  })

  it('keeps serialized DCF forecast rows out of the valuation-snapshot curve', () => {
    const serializedTimeline = [
      ...timeline.slice(0, 3),
      { ...timeline[3], is_forecast: 'true' },
    ] as unknown as ValuationResponse['valuation_timeline']
    seed({
      currency: 'EUR',
      selected_valuation_method: 'dcf',
      dcf_valuation: { enterprise_value: 610000 },
      valuation_timeline: serializedTimeline,
    } as unknown as Partial<ValuationResponse>)
    render(<ManualValuationCurvePanel />)

    expect(screen.queryByText('labels.forecast')).toBeNull()
    expect(screen.getByText(/footnoteDcfForecast/)).toBeTruthy()
  })

  it('falls back to the headline equity band when there is no timeline', () => {
    seed({
      currency: 'EUR',
      equity_value_low: 80000,
      equity_value_mid: 100000,
      equity_value_high: 120000,
      valuation_date: '2024-06-15T00:00:00.000Z',
    })
    const { container } = render(<ManualValuationCurvePanel />)
    // One point ⇒ the single-point baseline (its accessible <dl>), no multi-year table.
    expect(container.querySelector('dl.sr-only')).toBeTruthy()
    expect(container.querySelector('table.sr-only')).toBeNull()
  })
})
