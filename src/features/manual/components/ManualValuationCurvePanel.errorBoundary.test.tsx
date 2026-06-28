import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))

// Force the chart to throw so we can prove the ErrorBoundary catches it and keeps
// the report workspace alive (a graceful fallback, never a white screen).
vi.mock('../../../components/valuation-graph', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('../../../components/valuation-graph')
  return {
    ...actual,
    ValuationTrendChart: () => {
      throw new Error('simulated chart crash')
    },
  }
})

import { useManualResultsStore } from '../../../store/manual'
import type { ValuationResponse } from '../../../types/valuation'
import { ManualValuationCurvePanel } from './ManualValuationCurvePanel'

afterEach(() => {
  useManualResultsStore.setState({ result: null, isCalculating: false })
  vi.restoreAllMocks()
})

describe('ManualValuationCurvePanel error boundary', () => {
  it('shows a graceful fallback (and keeps the header) when the chart throws', () => {
    // React logs the boundary-caught error; silence it to keep the test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    useManualResultsStore.setState({
      result: {
        currency: 'EUR',
        valuation_timeline: [
          { fiscal_year: 2023, equity_low: 1, equity_mid: 2, equity_high: 3 },
          { fiscal_year: 2024, equity_low: 1, equity_mid: 2, equity_high: 3 },
        ],
      } as ValuationResponse,
      isCalculating: false,
    })

    render(<ManualValuationCurvePanel />)

    // Fallback copy (t('error') → 'error' via the i18n key-mock) is shown…
    expect(screen.getByText('error')).toBeTruthy()
    // …and the header outside the boundary survived (no white-screen crash).
    expect(screen.getByText('title')).toBeTruthy()
  })
})
