import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SaasMetricsSection } from './SaasMetricsSection'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (key === 'saasImported.title') return 'Imported SaaS snapshot'
    if (key === 'saasImported.description') {
      return `Imported from ${values?.provider} for fiscal year ${values?.year} with ${values?.confidence}% confidence.`
    }
    return values
      ? `${key}:${Object.entries(values)
          .map(([entryKey, value]) => `${entryKey}=${value}`)
          .join(',')}`
      : key
  },
  /** Used by `useManualPreviewFormatters` inside SaasMetricsSection */
  useLocale: () => 'en',
}))

vi.mock('../CurrencyInput', () => ({
  CurrencyInput: ({ label }: { label: string }) => <div>{label}</div>,
}))

vi.mock('./AdaptivePercentInput', () => ({
  AdaptivePercentInput: ({ label }: { label: string }) => <div>{label}</div>,
}))

describe('SaasMetricsSection', () => {
  it('shows imported SaaS provenance when provider-backed metrics were hydrated', () => {
    render(
      <SaasMetricsSection
        onFieldChange={vi.fn()}
        importedSaasProvenance={{
          source: 'exact',
          confidence: 0.82,
          fiscal_year: 2024,
        }}
      />
    )

    expect(screen.getByText('Imported SaaS snapshot')).toBeInTheDocument()
    expect(
      screen.getByText('Imported from Exact for fiscal year 2024 with 82% confidence.')
    ).toBeInTheDocument()
  })

  it('keeps advanced inputs collapsed by default', () => {
    render(<SaasMetricsSection onFieldChange={vi.fn()} />)

    expect(screen.getByText('saasPanels.advancedLockedDescription')).toBeInTheDocument()
    expect(screen.getByText('saasPanels.showAdvancedButton')).toBeInTheDocument()
    expect(screen.queryByText('fields.saasCac')).not.toBeInTheDocument()
  })

  it('does not mark the section ready when only ARR and advanced metrics are filled', () => {
    render(
      <SaasMetricsSection
        onFieldChange={vi.fn()}
        saasArr={500000}
        saasCac={1500}
        saasSmSpend={120000}
      />
    )

    expect(screen.queryByText('saasProgress.ready')).not.toBeInTheDocument()
    expect(screen.getByText('saasProgress.filled:count=3,total=11')).toBeInTheDocument()
  })

  it('reveals advanced inputs automatically once the core SaaS inputs are ready', () => {
    render(
      <SaasMetricsSection
        onFieldChange={vi.fn()}
        saasArr={500000}
        saasArrGrowthPct={25}
        saasNrrPct={110}
      />
    )

    expect(screen.getByText('saasProgress.ready')).toBeInTheDocument()
    expect(screen.getByText('fields.saasCac')).toBeInTheDocument()
    expect(screen.getByText('fields.saasSmSpend')).toBeInTheDocument()
  })

  it('lets users open advanced inputs early when they already know them', () => {
    render(<SaasMetricsSection onFieldChange={vi.fn()} />)

    fireEvent.click(screen.getByText('saasPanels.showAdvancedButton'))

    expect(screen.getByText('fields.saasCac')).toBeInTheDocument()
    expect(screen.getByText('fields.saasCustomerConcentrationPct')).toBeInTheDocument()
  })

  describe('benchmark prefill', () => {
    /** NACE division 62 = "computer programming" → maps to the 'saas'
     *  startup sector in `inferStartupSectorFromNace`.  We pin the
     *  sector here so the prefill effect has a benchmark to work
     *  with — without it the effect bails and no prefill fires. */
    const SAAS_NACE = '62.01'

    it('seeds gross margin, churn, NRR, customer churn, expansion revenue, and growth from the sector benchmark on mount', () => {
      const onFieldChange = vi.fn()
      render(<SaasMetricsSection onFieldChange={onFieldChange} naceCode={SAAS_NACE} />)

      const calls = Object.fromEntries(onFieldChange.mock.calls)
      expect(calls.saas_gross_margin_pct).toBe(78)
      expect(calls.saas_churn_pct).toBe(3)
      expect(calls.saas_nrr_pct).toBe(110)
      expect(calls.saas_customer_churn_pct).toBe(5)
      expect(calls.saas_expansion_revenue_pct).toBe(13)
      expect(calls.saas_arr_growth_pct).toBe(60)
    })

    it('does not overwrite values the founder has already filled', () => {
      const onFieldChange = vi.fn()
      render(
        <SaasMetricsSection
          onFieldChange={onFieldChange}
          naceCode={SAAS_NACE}
          saasGrossMarginPct={82}
          saasNrrPct={120}
          saasCustomerChurnPct={4}
          saasExpansionRevenuePct={20}
        />
      )

      const touchedKeys = onFieldChange.mock.calls.map(([key]) => key)
      expect(touchedKeys).not.toContain('saas_gross_margin_pct')
      expect(touchedKeys).not.toContain('saas_nrr_pct')
      expect(touchedKeys).not.toContain('saas_customer_churn_pct')
      expect(touchedKeys).not.toContain('saas_expansion_revenue_pct')
      // benchmark fields still empty are still seeded
      expect(touchedKeys).toContain('saas_churn_pct')
      expect(touchedKeys).toContain('saas_arr_growth_pct')
    })

    it('skips the benchmark prefill entirely when SaaS metrics were imported from an accounting provider', () => {
      const onFieldChange = vi.fn()
      render(
        <SaasMetricsSection
          onFieldChange={onFieldChange}
          naceCode={SAAS_NACE}
          importedSaasProvenance={{ source: 'exact', confidence: 0.82, fiscal_year: 2024 }}
        />
      )

      // The provenance banner is the founder's signal; benchmark prefill
      // would silently overwrite imported values, so the effect bails.
      expect(onFieldChange).not.toHaveBeenCalled()
    })

    it('derives MRR from ARR via the universal SaaS identity (ARR / 12) at mount when ARR is already present', () => {
      const onFieldChange = vi.fn()
      render(<SaasMetricsSection onFieldChange={onFieldChange} saasArr={1200000} naceCode={null} />)

      const mrrCall = onFieldChange.mock.calls.find(([key]) => key === 'saas_mrr')
      expect(mrrCall?.[1]).toBe(100000)
    })

    it('does not derive MRR when the founder has already entered one', () => {
      const onFieldChange = vi.fn()
      render(
        <SaasMetricsSection
          onFieldChange={onFieldChange}
          saasArr={1200000}
          saasMrr={42000}
          naceCode={null}
        />
      )

      const mrrCalls = onFieldChange.mock.calls.filter(([key]) => key === 'saas_mrr')
      expect(mrrCalls).toHaveLength(0)
    })

    it('does not derive MRR when SaaS metrics were imported from a provider', () => {
      const onFieldChange = vi.fn()
      render(
        <SaasMetricsSection
          onFieldChange={onFieldChange}
          saasArr={1200000}
          importedSaasProvenance={{ source: 'exact', confidence: 0.82, fiscal_year: 2024 }}
        />
      )

      expect(onFieldChange).not.toHaveBeenCalled()
    })

    it('does not render the legacy amber benchmark banner', () => {
      render(<SaasMetricsSection onFieldChange={vi.fn()} naceCode={SAAS_NACE} />)

      // Sanity check: the banner i18n keys should never resolve in the
      // rendered output now that the per-field chips carry the signal.
      expect(screen.queryByText(/saasBenchmark\./)).not.toBeInTheDocument()
    })
  })
})
