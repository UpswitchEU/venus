import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BusinessTypeSelector } from './BusinessTypeSelector'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))

vi.mock('@upswitch/business-type-selector', () => ({
  BusinessTypeMultiSelect: ({
    onChange,
    options,
    value,
  }: {
    onChange: (ids: string[]) => void
    options: Array<{
      id: string
      title: string
      primaryMultiple?: { label?: string; median?: number } | null
    }>
    value?: string | string[] | null
  }) => (
    <div>
      <div data-testid="selected-value">{Array.isArray(value) ? value.join(',') : value}</div>
      {options.map((option) => (
        <div key={option.id} data-testid={`option-${option.id}`}>
          {option.title}
          {option.primaryMultiple?.median
            ? ` ${option.primaryMultiple.label} ${option.primaryMultiple.median.toFixed(1)}x`
            : null}
        </div>
      ))}
      <button type="button" data-testid="emit-selection" onClick={() => onChange(['bt-a', 'bt-b'])}>
        emit
      </button>
      <button
        type="button"
        data-testid="emit-fallback-selection"
        onClick={() => onChange(['kbo-accounting'])}
      >
        emit fallback
      </button>
    </div>
  ),
}))

const businessTypes = [
  { id: 'bt-a', title: 'Alpha services' },
  { id: 'bt-b', title: 'Beta retail' },
]

vi.mock('../hooks/useBusinessTypes', () => ({
  useBusinessTypes: () => ({
    businessTypes,
    loading: false,
    error: null,
  }),
}))

vi.mock('../hooks/useBusinessTypeFull', () => ({
  useBusinessTypeFull: () => ({
    businessType: null,
    loading: false,
  }),
}))

describe('BusinessTypeSelector selection modes', () => {
  it('uses a caller-provided label', () => {
    render(
      <BusinessTypeSelector
        label="Bedrijfstype"
        value={[]}
        selectionMode="multiple"
        onChange={vi.fn()}
      />
    )

    expect(screen.getByText(/Bedrijfstype/)).toBeInTheDocument()
  })

  it('keeps only the newest selected business type in single-selection mode', () => {
    const onChange = vi.fn()
    const onSelectionChange = vi.fn()

    render(
      <BusinessTypeSelector
        value={['bt-a']}
        selectionMode="single"
        onChange={onChange}
        onSelectionChange={onSelectionChange}
      />
    )

    fireEvent.click(screen.getByTestId('emit-selection'))

    expect(onChange).toHaveBeenCalledWith('bt-b')
    expect(onSelectionChange).toHaveBeenCalledWith(
      ['bt-b'],
      [expect.objectContaining({ id: 'bt-b' })]
    )
  })

  it('preserves the full business-type list in multiple-selection mode', () => {
    const onChange = vi.fn()
    const onSelectionChange = vi.fn()

    render(
      <BusinessTypeSelector
        value={['bt-a']}
        selectionMode="multiple"
        onChange={onChange}
        onSelectionChange={onSelectionChange}
      />
    )

    fireEvent.click(screen.getByTestId('emit-selection'))

    expect(onChange).toHaveBeenCalledWith(['bt-a', 'bt-b'])
    expect(onSelectionChange).toHaveBeenCalledWith(
      ['bt-a', 'bt-b'],
      [expect.objectContaining({ id: 'bt-a' }), expect.objectContaining({ id: 'bt-b' })]
    )
  })

  it('renders KBO fallback options with multiples when the catalog does not contain the selected id', () => {
    const onChange = vi.fn()
    const onSelectionChange = vi.fn()

    render(
      <BusinessTypeSelector
        value={['kbo-accounting']}
        selectionMode="multiple"
        onChange={onChange}
        onSelectionChange={onSelectionChange}
        fallbackOptions={[
          {
            id: 'kbo-accounting',
            title: 'Boekhoudkantoor',
            categoryLabel: 'KBO/NACE',
            primaryMultiple: {
              label: 'EV/EBITDA',
              basis: 'EBITDA',
              median: 5.4,
            },
          },
        ]}
      />
    )

    expect(screen.getByTestId('selected-value')).toHaveTextContent('kbo-accounting')
    expect(screen.getByTestId('option-kbo-accounting')).toHaveTextContent('Boekhoudkantoor')
    expect(screen.getByTestId('option-kbo-accounting')).toHaveTextContent('EV/EBITDA 5.4x')

    fireEvent.click(screen.getByTestId('emit-fallback-selection'))

    expect(onChange).toHaveBeenCalledWith('kbo-accounting')
    expect(onSelectionChange).toHaveBeenCalledWith(
      ['kbo-accounting'],
      [
        expect.objectContaining({
          id: 'kbo-accounting',
          title: 'Boekhoudkantoor',
          primaryMultiple: expect.objectContaining({ median: 5.4 }),
        }),
      ]
    )
  })
})
