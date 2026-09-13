import { useSyncExternalStore } from 'react'
import {
  failedReportAssetSave,
  subscribeReportAssetSaveState,
} from '../services/report/ReportAssetService'

export function useReportAssetSaveFailure(reportId: string | undefined) {
  return useSyncExternalStore(
    subscribeReportAssetSaveState,
    () => (reportId ? failedReportAssetSave(reportId) : undefined),
    () => undefined
  )
}
