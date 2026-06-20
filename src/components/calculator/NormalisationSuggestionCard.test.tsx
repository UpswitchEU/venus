import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { SuggestedNormalisation } from './NormalisationReviewStep.types'
import { NormalisationSuggestionCard } from './NormalisationSuggestionCard'

const suggestion: SuggestedNormalisation = {
  id: 'norm-1',
  code: '620',
  description: 'Director salary',
  category: 'salary',
  amount: 60_000,
  reason: 'Owner salary',
  status: 'pending',
  source: 'manual',
}

const translate = (key: string) => key

function setup(extra: Partial<ComponentProps<typeof NormalisationSuggestionCard>> = {}) {
  const props: ComponentProps<typeof NormalisationSuggestionCard> = {
    suggestion,
    index: 0,
    isEditing: false,
    canEdit: true,
    editAmount: '60000',
    editType: 'add',
    editApplyAllYears: false,
    editReason: 'Owner salary',
    formatCurrency: (amount) => `€${amount}`,
    nh: translate,
    ca: translate,
    onAccept: vi.fn(),
    onReject: vi.fn(),
    onStartEditing: vi.fn(),
    onCancelEdit: vi.fn(),
    onSaveEdit: vi.fn(),
    onEditAmountChange: vi.fn(),
    onEditTypeChange: vi.fn(),
    onEditApplyAllYearsChange: vi.fn(),
    onEditReasonChange: vi.fn(),
    ...extra,
  }
  render(<NormalisationSuggestionCard {...props} />)
  return props
}

describe('NormalisationSuggestionCard', () => {
  it('routes pending suggestion actions through the parent callbacks', () => {
    const props = setup()

    fireEvent.click(screen.getByLabelText('actions.edit'))
    expect(props.onStartEditing).toHaveBeenCalledWith(suggestion)

    fireEvent.click(screen.getByLabelText('reject'))
    expect(props.onReject).toHaveBeenCalledWith('norm-1')

    fireEvent.click(screen.getByLabelText('accept'))
    expect(props.onAccept).toHaveBeenCalledWith('norm-1')
  })

  it('emits edit field changes and save/cancel actions in edit mode', () => {
    const props = setup({ isEditing: true })

    fireEvent.change(screen.getByPlaceholderText('amountPlaceholder'), {
      target: { value: '75000' },
    })
    expect(props.onEditAmountChange).toHaveBeenCalledWith('75000')

    fireEvent.click(screen.getByText('+%'))
    expect(props.onEditTypeChange).toHaveBeenCalledWith('add_percent')

    fireEvent.click(screen.getByText('actions.save'))
    expect(props.onSaveEdit).toHaveBeenCalled()

    fireEvent.click(screen.getByText('actions.cancel'))
    expect(props.onCancelEdit).toHaveBeenCalled()
  })

  it('keeps rejected suggestions restorable through the accept callback', () => {
    const props = setup({
      suggestion: { ...suggestion, status: 'rejected' },
    })

    fireEvent.click(screen.getByLabelText('actions.undo'))
    expect(props.onAccept).toHaveBeenCalledWith('norm-1')
  })
})
