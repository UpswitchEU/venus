import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ValuationVersion } from '../types/ValuationVersion'
import { VersionTimeline } from './VersionTimeline'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, number>) => {
    const translations: Record<string, string> = {
      invalidDate: 'Invalid date',
      loading: 'Loading',
      noVersions: 'No versions',
      rangeTo: 'to',
      strategicBuffer: 'Strategic buffer',
      suggestedListingPrice: 'Suggested listing price',
      valuationCardHeroLabel: 'Valuation',
      valuationRangeLabel: 'Range',
      versionsAppearAfterRegen: 'Versions appear after regeneration',
    }

    if (key === 'loadMore') return `Load more ${values?.displayed ?? 0}/${values?.total ?? 0}`
    if (key === 'premiumLabel') return `+${values?.percent ?? 0}%`

    return translations[key] ?? key
  },
}))

function version(overrides: Partial<ValuationVersion>): ValuationVersion {
  return {
    id: 'version-1',
    versionLabel: 'Version 1',
    versionNumber: 1,
    createdAt: new Date('2026-06-02T08:00:00.000Z'),
    createdBy: null,
    formData: { country_code: 'BE' },
    isActive: false,
    tags: [],
    valuationResult: null,
    ...overrides,
  } as ValuationVersion
}

describe('VersionTimeline', () => {
  it('marks the active version item', () => {
    render(
      <VersionTimeline
        activeVersion={2}
        onVersionSelect={vi.fn()}
        versions={[
          version({ id: 'version-2', versionLabel: 'Version 2', versionNumber: 2 }),
          version({ id: 'version-1', versionLabel: 'Version 1', versionNumber: 1 }),
        ]}
      />
    )

    expect(screen.getByText('Version 2').closest('[aria-current="step"]')).toBeInTheDocument()
    expect(screen.getByText('Version 1').closest('[aria-current="step"]')).not.toBeInTheDocument()
  })

  it('renders an observed zero valuation without replacing it with a positive snapshot', () => {
    render(
      <VersionTimeline
        activeVersion={2}
        onVersionSelect={vi.fn()}
        versions={[
          version({
            id: 'version-2',
            versionLabel: 'Version 2',
            versionNumber: 2,
            valuationResult: {
              currency: 'EUR',
              equity_value_high: 0,
              equity_value_low: 0,
              equity_value_mid: 0,
              recommended_asking_price: 0,
              valuation_summary: { final_valuation: 0 },
            },
          }),
          version({
            id: 'version-1',
            versionLabel: 'Version 1',
            versionNumber: 1,
            valuationResult: {
              currency: 'EUR',
              equity_value_high: 480_000,
              equity_value_low: 320_000,
              equity_value_mid: 400_000,
              recommended_asking_price: 420_000,
              valuation_summary: { final_valuation: 400_000 },
            },
          }),
        ]}
      />
    )

    expect(screen.getByText('Version 2')).toBeInTheDocument()
    expect(screen.getByText('Version 1')).toBeInTheDocument()
    expect(screen.getAllByText(/€\s*400,000/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('€0.00').length).toBeGreaterThan(0)
  })
})
