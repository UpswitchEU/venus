import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HistoricalYearCard } from './HistoricalYearCard'

const api = vi.hoisted(() => ({
  createFinancialCorrection: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'nl',
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/services/api/accounting', () => ({
  accountingAPI: api,
  parseAccountingApiError: (error: unknown) => String(error),
}))

vi.mock('../CurrencyInput', () => ({
  CurrencyInput: ({ label, value }: { label: string; value: number }) => (
    <label>
      {label}
      <input aria-label={label} value={value} readOnly />
    </label>
  ),
}))

vi.mock('../FieldHelpTrigger', () => ({ FieldHelpTrigger: () => null }))
vi.mock('./NbbResetHint', () => ({ NbbResetHint: () => null }))

describe('HistoricalYearCard source-bound correction', () => {
  const sourceDigest = 'a'.repeat(64)

  beforeEach(() => {
    api.createFinancialCorrection.mockReset()
    window.history.replaceState(null, '', '/nl/manual?clientId=client-1')
  })

  it('shows the local exclusion and persists the corrected year against the exact source', async () => {
    const onFinancialCorrectionRecorded = vi.fn()
    api.createFinancialCorrection.mockResolvedValue({
      id: 'correction-1',
      fiscal_year: 2024,
      source_digest: sourceDigest,
    })

    render(
      <HistoricalYearCard
        baseFilingYearForLabels={2024}
        fieldValidation={{ errors: {}, warnings: {} }}
        financialRows={[{ year: '2024', revenue: 1_000, ebitda: 100 }]}
        formatCurrency={(amount) => String(amount)}
        onRemoveForecastYear={vi.fn()}
        onRemoveHistoricalYear={vi.fn()}
        onFinancialCorrectionRecorded={onFinancialCorrectionRecorded}
        partialYears={[]}
        updateYearlyFinancials={vi.fn()}
        yearData={{
          year: '2024',
          revenue: 1_000,
          ebitda: 100,
          source_provider: 'silverfin',
          source_digest: sourceDigest,
          eligibility_reason: 'incomplete_operating_pair',
        }}
        readinessIssue={{
          reason_code: 'incomplete_operating_pair',
          source_digest: sourceDigest,
        }}
        sourceProvider="silverfin"
      />
    )

    expect(screen.getByText('Dit boekjaar telt nog niet mee')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Broncijfers dossierbreed corrigeren' }))
    fireEvent.change(
      screen.getByRole('textbox', {
        name: /Beschrijf welk bronbewijs de gecorrigeerde omzet en EBITDA ondersteunt/,
      }),
      { target: { value: 'Gecontroleerd tegen de volledige jaarrekening.' } }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Correctie duurzaam opslaan' }))

    await waitFor(() =>
      expect(api.createFinancialCorrection).toHaveBeenCalledWith({
        clientId: 'client-1',
        provider: 'silverfin',
        fiscalYear: 2024,
        sourceDigest,
        revenue: '1000',
        ebitda: '100',
        reason: 'Gecontroleerd tegen de volledige jaarrekening.',
      })
    )
    expect(onFinancialCorrectionRecorded).toHaveBeenCalledWith({
      year: 2024,
      correctionId: 'correction-1',
      sourceDigest,
    })
  })

  it('does not offer a correction for a stale readiness digest', () => {
    render(
      <HistoricalYearCard
        baseFilingYearForLabels={2024}
        fieldValidation={{ errors: {}, warnings: {} }}
        financialRows={[{ year: '2024', revenue: 1_000, ebitda: 100 }]}
        formatCurrency={(amount) => String(amount)}
        onRemoveForecastYear={vi.fn()}
        onRemoveHistoricalYear={vi.fn()}
        partialYears={[]}
        updateYearlyFinancials={vi.fn()}
        yearData={{
          year: '2024',
          revenue: 1_000,
          ebitda: 100,
          source_provider: 'silverfin',
          source_digest: sourceDigest,
          eligibility_reason: 'incomplete_operating_pair',
        }}
        readinessIssue={{
          reason_code: 'incomplete_operating_pair',
          source_digest: 'b'.repeat(64),
        }}
        sourceProvider="silverfin"
      />
    )

    expect(screen.queryByText('Broncijfers dossierbreed corrigeren')).not.toBeInTheDocument()
  })
})
