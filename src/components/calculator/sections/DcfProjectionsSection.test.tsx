import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DcfProjectionsSection } from './DcfProjectionsSection'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      'sections.dcfProjections': 'DCF Projections',
      'fields.dcfRevenueGrowthPct': 'Revenue growth (%)',
      'fields.dcfEbitdaMarginPct': 'EBITDA margin (%)',
      'fields.dcfCapexPct': 'CapEx (% of revenue)',
      'fields.dcfNwcPct': 'ΔNWC (% of revenue)',
      'fields.dcfTerminalGrowthPct': 'Terminal growth (%)',
      'fields.dcfExitMultiple': 'Exit multiple (x)',
    }
    return map[key] ?? key
  },
}))

vi.mock('./AdaptivePercentInput', () => ({
  AdaptivePercentInput: ({ label, value }: { label: string; value?: number }) => (
    <label>
      {label}
      <input aria-label={label} value={value ?? ''} readOnly />
    </label>
  ),
}))

vi.mock('./WaccBreakdownPanel', () => ({
  WaccBreakdownPanel: () => <div data-testid="wacc-panel">WACC Panel</div>,
}))

describe('DcfProjectionsSection', () => {
  it('renders the section header and all 7 input fields', () => {
    render(
      <DcfProjectionsSection
        dcfRevenueGrowthPct={5}
        dcfEbitdaMarginPct={15}
        dcfCapexPct={3}
        dcfNwcPct={2}
        dcfWaccPct={10}
        dcfTerminalGrowthPct={1.5}
        dcfExitMultiple={6}
        onFieldChange={vi.fn()}
      />
    )

    expect(screen.getByText('DCF Projections')).toBeInTheDocument()

    expect(screen.getByLabelText('Revenue growth (%)')).toHaveValue('5')
    expect(screen.getByLabelText('EBITDA margin (%)')).toHaveValue('15')
    expect(screen.getByLabelText('CapEx (% of revenue)')).toHaveValue('3')
    expect(screen.getByLabelText('ΔNWC (% of revenue)')).toHaveValue('2')
    expect(screen.getByLabelText('Terminal growth (%)')).toHaveValue('1.5')
    expect(screen.getByLabelText('Exit multiple (x)')).toHaveValue('6')
    expect(screen.getByTestId('wacc-panel')).toBeInTheDocument()
  })

  it('does not render any advisory blocks', () => {
    render(<DcfProjectionsSection onFieldChange={vi.fn()} />)

    expect(screen.queryByText(/smart default/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/fallback mode/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/owner dependency/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/risk-adjusted/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/recommended for/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/depreciation/i)).not.toBeInTheDocument()
  })
})
