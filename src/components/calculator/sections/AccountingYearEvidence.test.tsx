import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ImportQualityPerYear } from '@/store/useImportQualityStore'
import { AccountingYearEvidence } from './AccountingYearEvidence'

vi.mock('next-intl', () => ({
  useLocale: () => 'nl-BE',
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key}:${Object.values(values).join('|')}` : key,
}))

const quality: ImportQualityPerYear = {
  confidence_score: 1,
  audit_flags: [],
  field_provenance: [
    { field: 'revenue', value: 19_180, source_accounts: ['700'], mapping_method: 'direct' },
    { field: 'ebitda', value: 18_792, source_accounts: ['70', '60'], mapping_method: 'computed' },
  ],
  total_accounts_processed: 240,
  accounts_mapped_directly: 237,
  accounts_fallback: 0,
  accounts_skipped: 3,
  source_provenance: {
    provider: 'silverfin',
    period_id: 'period-2024-private',
    period_start_date: '2024-01-01',
    period_end_date: '2024-12-31',
    is_year_end: true,
    is_partial_period: false,
    account_mapping_coverage_pct: 98.75,
    fetched_at: '2025-02-03T14:30:00.000Z',
  },
}

describe('AccountingYearEvidence', () => {
  it('shows the selected provider period and verified mapping evidence', () => {
    render(
      <AccountingYearEvidence
        formatCurrency={(amount) => `€${amount}`}
        importQuality={quality}
        yearData={{
          year: '2024',
          revenue: 19_180,
          ebitda: 18_792,
          source_provider: 'silverfin',
          source_kind: 'accounting_integration',
          quality_state: 'ready',
        }}
      />
    )

    expect(screen.getByText('silverfin')).toBeInTheDocument()
    expect(screen.getByText('statusReady')).toBeInTheDocument()
    expect(screen.getByText(/^periodRange:/)).toBeInTheDocument()
    expect(screen.getByText('coverage:99')).toBeInTheDocument()
  })

  it('makes source and effective figures explicit for a source-bound correction', () => {
    render(
      <AccountingYearEvidence
        formatCurrency={(amount) => `€${amount}`}
        importQuality={quality}
        yearData={{
          year: '2024',
          revenue: 11_282_327,
          ebitda: 935_935,
          source_provider: 'silverfin',
          source_kind: 'accounting_integration',
          quality_state: 'advisor_corrected',
          correction_id: 'correction-1',
        }}
      />
    )

    expect(screen.getByText('statusCorrected')).toBeInTheDocument()
    expect(screen.getByText('sourceValues')).toBeInTheDocument()
    expect(screen.getByText('effectiveValues')).toBeInTheDocument()
    expect(screen.getByText('revenueShort €19180')).toBeInTheDocument()
    expect(screen.getByText('ebitdaShort €18792')).toBeInTheDocument()
    expect(screen.getByText('revenueShort €11282327')).toBeInTheDocument()
    expect(screen.getByText('ebitdaShort €935935')).toBeInTheDocument()
  })

  it('stays out of the way for manual rows', () => {
    const { container } = render(
      <AccountingYearEvidence
        formatCurrency={(amount) => `€${amount}`}
        yearData={{
          year: '2024',
          revenue: 100,
          ebitda: 10,
          source_kind: 'manual',
        }}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })
})
