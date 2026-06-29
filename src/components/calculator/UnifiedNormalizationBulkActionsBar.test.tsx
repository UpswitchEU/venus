import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UnifiedNormalizationBulkActionsBar } from './UnifiedNormalizationBulkActionsBar'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    if (namespace === 'normalizationHub') {
      if (key === 'bulkSelected') return `${values?.count ?? '?'} selected`
      if (key === 'bulkDeselect') return 'Deselect'
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
  it('allows bulk accept for selected rows', () => {
    const onBulkUpdateStatus = vi.fn()

    render(
      <UnifiedNormalizationBulkActionsBar
        selectedCount={2}
        onDeselectAll={vi.fn()}
        onBulkUpdateStatus={onBulkUpdateStatus}
        onBulkDelete={vi.fn()}
      />
    )

    const acceptButton = screen.getByRole('button', { name: 'Accept' })
    fireEvent.click(acceptButton)
    expect(onBulkUpdateStatus).toHaveBeenCalledWith('accepted')
  })

  it('keeps reject and remove actions available beside accept', () => {
    const onBulkUpdateStatus = vi.fn()
    const onBulkDelete = vi.fn()

    render(
      <UnifiedNormalizationBulkActionsBar
        selectedCount={2}
        onDeselectAll={vi.fn()}
        onBulkUpdateStatus={onBulkUpdateStatus}
        onBulkDelete={onBulkDelete}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    expect(onBulkUpdateStatus).toHaveBeenCalledWith('rejected')
    expect(onBulkDelete).toHaveBeenCalled()
  })
})
