import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TaxLatencyItem } from '../../store/useTaxLatencyStore'
import { TaxLatencyConflictBanner } from './TaxLatencyConflictBanner'
import { TaxLatencyItemsList } from './TaxLatencyItemsList'

const translate = (key: string, values?: Record<string, string | number | Date>) => {
  if (key === 'navConflictBodyPrefix') return `prefix ${values?.rate} `
  if (key === 'navConflictBodySuffix') return ' suffix'
  return key
}

const passiveItem: TaxLatencyItem = {
  id: 'item-1',
  type: 'passive',
  accountCode: '222000',
  accountName: 'Gebouwen',
  description: 'Latentie',
  temporaryDifference: 100_000,
  taxRate: 25,
}

describe('TaxLatency presentation components', () => {
  it('renders empty and populated item-list states', () => {
    const onEdit = vi.fn()
    const onRemove = vi.fn()
    const baseProps = {
      currencyLocale: 'nl-BE',
      netImpact: 0,
      onEdit,
      onRemove,
      t: translate,
    }

    const { rerender } = render(<TaxLatencyItemsList {...baseProps} items={[]} />)

    expect(screen.getByText('noItems')).toBeInTheDocument()
    expect(screen.getByText('noItemsDesc')).toBeInTheDocument()

    rerender(<TaxLatencyItemsList {...baseProps} items={[passiveItem]} netImpact={-25_000} />)

    expect(screen.getByText('222000 · Gebouwen')).toBeInTheDocument()
    expect(screen.getByText('Latentie')).toBeInTheDocument()
    expect(screen.getByText('netImpact')).toBeInTheDocument()
  })

  it('renders NAV conflict details only when conflicts exist', () => {
    const { rerender } = render(
      <TaxLatencyConflictBanner conflictingLatencyItems={[]} navTaxLatencyPct={25} t={translate} />
    )

    expect(screen.queryByText('navConflictTitle')).not.toBeInTheDocument()

    rerender(
      <TaxLatencyConflictBanner
        conflictingLatencyItems={[passiveItem]}
        navTaxLatencyPct={25}
        t={translate}
      />
    )

    expect(screen.getByText('navConflictTitle')).toBeInTheDocument()
    expect(screen.getByText(/prefix 25/)).toBeInTheDocument()
    expect(screen.getByText('222000')).toBeInTheDocument()
  })
})
