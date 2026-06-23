import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type NormalisationSuggestion,
  NormalisationSuggestionModal,
} from './NormalisationSuggestionModal'

vi.mock('next-intl', () => ({
  useLocale: () => 'nl',
  useTranslations: () => (key: string) => key,
}))

const baseSuggestion: NormalisationSuggestion = {
  id: 'normalisation-1',
  field: 'owner_salary',
  label: 'Owner salary',
  category: 'salary',
  currentValue: 120000,
  suggestedValue: 90000,
  adjustment: -30000,
  reason: 'Market compensation adjustment',
  confidence: 'high',
}

afterEach(() => {
  vi.useRealTimers()
})

describe('NormalisationSuggestionModal', () => {
  it('cancels a pending accept when the modal unmounts', () => {
    vi.useFakeTimers()
    const onAccept = vi.fn()

    const { unmount } = render(
      <NormalisationSuggestionModal
        open
        onOpenChange={vi.fn()}
        suggestion={baseSuggestion}
        onAccept={onAccept}
        onReject={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'apply' }))
    unmount()

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(onAccept).not.toHaveBeenCalled()
  })

  it('drops a pending accept when a newer suggestion replaces it', () => {
    vi.useFakeTimers()
    const onAccept = vi.fn()
    const newerSuggestion = {
      ...baseSuggestion,
      id: 'normalisation-2',
      label: 'Rent normalization',
      category: 'rent' as const,
    }

    const { rerender } = render(
      <NormalisationSuggestionModal
        open
        onOpenChange={vi.fn()}
        suggestion={baseSuggestion}
        onAccept={onAccept}
        onReject={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'apply' }))

    rerender(
      <NormalisationSuggestionModal
        open
        onOpenChange={vi.fn()}
        suggestion={newerSuggestion}
        onAccept={onAccept}
        onReject={vi.fn()}
      />
    )

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(onAccept).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'apply' }))

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(onAccept).toHaveBeenCalledTimes(1)
    expect(onAccept).toHaveBeenCalledWith(newerSuggestion, undefined)
  })
})
