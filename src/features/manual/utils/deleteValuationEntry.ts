import type { RecentValuation } from '../../../components/calculator'

interface DeleteValuationEntryParams {
  valuation: RecentValuation
  deleteDraftSession: (id: string) => Promise<unknown>
  deleteReport: (id: string) => Promise<unknown>
}

export async function deleteValuationEntry({
  valuation,
  deleteDraftSession,
  deleteReport,
}: DeleteValuationEntryParams): Promise<void> {
  if (valuation.deleteMode === 'session') {
    await deleteDraftSession(valuation.id)
    return
  }

  await deleteReport(valuation.id)
}
