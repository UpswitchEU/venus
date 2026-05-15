export interface ManualVersionSyncTimeoutRef {
  current: ReturnType<typeof setTimeout> | null
}

export interface ScheduleManualVersionHistorySyncParams {
  timeoutRef: ManualVersionSyncTimeoutRef
  reportId: string
  fetchVersions: (reportId: string) => Promise<void>
  isStillTarget: () => boolean
  onError: (error: unknown) => void
  delayMs?: number
}

/**
 * Schedules the post-calculation version-history refresh.
 * Re-scheduling cancels the previous timer, and both the timer callback and
 * error path honor the active submit/run guard.
 */
export function scheduleManualVersionHistorySync({
  timeoutRef,
  reportId,
  fetchVersions,
  isStillTarget,
  onError,
  delayMs = 1500,
}: ScheduleManualVersionHistorySyncParams): void {
  if (timeoutRef.current) clearTimeout(timeoutRef.current)

  timeoutRef.current = setTimeout(() => {
    if (!isStillTarget()) return

    timeoutRef.current = null
    fetchVersions(reportId).catch((error) => {
      if (!isStillTarget()) return
      onError(error)
    })
  }, delayMs)
}
