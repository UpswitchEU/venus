import { render, screen } from '@testing-library/react'
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
})
