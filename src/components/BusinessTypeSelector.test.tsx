import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BusinessTypeSelector } from './BusinessTypeSelector'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))

vi.mock('@upswitch/business-type-selector', () => ({
  BusinessTypeMultiSelect: ({ onChange }: { onChange: (ids: string[]) => void }) => (
    <button type="button" data-testid="emit-selection" onClick={() => onChange(['bt-a', 'bt-b'])}>
      emit
    </button>
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
})
