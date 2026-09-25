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
  it('says nothing for a clean imported year: the section already names the source once', () => {
    const { container } = render(
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

    expect(container).toBeEmptyDOMElement()
  })

  it('does not repeat the provider name or sync time on a year that needs review', () => {
    render(
      <AccountingYearEvidence
        formatCurrency={(amount) => `€${amount}`}
        importQuality={{
          ...quality,
          source_provenance: {
            ...quality.source_provenance,
            period_start_date: '2023-07-01',
            period_end_date: '2024-06-30',
            account_mapping_coverage_pct: 81.2,
          },
        }}
        yearData={{
          year: '2024',
          revenue: 19_180,
          ebitda: 18_792,
          source_provider: 'silverfin',
          source_kind: 'accounting_integration',
          quality_state: 'needs_review',
        }}
      />
    )

    expect(screen.getByText('statusReview')).toBeInTheDocument()
    expect(screen.getByText(/^periodRange:/)).toBeInTheDocument()
    expect(screen.getByText('coverage:81')).toBeInTheDocument()
    expect(screen.queryByText('silverfin')).not.toBeInTheDocument()
    expect(screen.queryByText(/syncedAt/)).not.toBeInTheDocument()
  })

  it('leaves the review chip to the year card when the card explains it', () => {
    const { container } = render(
      <AccountingYearEvidence
        attentionExplained
        formatCurrency={(amount) => `€${amount}`}
        importQuality={quality}
        yearData={{
          year: '2024',
          revenue: 19_180,
          ebitda: 18_792,
          source_provider: 'silverfin',
          source_kind: 'accounting_integration',
          quality_state: 'blocked',
          eligibility_reason: 'incomplete_operating_pair',
        }}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('shows an advisor edit of imported figures as imported → used', () => {
    render(
      <AccountingYearEvidence
        formatCurrency={(amount) => `€${amount}`}
        importQuality={quality}
        yearData={{
          year: '2024',
          revenue: 20_000,
          ebitda: 18_792,
          source_provider: 'silverfin',
          source_kind: 'accounting_integration',
        }}
      />
    )

    expect(screen.getByText('statusEdited')).toBeInTheDocument()
    expect(screen.getByText('revenueShort €19180')).toBeInTheDocument()
    expect(screen.getByText('revenueShort €20000')).toBeInTheDocument()
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
