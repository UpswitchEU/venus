const RECOVERY_STORAGE_SCHEMA_VERSION = 1

export const WORKFLOW_RECOVERY_TTL_MS = 24 * 60 * 60 * 1000

type BrowserRecoveryClassification = 'workflow-recovery'

interface BrowserRecoveryEnvelope<T> {
  schemaVersion: typeof RECOVERY_STORAGE_SCHEMA_VERSION
  classification: BrowserRecoveryClassification
  writtenAtMs: number
  expiresAtMs: number
  value: T
}

interface BrowserRecoveryOptions {
  ttlMs?: number
  nowMs?: () => number
}

interface BrowserRecoveryListOptions extends BrowserRecoveryOptions {
  maxEntries?: number
}

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return null
  return window.localStorage
}

function isRecoveryEnvelope(value: unknown): value is BrowserRecoveryEnvelope<unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    record.schemaVersion === RECOVERY_STORAGE_SCHEMA_VERSION &&
    record.classification === 'workflow-recovery' &&
    typeof record.writtenAtMs === 'number' &&
    typeof record.expiresAtMs === 'number' &&
    'value' in record
  )
}

function removeRecoveryValueFrom(storage: Storage, key: string): void {
  try {
    storage.removeItem(key)
  } catch {
    // Storage can throw in restricted/private contexts.
  }
}

export function writeBrowserRecoveryValue<T>(
  key: string,
  value: T,
  options: BrowserRecoveryOptions = {}
): boolean {
  const storage = getLocalStorage()
  if (!storage || !key) return false

  const now = options.nowMs?.() ?? Date.now()
  const ttlMs = options.ttlMs ?? WORKFLOW_RECOVERY_TTL_MS
  const envelope: BrowserRecoveryEnvelope<T> = {
    schemaVersion: RECOVERY_STORAGE_SCHEMA_VERSION,
    classification: 'workflow-recovery',
    writtenAtMs: now,
    expiresAtMs: now + ttlMs,
    value,
  }

  try {
    storage.setItem(key, JSON.stringify(envelope))
    return true
  } catch {
    return false
  }
}

export function readBrowserRecoveryValue<T>(
  key: string,
  isValue: (value: unknown) => value is T,
  options: BrowserRecoveryOptions = {}
): T | null {
  const storage = getLocalStorage()
  if (!storage || !key) return null

  let raw: string | null = null
  try {
    raw = storage.getItem(key)
  } catch {
    return null
  }

  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as unknown
    if (isRecoveryEnvelope(parsed)) {
      const now = options.nowMs?.() ?? Date.now()
      if (parsed.expiresAtMs <= now) {
        removeRecoveryValueFrom(storage, key)
        return null
      }
      if (isValue(parsed.value)) return parsed.value
      removeRecoveryValueFrom(storage, key)
      return null
    }

    // Legacy recovery buffers were stored as raw JSON. Accept once so users
    // do not lose in-flight edits during the migration, then callers clear.
    if (isValue(parsed)) return parsed
    removeRecoveryValueFrom(storage, key)
  } catch {
    removeRecoveryValueFrom(storage, key)
  }

  return null
}

export function removeBrowserRecoveryValue(key: string): void {
  const storage = getLocalStorage()
  if (!storage || !key) return
  removeRecoveryValueFrom(storage, key)
}

export function appendBrowserRecoveryListItem<T>(
  key: string,
  item: T,
  isItem: (value: unknown) => value is T,
  options: BrowserRecoveryListOptions = {}
): boolean {
  const current = readBrowserRecoveryValue<unknown[]>(
    key,
    (value): value is unknown[] => Array.isArray(value),
    options
  )
  const maxEntries = options.maxEntries ?? 10
  const next = [...(current ?? []).filter(isItem), item].slice(-maxEntries)

  return writeBrowserRecoveryValue(key, next, options)
}
