import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OmniMethodPanorama } from './OmniMethodPanorama'

const tOmni: Record<string, string> = {
  methodsPanoramaTitle: 'Methods',
  columnEquity: 'Equity',
  columnMultiple: 'Multiple',
  columnDelta: 'Delta',
  columnHintMobile: 'Hint',
  adaptiveBaselineLabel: 'Baseline',
  selected: 'Selected',
  rangeModel: 'model',
  rangeIllustrative: 'illustrative',
  planTeaserBadge: 'Teaser',
  planTeaserHint: 'Hint',
}

const tBreakdown: Record<string, string> = {
  wacc: 'WACC',
}

vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (key: string) => {
    if (ns === 'omniCalc') return tOmni[key] ?? key
    if (ns === 'methodBreakdown') return tBreakdown[key] ?? key
    return key
  },
}))

describe('OmniMethodPanorama', () => {
  it('renders one row when omzet and revenue alias the same hydrated object', () => {
    const shared = {
      available: true,
      value: 100_000,
      label: 'Omzet row',
      multiple_used: 1.5,
    }
    render(
      <OmniMethodPanorama
        valuationResults={{
          upswitch_adaptive: { available: true, value: 90_000, label: 'Adaptive' },
          ebitda_multiple: { available: true, value: 95_000, label: 'EBITDA' },
          omzet_multiple: shared,
          revenue_multiple: shared,
        }}
        selectedMethod="upswitch_adaptive"
        onMethodClick={vi.fn()}
      />
    )

    expect(screen.getAllByRole('button')).toHaveLength(3)
  })
})

describe('method financial presentation', () => {
  it('shows the supplied currency, signed range and explicit enterprise basis', () => {
    render(
      <OmniMethodPanorama
        currency="USD"
        valuationResults={{
          upswitch_adaptive: {
            label: 'Equity method',
            value: 0,
            available: true,
            details: { equity_range_low: -10, equity_range_high: 10 },
          },
          dcf: {
            label: 'Enterprise method',
            value: 500,
            value_basis: 'enterprise_value',
            available: true,
            value_low: 400,
            value_high: 600,
          },
        }}
        selectedMethod="dcf"
        onMethodClick={vi.fn()}
      />
    )
    const equity = screen.getByRole('button', { name: 'Equity method' })
    expect(within(equity).getByText('-$10 – $10')).toBeInTheDocument()
    const enterprise = screen.getByRole('button', { name: /Enterprise method/ })
    expect(within(enterprise).getByText('enterpriseValue')).toBeInTheDocument()
    expect(within(enterprise).getByText('$500')).toBeInTheDocument()
    expect(enterprise).not.toHaveTextContent('%')
    expect(enterprise).not.toHaveTextContent('€')
  })
  it('does not invent a currency or a zero from a malformed method amount', () => {
    render(
      <OmniMethodPanorama
        valuationResults={{
          dcf: { label: 'Unknown', value: 0, available: true },
          adjusted_nav: { label: 'Invalid', value: true as unknown as number, available: true },
        }}
        selectedMethod="dcf"
        onMethodClick={vi.fn()}
      />
    )
    expect(screen.getByText('equityValue · currencyUnknown')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Invalid' })).toBeDisabled()
    expect(screen.queryByText(/€/)).not.toBeInTheDocument()
  })
})
