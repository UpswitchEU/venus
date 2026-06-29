import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NormalisationReviewStep } from './NormalisationReviewStep'
import type { SuggestedNormalisation } from './NormalisationReviewStep.types'

vi.mock('next-intl', () => ({
  useLocale: () => 'nl',
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values && 'count' in values ? `${key}:${values.count}` : key,
}))

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ codes: [] }),
      })
    )
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function renderReviewStep(onContinue = vi.fn(), suggestions: SuggestedNormalisation[] = []) {
  return {
    onContinue,
    ...render(
      <NormalisationReviewStep
        suggestions={suggestions}
        originalEbitda={250000}
        companyName="Acme"
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onAcceptAll={vi.fn()}
        onRejectAll={vi.fn()}
        onContinue={onContinue}
        onBack={vi.fn()}
      />
    ),
  }
}

describe('NormalisationReviewStep', () => {
  it('cancels a pending continue when the step unmounts', () => {
    vi.useFakeTimers()
    const { onContinue, unmount } = renderReviewStep()

    fireEvent.click(screen.getByRole('button', { name: /continueToEstimate/ }))
    unmount()

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(onContinue).not.toHaveBeenCalled()
  })

  it('ignores repeated continue clicks while one continue is pending', () => {
    vi.useFakeTimers()
    const { onContinue } = renderReviewStep()
    const continueButton = screen.getByRole('button', { name: /continueToEstimate/ })

    fireEvent.click(continueButton)
    fireEvent.click(continueButton)

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('allows continuing with pending suggestions left unapplied', () => {
    vi.useFakeTimers()
    const { onContinue } = renderReviewStep(vi.fn(), [
      {
        id: 'pending-imported-addback',
        code: '610000',
        description: 'Services et biens divers',
        category: 'other',
        amount: 221_500,
        reason: 'Benchmark excess',
        status: 'pending',
        source: 'auto',
      },
    ])
    const continueButton = screen.getByRole('button', { name: /continueToEstimate/ })

    expect(continueButton).not.toBeDisabled()
    fireEvent.click(continueButton)

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(onContinue).toHaveBeenCalledTimes(1)
  })
})
