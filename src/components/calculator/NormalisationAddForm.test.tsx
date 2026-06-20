import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { NormalisationAddForm } from './NormalisationAddForm'

const translate = (key: string, values?: Record<string, string | number>) =>
  values ? `${key}:${Object.values(values).join(',')}` : key

function setup(extra: Partial<ComponentProps<typeof NormalisationAddForm>> = {}) {
  const props: ComponentProps<typeof NormalisationAddForm> = {
    showAddForm: false,
    selectedLedger: null,
    searchQuery: '',
    showLedgerDropdown: false,
    filteredLedgers: [],
    newType: 'add',
    newAmount: '',
    newApplyAllYears: false,
    newReason: '',
    formatCurrency: (amount) => `€${amount}`,
    nh: translate,
    onShowAddFormChange: vi.fn(),
    onSelectedLedgerChange: vi.fn(),
    onSearchQueryChange: vi.fn(),
    onShowLedgerDropdownChange: vi.fn(),
    onNewTypeChange: vi.fn(),
    onNewAmountChange: vi.fn(),
    onNewApplyAllYearsChange: vi.fn(),
    onNewReasonChange: vi.fn(),
    onAddFromPreset: vi.fn(),
    onAddFromLedger: vi.fn(),
    ...extra,
  }

  render(<NormalisationAddForm {...props} />)
  return props
}

describe('NormalisationAddForm', () => {
  it('opens the add form through the collapsed action', () => {
    const props = setup()

    fireEvent.click(screen.getByText('addNormalization'))
    expect(props.onShowAddFormChange).toHaveBeenCalledWith(true)
  })

  it('routes quick presets through the preset callback', () => {
    const props = setup({ showAddForm: true })

    fireEvent.click(screen.getByText('presets.ownerSalary'))
    expect(props.onAddFromPreset).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'owner-salary' })
    )
  })

  it('selects custom ledger input without requiring a matched account', () => {
    const props = setup({
      showAddForm: true,
      searchQuery: '760 diverse opbrengsten',
      showLedgerDropdown: true,
      filteredLedgers: [],
    })

    fireEvent.click(screen.getByText('useCustomCode:760 diverse opbrengsten'))
    expect(props.onSelectedLedgerChange).toHaveBeenCalledWith({
      code: '760',
      name: '760 diverse opbrengsten',
    })
    expect(props.onSearchQueryChange).toHaveBeenCalledWith('760 · 760 diverse opbrengsten')
    expect(props.onShowLedgerDropdownChange).toHaveBeenCalledWith(false)
  })

  it('routes selected-ledger amount changes and add action', () => {
    const props = setup({
      showAddForm: true,
      selectedLedger: { code: '620', name: 'Bezoldigingen directie' },
      searchQuery: '620 · Bezoldigingen directie',
      newAmount: '60000',
    })

    fireEvent.change(screen.getByPlaceholderText('amountPlaceholder'), {
      target: { value: '75000' },
    })
    expect(props.onNewAmountChange).toHaveBeenCalledWith('75000')

    fireEvent.click(screen.getByText('actions.add'))
    expect(props.onAddFromLedger).toHaveBeenCalled()
  })
})
