import { render, screen, within } from '@testing-library/react'
import { BusinessTypeMultiSelect } from '@upswitch/business-type-selector'
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

describe('BusinessTypeMultiSelect selected chips', () => {
  it('shows the selected business type multiple without opening the dropdown', () => {
    render(
      <BusinessTypeMultiSelect
        value={['accounting']}
        options={[
          {
            id: 'accounting',
            title: 'Boekhoudkantoor',
            icon: '📊',
            categoryLabel: 'Professional Services',
            primaryMultiple: {
              label: 'EV/EBITDA',
              basis: 'EBITDA',
              median: 5.4,
              p25: 4.7,
              p75: 6.2,
            },
          },
        ]}
        onChange={vi.fn()}
        copy={copy}
      />
    )

    const selected = screen.getByLabelText('Geselecteerde bedrijfstypes')
    expect(selected).toHaveTextContent('Boekhoudkantoor')
    expect(selected).toHaveTextContent('EV/EBITDA 5.4x (4.7-6.2x)')
  })

  it('keeps long selected business type labels readable in compact form contexts', () => {
    render(
      <BusinessTypeMultiSelect
        value={['fintech-lending-credit']}
        options={[
          {
            id: 'fintech-lending-credit',
            title: 'Fintech — Lending & Credit',
            icon: '💸',
            categoryLabel: 'Financial Services',
            primaryMultiple: {
              label: 'EV/EBITDA',
              basis: 'EBITDA',
              median: 6,
              p25: 4.5,
              p75: 7.8,
            },
          },
        ]}
        onChange={vi.fn()}
        copy={copy}
      />
    )

    const selected = screen.getByLabelText('Geselecteerde bedrijfstypes')
    const title = within(selected).getByText('Fintech — Lending & Credit')
    const multiple = within(selected).getByText('EV/EBITDA 6.0x (4.5-7.8x)')
    const category = within(selected).getByText('Financial Services')

    expect(selected.classList.contains('grid')).toBe(true)
    expect(title.classList.contains('truncate')).toBe(false)
    expect(title.classList.contains('whitespace-normal')).toBe(true)
    expect(title.classList.contains('break-words')).toBe(true)
    expect(multiple.classList.contains('text-xs')).toBe(true)
    expect(multiple.classList.contains('whitespace-normal')).toBe(true)
    expect(multiple.classList.contains('break-words')).toBe(true)
    expect(category.classList.contains('uppercase')).toBe(false)
    expect(category.classList.contains('whitespace-normal')).toBe(true)
    expect(category.classList.contains('break-words')).toBe(true)
    expect(
      screen.getByRole('button', {
        name: 'Verwijderen: Fintech — Lending & Credit',
      })
    ).toHaveClass('h-7')
  })

  it('renders the label + a leading icon INSIDE the trigger so it matches sibling entity fields', () => {
    render(
      <BusinessTypeMultiSelect
        value={[]}
        label="Bedrijfstype"
        options={[
          {
            id: 'accounting',
            title: 'Boekhoudkantoor',
            icon: '📊',
            categoryLabel: 'Professional Services',
          },
        ]}
        onChange={vi.fn()}
        copy={copy}
      />
    )

    const trigger = screen.getByRole('button', { name: 'Bedrijfstype' })
    // Label lives INSIDE the trigger (entity-search style), with placeholder below it.
    expect(trigger).toHaveTextContent('Bedrijfstype')
    expect(trigger).toHaveTextContent('Selecteer bedrijfstype')
    // A leading icon (building glyph) renders inside the trigger.
    expect(trigger.querySelector('svg')).toBeInTheDocument()
    // Box matches the form (rounded + dark) but stays flex (no `relative` on the
    // button) so the legacy entity-search shell guard keeps passing.
    expect(trigger.classList.contains('rounded-xl')).toBe(true)
    expect(trigger.classList.contains('relative')).toBe(false)
  })
})
