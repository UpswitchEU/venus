import { generalLogger } from '../utils/logger'

type PersistTimer = ReturnType<typeof setTimeout>

interface SessionJsonbAutosaveCoordinatorOptions<TState, TItem> {
  storeName: string
  getItems: () => TItem[]
  selectItems: (state: TState) => TItem[]
  subscribe: (listener: (state: TState) => void) => () => void
  persistToSession: (reportId: string) => Promise<void>
  saveRecoveryBuffer: (reportId: string, items: TItem[]) => void
  clearRecoveryBuffer: (reportId: string) => void
  isVisibilityPersistBlocked?: () => boolean
  resetPendingOnEnable?: boolean
  debounceMs?: number
  inFlightRetryMs?: number
  getDeferRemainingMs: (reportId: string) => number
}

export class SessionJsonbAutosaveCoordinator<TState, TItem> {
  private readonly debounceMs: number
  private readonly inFlightRetryMs: number
  private timer: PersistTimer | null = null
  private inFlight = false
  private pendingReportId: string | null = null
  private pendingVisibilityFlushReportId: string | null = null
  private lastItemsJson = ''

  constructor(private readonly options: SessionJsonbAutosaveCoordinatorOptions<TState, TItem>) {
    this.debounceMs = options.debounceMs ?? 300
    this.inFlightRetryMs = options.inFlightRetryMs ?? 200
  }

  enable(getReportId: () => string | undefined): () => void {
    this.lastItemsJson = JSON.stringify(this.options.getItems())
    if (this.options.resetPendingOnEnable) {
      this.pendingReportId = null
    }

    const handleBeforeUnload = () => {
      this.clearTimer()
      const reportId = getReportId()
      if (!reportId) return

      const items = this.options.getItems()
      const json = JSON.stringify(items)
      if (json === this.lastItemsJson && !this.pendingReportId) return

      this.options.saveRecoveryBuffer(reportId, items)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return
      const reportId = getReportId()
      if (!reportId) return

      this.clearTimer()
      const items = this.options.getItems()
      const json = JSON.stringify(items)
      if (json === this.lastItemsJson && !this.pendingReportId) return

      this.lastItemsJson = json
      this.pendingReportId = reportId
      if (this.inFlight || this.options.isVisibilityPersistBlocked?.()) {
        this.pendingVisibilityFlushReportId = reportId
        return
      }

      void this.runPersist(reportId)
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', handleBeforeUnload)
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }

    const unsubscribeStore = this.options.subscribe((state) => {
      const items = this.options.selectItems(state)
      const json = JSON.stringify(items)
      if (json === this.lastItemsJson) return
      this.lastItemsJson = json

      const reportId = getReportId()
      if (!reportId) return

      this.pendingReportId = reportId
      this.clearTimer()
      const attemptPersist = async () => {
        if (this.inFlight) {
          this.timer = setTimeout(attemptPersist, this.inFlightRetryMs)
          return
        }
        await this.runPersist(reportId)
      }
      this.timer = setTimeout(attemptPersist, this.debounceMs)
    })

    return () => {
      unsubscribeStore()
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', handleBeforeUnload)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
      this.clearTimer()
    }
  }

  flushPendingVisibilityPersist(): void {
    if (!this.pendingVisibilityFlushReportId) return
    if (this.inFlight || this.options.isVisibilityPersistBlocked?.()) return

    const reportId = this.pendingVisibilityFlushReportId
    this.pendingVisibilityFlushReportId = null
    void this.runPersist(reportId)
  }

  private async runPersist(reportId: string): Promise<void> {
    const deferRemainingMs = this.options.getDeferRemainingMs(reportId)
    if (deferRemainingMs > 0) {
      if (Number.isFinite(deferRemainingMs)) {
        this.clearTimer()
        this.timer = setTimeout(() => {
          this.timer = null
          void this.runPersist(reportId)
        }, deferRemainingMs + 25)
      }
      return
    }

    if (this.inFlight) {
      this.pendingVisibilityFlushReportId = reportId
      return
    }

    this.inFlight = true
    try {
      await this.options.persistToSession(reportId)
      this.options.clearRecoveryBuffer(reportId)
      this.pendingReportId = null
    } catch (error) {
      generalLogger.warn(
        `[${this.options.storeName}] Session persist failed — keeping safety buffer`,
        {
          error: error instanceof Error ? error.message : String(error),
        }
      )
    } finally {
      this.inFlight = false
      this.flushPendingVisibilityPersist()
    }
  }

  private clearTimer(): void {
    if (!this.timer) return
    clearTimeout(this.timer)
    this.timer = null
  }
}
