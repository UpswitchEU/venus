import { fireEvent, render, screen, within } from '@testing-library/react'
import {
  BusinessTypeMultiSelect,
  type BusinessTypeMultipleSelection,
} from '@upswitch/business-type-selector'
import { describe, expect, it, vi } from 'vitest'

const copy = {
  searchPlaceholder: 'Zoek bedrijfstypes...',
  selectPlaceholder: 'Selecteer bedrijfstype',
  allCategories: 'Alle categorieen',
  loading: 'Bedrijfstypes laden...',
  empty: 'Geen bedrijfstypes gevonden',
  popular: 'Populair',
  required: '* Verplicht',
  offline: 'Offline gegevens',
  selectedLabel: 'Geselecteerde bedrijfstypes',
  clearSelection: 'Verwijderen',
  multipleUnavailable: 'Multiple niet beschikbaar',
  lowSampleSuppressed: 'Multiple verborgen: lage steekproef',
}

const accountingOption = {
  id: 'accounting',
  title: 'Boekhoudkantoor',
  icon: '📊',
  categoryLabel: 'Professional Services',
  primaryMultiple: { label: 'EV/EBITDA', basis: 'EBITDA', median: 5.4, p25: 4.7, p75: 6.2 },
  multiples: [
    { metric: 'ev_ebitda' as const, label: 'EV/EBITDA', median: 5.4, p25: 4.7, p75: 6.2 },
    { metric: 'ev_revenue' as const, label: 'EV/Revenue', median: 1.2, p25: 0.9, p75: 1.6 },
    { metric: 'pe' as const, label: 'P/E', median: 12, p25: 10, p75: 15 },
  ],
}

describe('BusinessTypeMultiSelect dropdown portal', () => {
  it('renders the open dropdown into document.body with fixed positioning above the stacking context', () => {
    render(
      <BusinessTypeMultiSelect
        value={[]}
        label="Bedrijfstype"
        options={[accountingOption]}
        onChange={vi.fn()}
        copy={copy}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Bedrijfstype' }))

    // The listbox is portaled to <body>, not nested in the component subtree, so
    // no ancestor overflow:hidden / stacking context can clip it.
    const listbox = document.getElementById(
      screen.getByPlaceholderText('Zoek bedrijfstypes...').getAttribute('aria-controls') ?? ''
    )
    expect(listbox).not.toBeNull()
    expect(listbox?.parentElement).toBe(document.body)
    expect(listbox?.style.position).toBe('fixed')
    expect(Number(listbox?.style.zIndex)).toBeGreaterThanOrEqual(9999)
  })
})

describe('BusinessTypeMultiSelect per-chip multiples editor', () => {
  function renderEditor(selection: BusinessTypeMultipleSelection) {
    const onMultipleSelectionChange = vi.fn()
    render(
      <BusinessTypeMultiSelect
        value={['accounting']}
        options={[accountingOption]}
        onChange={vi.fn()}
        copy={copy}
        editableMultiples
        multipleSelections={{ accounting: selection }}
        onMultipleSelectionChange={onMultipleSelectionChange}
      />
    )
    return { onMultipleSelectionChange }
  }

  it('expands a chip to show all three multiples with the applied one badged', () => {
    renderEditor({ appliedMetric: 'ev_ebitda', overrides: {} })
    fireEvent.click(screen.getByRole('button', { name: 'Edit multiples: Boekhoudkantoor' }))

    // EV/EBITDA appears both in the chip header summary and the editor row.
    expect(screen.getAllByText('EV/EBITDA').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('EV/Revenue')).toBeInTheDocument()
    expect(screen.getByText('P/E')).toBeInTheDocument()
    // Benchmark band is shown as reference.
    expect(screen.getByText(/4\.7–6\.2x/)).toBeInTheDocument()
    // The applied metric carries the "Applied" badge.
    expect(screen.getByText('Applied')).toBeInTheDocument()
  })

  it('emits an override for the edited metric, keyed for the calc', () => {
    const { onMultipleSelectionChange } = renderEditor({
      appliedMetric: 'ev_ebitda',
      overrides: {},
    })
    fireEvent.click(screen.getByRole('button', { name: 'Edit multiples: Boekhoudkantoor' }))

    fireEvent.change(screen.getByLabelText('EV/EBITDA Boekhoudkantoor'), {
      target: { value: '6.5' },
    })

    expect(onMultipleSelectionChange).toHaveBeenCalledWith('accounting', {
      appliedMetric: 'ev_ebitda',
      overrides: { ev_ebitda: 6.5 },
    })
  })

  it('switches the applied metric when another band is chosen', () => {
    const { onMultipleSelectionChange } = renderEditor({
      appliedMetric: 'ev_ebitda',
      overrides: {},
    })
    fireEvent.click(screen.getByRole('button', { name: 'Edit multiples: Boekhoudkantoor' }))

    // The P/E row is not applied, so it carries a "Use" action.
    const peRow = screen.getByText('P/E').closest('.rounded-lg') as HTMLElement
    fireEvent.click(within(peRow).getByRole('button', { name: 'Use' }))

    expect(onMultipleSelectionChange).toHaveBeenCalledWith('accounting', {
      appliedMetric: 'pe',
      overrides: {},
    })
  })
})
