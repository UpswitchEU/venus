import { describe, expect, it, vi } from 'vitest'
import { deleteValuationEntry } from '../deleteValuationEntry'

describe('deleteValuationEntry', () => {
  it('deletes draft valuations via the session cleanup path', async () => {
    const deleteDraftSession = vi.fn().mockResolvedValue(undefined)
    const deleteReport = vi.fn().mockResolvedValue(undefined)

    await deleteValuationEntry({
      valuation: {
        id: 'val_123',
        companyName: 'Draft Co',
        updatedAt: new Date(),
        isDraft: true,
        deleteMode: 'session',
      },
      deleteDraftSession,
      deleteReport,
    })

    expect(deleteDraftSession).toHaveBeenCalledWith('val_123')
    expect(deleteReport).not.toHaveBeenCalled()
  })

  it('deletes completed valuations via the report path', async () => {
    const deleteDraftSession = vi.fn().mockResolvedValue(undefined)
    const deleteReport = vi.fn().mockResolvedValue(undefined)

    await deleteValuationEntry({
      valuation: {
        id: 'report-123',
        companyName: 'Completed Co',
        updatedAt: new Date(),
        isDraft: false,
        deleteMode: 'report',
      },
      deleteDraftSession,
      deleteReport,
    })

    expect(deleteReport).toHaveBeenCalledWith('report-123')
    expect(deleteDraftSession).not.toHaveBeenCalled()
  })
})
