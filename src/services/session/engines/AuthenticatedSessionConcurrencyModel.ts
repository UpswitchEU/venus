export type AuthenticatedSessionSaveReason = 'user' | 'autosave' | 'system'

export type SaveQueueRequestDisposition = 'start' | 'join' | 'detach'

export function isActiveSessionLoad({
  loadToken,
  activeLoadSequence,
  reportId,
  loadingReportId,
}: {
  loadToken: number
  activeLoadSequence: number
  reportId: string
  loadingReportId: string | null
}): boolean {
  return loadToken === activeLoadSequence && loadingReportId === reportId
}

export function shouldQueueUpdateForActiveLoad({
  isLoading,
  loadingReportId,
  currentReportId,
}: {
  isLoading: boolean
  loadingReportId: string | null
  currentReportId: string | null
}): boolean {
  return isLoading && !!loadingReportId && currentReportId !== loadingReportId
}

export function classifySessionSaveQueueRequest({
  hasSavePromise,
  saveReportId,
  saveLifecycleVersion,
  activeReportId,
  activeLifecycleVersion,
}: {
  hasSavePromise: boolean
  saveReportId: string | null
  saveLifecycleVersion: number
  activeReportId: string
  activeLifecycleVersion: number
}): SaveQueueRequestDisposition {
  if (!hasSavePromise) return 'start'

  if (saveReportId === activeReportId && saveLifecycleVersion === activeLifecycleVersion) {
    return 'join'
  }

  return 'detach'
}

export function isActiveSessionSaveQueue({
  queueReportId,
  queueLifecycleVersion,
  currentReportId,
  sessionLifecycleVersion,
}: {
  queueReportId: string
  queueLifecycleVersion: number
  currentReportId: string | null
  sessionLifecycleVersion: number
}): boolean {
  return sessionLifecycleVersion === queueLifecycleVersion && currentReportId === queueReportId
}

export function shouldRunFollowUpSave({
  hasCurrentSession,
  currentMutationVersion,
  savedMutationVersion,
}: {
  hasCurrentSession: boolean
  currentMutationVersion: number
  savedMutationVersion: number
}): boolean {
  return hasCurrentSession && currentMutationVersion > savedMutationVersion
}

export function shouldSkipAutosavePayload({
  reason,
  payloadFingerprint,
  lastPersistedFingerprint,
}: {
  reason: AuthenticatedSessionSaveReason
  payloadFingerprint: string
  lastPersistedFingerprint: string | null
}): boolean {
  return reason === 'autosave' && payloadFingerprint === lastPersistedFingerprint
}
