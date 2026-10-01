import type { PersistStorage, StorageValue } from 'zustand/middleware'
import {
  readBrowserRecoveryValue,
  removeBrowserRecoveryValue,
  writeBrowserRecoveryValue,
} from './browserRecoveryStorage'

/** Bounded tab recovery only. Durable saves and access checks belong to Titan. */
export function createWorkflowRecoveryStorage<T>(
  isState: (value: unknown) => value is T,
  getScope: () => string | null
): PersistStorage<T> {
  const options = () => {
    try {
      return { storage: window.sessionStorage, allowLegacy: false, maxBytes: 100_000 }
    } catch {
      return { storage: null, allowLegacy: false, maxBytes: 100_000 }
    }
  }
  const removeLegacy = (name: string) => {
    try {
      window.localStorage.removeItem(name)
    } catch {
      // Storage can be unavailable during SSR or in a restricted browser.
    }
  }
  type ScopedValue = { scope: string; snapshot: StorageValue<T> }
  const isValue = (value: unknown): value is ScopedValue => {
    if (!value || typeof value !== 'object' || !('scope' in value) || !('snapshot' in value)) {
      return false
    }
    const snapshot = value.snapshot
    return (
      value.scope === getScope() &&
      !!snapshot &&
      typeof snapshot === 'object' &&
      'state' in snapshot &&
      isState(snapshot.state) &&
      (!('version' in snapshot) ||
        snapshot.version === undefined ||
        (typeof snapshot.version === 'number' && Number.isSafeInteger(snapshot.version)))
    )
  }
  return {
    getItem: (name) => {
      // Unscoped, unbounded legacy snapshots cannot be assigned to the current user.
      removeLegacy(name)
      if (getScope() === null) return null
      return readBrowserRecoveryValue(name, isValue, options())?.snapshot ?? null
    },
    setItem: (name, snapshot) => {
      removeLegacy(name)
      if (getScope() === null) return
      if (
        !isState(snapshot.state) ||
        !writeBrowserRecoveryValue(name, { scope: getScope(), snapshot }, options())
      ) {
        // A failed update must not resurrect an older draft on the next reload.
        removeBrowserRecoveryValue(name, options())
      }
    },
    removeItem: (name) => {
      removeLegacy(name)
      removeBrowserRecoveryValue(name, options())
    },
  }
}
