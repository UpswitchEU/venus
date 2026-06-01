import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UnifiedNormalizationBulkActionsBar } from './UnifiedNormalizationBulkActionsBar'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    if (namespace === 'normalizationHub') {
      if (key === 'bulkSelected') return `${values?.count ?? '?'} selected`
      if (key === 'bulkDeselect') return 'Deselect'
      if (key === 'bulkAcceptImportedBlocked') {
        return `${values?.count ?? '?'} import correction must be accepted individually.`
      }
      if (key === 'bulkAcceptImportedBlockedPlural') {
        return `${values?.count ?? '?'} import corrections must be accepted individually.`
      }
    }
    if (namespace === 'chatAssistant') {
      if (key === 'accept') return 'Accept'
      if (key === 'reject') return 'Reject'
    }
    if (namespace === 'common.actions' && key === 'remove') return 'Remove'
    return key
  },
}))

describe('UnifiedNormalizationBulkActionsBar', () => {
  it('blocks bulk accept for imported ledger corrections that need row-level review', () => {
    const onBulkUpdateStatus = vi.fn()

    render(
      <UnifiedNormalizationBulkActionsBar
        selectedCount={2}
        bulkAcceptBlockedCount={1}
        onDeselectAll={vi.fn()}
        onBulkUpdateStatus={onBulkUpdateStatus}
        onBulkDelete={vi.fn()}
      />
    )

    const acceptButton = screen.getByRole('button', { name: 'Accept' })
    expect(acceptButton).toBeDisabled()
    expect(
      screen.getByText('1 import correction must be accepted individually.')
    ).toBeInTheDocument()

    fireEvent.click(acceptButton)
    expect(onBulkUpdateStatus).not.toHaveBeenCalled()
  })

  it('allows bulk accept when selected rows do not need individual import review', () => {
    const onBulkUpdateStatus = vi.fn()

    render(
      <UnifiedNormalizationBulkActionsBar
        selectedCount={2}
        onDeselectAll={vi.fn()}
        onBulkUpdateStatus={onBulkUpdateStatus}
        onBulkDelete={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(onBulkUpdateStatus).toHaveBeenCalledWith('accepted')
  })
})
