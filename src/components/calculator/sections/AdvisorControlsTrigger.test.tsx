import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAdvisorControlsModalStore } from '../../../store/useAdvisorControlsModalStore'
import type { ManualValuationFormData } from '../../../types/valuation'
import { AdvisorControlsTrigger } from './AdvisorControlsTrigger'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

// The modal pulls in Radix DialogPrimitive + the section body, both of
// which are tested elsewhere. Stub it here so the trigger test stays
// focused on the open-dispatch + pill behaviour.
vi.mock('./AdvancedAdvisorControlsModal', () => ({
  AdvancedAdvisorControlsModal: ({ open }: { open: boolean }) => (
    <div data-testid="modal-stub" data-open={open ? 'true' : 'false'} />
  ),
}))

const baseFormData: ManualValuationFormData = {} as ManualValuationFormData
const baseProps = {
  sectorAverageMultiple: 5.5,
  advisorWeightingYears: [2023, 2024, 2025],
  formData: baseFormData,
  setFormData: vi.fn(),
  disabled: false,
}

describe('AdvisorControlsTrigger', () => {
  beforeEach(() => {
    useAdvisorControlsModalStore.setState({ open: false })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the trigger button with the localised label + hint', () => {
    render(<AdvisorControlsTrigger {...baseProps} />)
    const button = screen.getByTestId('advisor-controls-trigger')
    // Both the headline label and the secondary hint are present so the
    // user sees "what does this open?" without clicking.
    expect(button.textContent).toContain('openModalButton')
    expect(button.textContent).toContain('openModalButtonHint')
  })

  it('clicking the trigger dispatches setOpen(true) on the shared store', () => {
    render(<AdvisorControlsTrigger {...baseProps} />)
    expect(useAdvisorControlsModalStore.getState().open).toBe(false)

    fireEvent.click(screen.getByTestId('advisor-controls-trigger'))

    expect(useAdvisorControlsModalStore.getState().open).toBe(true)
    // The store state must reach the mounted modal — otherwise the kebab
    // entry point could not share the same modal instance.
    expect(screen.getByTestId('modal-stub')).toHaveAttribute('data-open', 'true')
  })

  it('omits the prefilled pill when no advisor defaults applied', () => {
    render(<AdvisorControlsTrigger {...baseProps} />)
    expect(screen.queryByTestId('advisor-controls-prefilled-pill')).not.toBeInTheDocument()
  })

  it('renders the prefilled pill when at least one field was seeded from settings', () => {
    render(
      <AdvisorControlsTrigger
        {...baseProps}
        advisorDefaultsAppliedFields={['multiple_calibration_adjustment']}
      />
    )
    expect(screen.getByTestId('advisor-controls-prefilled-pill')).toBeInTheDocument()
  })

  it('closes the modal on unmount so a valuation switch never carries open=true forward', () => {
    // Reproduces the valuation-switch flow: user opens the modal on
    // valuation A, then a `key={reportId}` change in the layout body
    // unmounts the entire wizard subtree. The trigger must reset the
    // store so the next-mounted trigger doesn't immediately reopen the
    // modal with the new valuation's calibration data showing.
    const { unmount } = render(<AdvisorControlsTrigger {...baseProps} />)
    fireEvent.click(screen.getByTestId('advisor-controls-trigger'))
    expect(useAdvisorControlsModalStore.getState().open).toBe(true)

    unmount()

    expect(useAdvisorControlsModalStore.getState().open).toBe(false)
  })

  it('honours the disabled prop — button is not clickable when the wizard is calculating', () => {
    render(<AdvisorControlsTrigger {...baseProps} disabled />)
    const button = screen.getByTestId('advisor-controls-trigger')
    expect(button).toBeDisabled()

    fireEvent.click(button)
    // Disabled buttons should not flip the store. The kebab path remains
    // unaffected — it bypasses this trigger entirely.
    expect(useAdvisorControlsModalStore.getState().open).toBe(false)
  })
})
