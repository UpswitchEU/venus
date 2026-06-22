import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { RegistryEstimateInline } from './RegistryEstimateInline'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      animate,
      initial,
      transition,
      children,
      ...props
    }: {
      animate?: unknown
      initial?: unknown
      transition?: unknown
      children?: ReactNode
    }) => <div {...props}>{children}</div>,
  },
}))

vi.mock('@/design-system/components/Button', () => ({
  AuroraButton: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}))

const fetchProvisionalBand = vi.fn()
vi.mock('@/services/api/provisionalValuation', () => ({
  fetchProvisionalBand: (...args: unknown[]) => fetchProvisionalBand(...args),
}))

const company = { countryCode: 'BE', kboNumber: '0631.747.439' }

describe('RegistryEstimateInline (BET-318 Door 3)', () => {
  it('renders nothing without a registry number', () => {
    const { container } = render(
      <RegistryEstimateInline company={{ name: 'No registry' }} fallbackCountry={null} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('fetches and shows a provisional band', async () => {
    fetchProvisionalBand.mockResolvedValueOnce({
      available: true,
      band: { low: 1_000_000, high: 1_800_000, currency: 'EUR' },
      confidence: 'low',
      method: 'registry',
      computedAt: '2026-06-01T00:00:00Z',
      ageDays: 21,
      source: 'enriched_companies',
    })
    render(<RegistryEstimateInline company={company} fallbackCountry={null} />)
    fireEvent.click(screen.getByText('cta'))
    expect(fetchProvisionalBand).toHaveBeenCalledWith('BE', '0631.747.439')
    expect(await screen.findByText('bandTitle')).toBeInTheDocument()
    expect(screen.getByText('bandCaveat')).toBeInTheDocument()
  })

  it('shows the precision-upsell when no public band is available', async () => {
    fetchProvisionalBand.mockResolvedValueOnce({
      available: false,
      band: null,
      confidence: null,
      method: null,
      computedAt: null,
      ageDays: null,
      source: null,
    })
    render(<RegistryEstimateInline company={company} fallbackCountry="BE" />)
    fireEvent.click(screen.getByText('cta'))
    expect(await screen.findByText('unavailableTitle')).toBeInTheDocument()
  })
})
