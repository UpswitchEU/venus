import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NormalisationReviewStep } from './NormalisationReviewStep'

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

function renderReviewStep(onContinue = vi.fn()) {
  return {
    onContinue,
    ...render(
      <NormalisationReviewStep
        suggestions={[]}
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
})
