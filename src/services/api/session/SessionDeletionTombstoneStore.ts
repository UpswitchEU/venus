export const SESSION_DELETION_TOMBSTONE_TTL_MS = 120_000

interface SessionDeletionTombstoneStoreOptions {
  ttlMs: number
  now?: () => number
}

export class SessionDeletionTombstoneStore {
  private readonly now: () => number
  private readonly ttlMs: number
  private readonly tombstones = new Map<string, number>()

  constructor({ ttlMs, now = Date.now }: SessionDeletionTombstoneStoreOptions) {
    this.ttlMs = ttlMs
    this.now = now
  }

  get size(): number {
    return this.tombstones.size
  }

  mark(reportId: string): void {
    const markedAt = this.now()
    this.pruneExpired(markedAt)
    this.tombstones.set(reportId, markedAt)
  }

  clear(reportId?: string): void {
    if (!reportId) return
    this.tombstones.delete(reportId)
  }

  hasRecent(reportId: string): boolean {
    const checkedAt = this.now()
    const deletedAt = this.tombstones.get(reportId)
    if (deletedAt == null) {
      this.pruneExpired(checkedAt)
      return false
    }

    if (this.isExpired(deletedAt, checkedAt)) {
      this.tombstones.delete(reportId)
      return false
    }

    return true
  }

  private pruneExpired(checkedAt: number): void {
    for (const [reportId, deletedAt] of this.tombstones) {
      if (this.isExpired(deletedAt, checkedAt)) {
        this.tombstones.delete(reportId)
      }
    }
  }

  private isExpired(deletedAt: number, checkedAt: number): boolean {
    return checkedAt - deletedAt >= this.ttlMs
  }
}
