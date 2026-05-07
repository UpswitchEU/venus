import { render, screen } from '@testing-library/react'
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
      />,
    )

    expect(screen.getAllByRole('button')).toHaveLength(3)
  })
})
