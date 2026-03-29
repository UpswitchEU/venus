import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SaasMetricsSection } from './SaasMetricsSection'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (key === 'saasImported.title') return 'Imported SaaS snapshot'
    if (key === 'saasImported.description') {
      return `Imported from ${values?.provider} for fiscal year ${values?.year} with ${values?.confidence}% confidence.`
    }
    return key
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
})
