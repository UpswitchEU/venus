import { fireEvent, render, screen } from '@testing-library/react'
import React, { useState } from 'react'
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
  'waccBreakdown.manualOverride':
    'WACC {wacc}% — manual / sector median (CAPM build-up below differs)',
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
  it('seeds missing build-up defaults through the shared default path', () => {
    const handleFieldChange = vi.fn()

    render(<WaccBreakdownPanel currentWaccPct={9.8} onFieldChange={handleFieldChange} />)

    expect(handleFieldChange).toHaveBeenCalledWith('dcf_risk_free_rate_pct', 3)
    expect(handleFieldChange).toHaveBeenCalledWith('dcf_equity_risk_premium_pct', 5.5)
    expect(handleFieldChange).toHaveBeenCalledWith('dcf_beta', 1.1)
    expect(handleFieldChange).toHaveBeenCalledWith('dcf_cost_of_debt_pct', 4.5)
    expect(handleFieldChange).toHaveBeenCalledWith('dcf_debt_equity_pct', 30)
    expect(handleFieldChange).toHaveBeenCalledWith('dcf_tax_shield_pct', 25)
  })

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

  it('shows manual override message when headline WACC diverges from CAPM chip', () => {
    render(
      <WaccBreakdownPanel
        currentWaccPct={10.5}
        riskFreeRatePct={3}
        equityRiskPremiumPct={5.5}
        beta={1.1}
        costOfDebtPct={4.5}
        debtEquityPct={30}
        taxShieldPct={25}
        onFieldChange={vi.fn()}
      />
    )

    expect(screen.getByText(/manual \/ sector median/i)).toBeInTheDocument()
  })

  it('toggle button text switches between expand and collapse', () => {
    render(<WaccBreakdownPanel currentWaccPct={10} onFieldChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: /Show inputs/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Show inputs/ }))
    expect(screen.getByRole('button', { name: /Hide inputs/ })).toBeInTheDocument()
  })

  it('expands safely when parent recreates onFieldChange after the computed WACC write-back', () => {
    function InlineParent() {
      const [formData, setFormData] = useState({
        dcf_wacc_pct: 11,
        dcf_risk_free_rate_pct: 3,
        dcf_equity_risk_premium_pct: 5.5,
        dcf_beta: 1.1,
        dcf_cost_of_debt_pct: 4.5,
        dcf_debt_equity_pct: 30,
        dcf_tax_shield_pct: 25,
      })

      return (
        <WaccBreakdownPanel
          currentWaccPct={formData.dcf_wacc_pct}
          riskFreeRatePct={formData.dcf_risk_free_rate_pct}
          equityRiskPremiumPct={formData.dcf_equity_risk_premium_pct}
          beta={formData.dcf_beta}
          costOfDebtPct={formData.dcf_cost_of_debt_pct}
          debtEquityPct={formData.dcf_debt_equity_pct}
          taxShieldPct={formData.dcf_tax_shield_pct}
          onFieldChange={(field, value) => {
            setFormData((previous) => ({ ...previous, [field]: value }))
          }}
        />
      )
    }

    render(<InlineParent />)

    fireEvent.click(screen.getByRole('button', { name: /Show inputs/ }))

    expect(screen.getByRole('button', { name: /Hide inputs/ })).toBeInTheDocument()
    expect(screen.getByLabelText('WACC (%)')).toHaveValue('7.3')
  })

  it('parses persisted localized DCF assumption strings before rendering or seeding', () => {
    const handleFieldChange = vi.fn()

    render(
      <WaccBreakdownPanel
        currentWaccPct={'7,3' as unknown as number}
        riskFreeRatePct={'3,0' as unknown as number}
        equityRiskPremiumPct={'5,5' as unknown as number}
        beta={'1,1' as unknown as number}
        costOfDebtPct={'4,5' as unknown as number}
        debtEquityPct={'30' as unknown as number}
        taxShieldPct={'25' as unknown as number}
        onFieldChange={handleFieldChange}
      />
    )

    expect(screen.getByLabelText('WACC (%)')).toHaveValue('7.3')
    fireEvent.click(screen.getByRole('button', { name: /Show inputs/ }))

    expect(screen.getByLabelText('Risk-free rate (%)')).toHaveValue('3')
    expect(screen.getByLabelText('Equity risk premium (%)')).toHaveValue('5.5')
    expect(screen.getByLabelText('Beta')).toHaveValue('1.1')
    expect(handleFieldChange).not.toHaveBeenCalledWith('dcf_wacc_pct', expect.any(Number))
    expect(handleFieldChange).not.toHaveBeenCalledWith('dcf_risk_free_rate_pct', expect.any(Number))
  })
})
