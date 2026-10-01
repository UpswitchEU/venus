import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdvancedAdvisorControlsModal } from './AdvancedAdvisorControlsModal'

const controls = vi.hoisted(() => vi.fn(() => <div>Calibration fields</div>))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('./AdvancedAdvisorControlsSection', () => ({ AdvancedAdvisorControlsSection: controls }))

describe('advanced controls dialog', () => {
  beforeEach(() => controls.mockClear())

  it('mounts controls only when opened and restores focus when dismissed', async () => {
    const onOpenChange = vi.fn()
    const props = { open: false, onOpenChange, historicalYears: [2025], onFieldChange: vi.fn() }
    const { rerender } = render(
      <>
        <button type="button">Configure valuation</button>
        <AdvancedAdvisorControlsModal {...props} />
      </>
    )
    const trigger = screen.getByRole('button', { name: 'Configure valuation' })
    trigger.focus()
    expect(controls).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerender(
      <>
        <button type="button">Configure valuation</button>
        <AdvancedAdvisorControlsModal {...props} open />
      </>
    )
    expect(await screen.findByText('Calibration fields')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveAccessibleName('title')
    fireEvent.click(screen.getByRole('button', { name: 'closeControls' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)

    rerender(
      <>
        <button type="button">Configure valuation</button>
        <AdvancedAdvisorControlsModal {...props} />
      </>
    )
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
