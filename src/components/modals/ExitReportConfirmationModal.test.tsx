import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ExitReportConfirmationModal } from './ExitReportConfirmationModal'

const base = {
  isOpen: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  onSaveAndExit: vi.fn(),
  hasUnsavedChanges: true,
  hasValuationResults: true,
}

describe('exit report dialog accessibility', () => {
  it('has a name and description, contains keyboard focus and returns it to the opener', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>Leave report</button>
          <ExitReportConfirmationModal {...base} isOpen={open} onClose={() => setOpen(false)} />
        </>
      )
    }
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Leave report' })
    await user.click(trigger)
    expect(screen.getByRole('dialog')).toHaveAccessibleName('titleSave')
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('messageUnsaved')
    const cancel = screen.getByRole('button', { name: 'cancel' })
    expect(cancel).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'saveAndExit' })).toHaveFocus()
    await user.tab()
    expect(cancel).toHaveFocus()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('blocks dismiss and duplicate actions throughout a save', () => {
    const onClose = vi.fn()
    render(<ExitReportConfirmationModal {...base} isSaving onClose={onClose} />)
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true')
  })

  it('announces the save failure and keeps retry available', () => {
    render(<ExitReportConfirmationModal {...base} hasUnsavedChanges={false} saveFailed />)
    expect(screen.getByRole('alert')).toHaveTextContent('saveFailed')
    expect(screen.getByRole('button', { name: 'saveAndExit' })).toBeEnabled()
    expect(screen.getByRole('dialog')).toHaveAccessibleName('titleSave')
  })
})
