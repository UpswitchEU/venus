import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { WaccBreakdownPanel } from './WaccBreakdownPanel'

const translations: Record<string, string> = {
  'fields.dcfWaccPct': 'WACC (%)',
  'fields.dcfRiskFreeRatePct': 'Risk-free rate (%)',
  'fields.dcfEquityRiskPremiumPct': 'Equity risk premium (%)',
  'fields.dcfBeta': 'Beta',
  'fields.dcfCostOfDebtPct': 'Cost of debt (%)',
  'fields.dcfDebtEquityPct': 'Debt share (%)',
  'fields.dcfTaxShieldPct': 'Tax shield (%)',
  'waccBreakdown.expand': 'Show inputs',
  'waccBreakdown.collapse': 'Hide inputs',
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => translations[key] ?? key,
}))

vi.mock('./AdaptivePercentInput', () => ({
  AdaptivePercentInput: ({
    label,
    value,
    onChange,
    readOnly,
  }: {
    label: string
    value?: number
    onChange: (value: number | undefined) => void
    readOnly?: boolean
  }) => (
    <label>
      {label}
      <input
        aria-label={label}
        value={value ?? ''}
        readOnly={readOnly}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  ),
}))

describe('WaccBreakdownPanel', () => {
  it('renders aggregate WACC by default and expands into decomposition fields', () => {
    render(<WaccBreakdownPanel currentWaccPct={9.8} onFieldChange={vi.fn()} />)

    expect(screen.getByLabelText('WACC (%)')).toHaveValue('9.8')
    fireEvent.click(screen.getByRole('button', { name: /Show inputs/ }))

    expect(screen.getByLabelText('Risk-free rate (%)')).toBeInTheDocument()
    expect(screen.getByLabelText('Equity risk premium (%)')).toBeInTheDocument()
  })

  it('computes WACC from the expanded assumptions', () => {
    const handleFieldChange = vi.fn()

    render(
      <WaccBreakdownPanel
        onFieldChange={handleFieldChange}
        riskFreeRatePct={3}
        equityRiskPremiumPct={5.5}
        beta={1.1}
        costOfDebtPct={4.5}
        debtEquityPct={30}
        taxShieldPct={25}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Show inputs/ }))

    expect(handleFieldChange).toHaveBeenCalledWith('dcf_wacc_pct', 7.3)
    expect(screen.getByLabelText('WACC (%)')).toHaveValue('7.3')
    expect(screen.getByLabelText('WACC (%)')).toHaveAttribute('readonly')
  })

  it('toggle button text switches between expand and collapse', () => {
    render(<WaccBreakdownPanel currentWaccPct={10} onFieldChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: /Show inputs/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Show inputs/ }))
    expect(screen.getByRole('button', { name: /Hide inputs/ })).toBeInTheDocument()
  })
})
