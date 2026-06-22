import type { ClientRecoveredHtmlFallback } from '../utils/reportHtmlRecovery'

type ManualResultsSnapshotReader = () => ClientRecoveredHtmlFallback

let manualResultsSnapshotReader: ManualResultsSnapshotReader | null = null

export function setManualResultsSnapshotReader(reader: ManualResultsSnapshotReader | null): void {
  manualResultsSnapshotReader = reader
}

export function getManualResultsSnapshot(): ClientRecoveredHtmlFallback | undefined {
  return manualResultsSnapshotReader?.()
}
