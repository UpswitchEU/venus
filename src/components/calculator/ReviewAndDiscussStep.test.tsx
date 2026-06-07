import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ReviewAndDiscussStep } from './ReviewAndDiscussStep'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    const translations: Record<string, string> = {
      title: 'Review & discuss',
      subtitle: 'Confirm what we are defending.',
      acknowledge: 'I have reviewed this',
      notesLabel: 'Rationale',
      notesPlaceholder: 'Explain the rationale',
      back: 'Back',
      askAi: 'Ask AI',
      skip: 'Skip - I accept all',
      skipAcknowledgement: 'I have reviewed and accept all items',
      confirm: 'Confirm',
      'items.qualityWarning': `${values?.count ?? 0} warnings`,
      'items.multipleSanity': 'Multiple sanity check',
    }
    return translations[key] ?? key
  },
}))

describe('ReviewAndDiscussStep', () => {
  it('renders agenda refs and gates confirmation on high-severity acknowledgements', () => {
    const onConfirm = vi.fn()

    render(
      <ReviewAndDiscussStep
        agenda={{
          items: [
            {
              kind: 'quality_warning',
              count: 4,
              severity: 'high',
              refs: ['owner_dependency', 'thin_comparables', 'net_debt_unavailable'],
            },
            {
              kind: 'multiple_sanity',
              count: 1,
              severity: 'info',
              refs: ['applied 5.20x', 'benchmark 4.80x', 'delta +0.40x'],
            },
          ],
          acknowledgementKeys: ['quality_warning'],
          requiresReview: true,
        }}
        acknowledgedKeys={[]}
        notes=""
        onAskAi={vi.fn()}
        onConfirm={onConfirm}
        onNotesChange={vi.fn()}
        onSkip={vi.fn()}
        onToggleAcknowledge={vi.fn()}
      />
    )

    expect(screen.getByText('owner_dependency')).toBeTruthy()
    expect(screen.getByText('applied 5.20x')).toBeTruthy()

    const confirm = screen.getByRole('button', { name: 'Confirm' })
    expect(confirm).toBeDisabled()
    fireEvent.click(confirm)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('requires an explicit accept-all gate before skipping', () => {
    const onSkip = vi.fn()

    render(
      <ReviewAndDiscussStep
        agenda={{
          items: [
            {
              kind: 'quality_warning',
              count: 1,
              severity: 'high',
              refs: ['owner_dependency'],
            },
          ],
          acknowledgementKeys: ['quality_warning'],
          requiresReview: true,
        }}
        acknowledgedKeys={[]}
        notes=""
        onConfirm={vi.fn()}
        onNotesChange={vi.fn()}
        onSkip={onSkip}
        onToggleAcknowledge={vi.fn()}
      />
    )

    const skip = screen.getByRole('button', { name: 'Skip - I accept all' })
    expect(skip).toBeDisabled()
    fireEvent.click(skip)
    expect(onSkip).not.toHaveBeenCalled()

    fireEvent.click(screen.getByLabelText('I have reviewed and accept all items'))

    expect(skip).toBeEnabled()
    fireEvent.click(skip)
    expect(onSkip).toHaveBeenCalledTimes(1)
  })
})
