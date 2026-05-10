'use client'

/**
 * useStartupPrefilledKeys
 * -----------------------
 *
 * Tiny module-scoped store that tracks which startup-store keys were
 * touched by `useStartupPrefill` so individual input components can
 * render the correct `PrefillBadge` variant without having to
 * re-derive provenance from the value alone (which is brittle once
 * the user edits).
 *
 * The set is keyed by the public store field names as they appear in
 * the field-level setters — e.g. `arr`, `mrr`, `investment_amount_sought`,
 * `stage`, `country_code`, plus the form-store mirror identifiers
 * (`company_name`, `business_type_id`, `founding_year`, …).  A consumer
 * checks `useStartupPrefilledKeys().has('arr')` and renders a `mercury`
 * badge when true.
 *
 * Implementation: a tiny `useSyncExternalStore`-shaped subscription
 * over a module Set so we don't pull in zustand for what is
 * essentially a one-shot ref.  The subscription is React-safe
 * (snapshots are stable across renders that don't change membership).
 */

import { useSyncExternalStore } from 'react'

const _set: Set<string> = new Set()
const _listeners: Set<() => void> = new Set()
let _snapshot: ReadonlySet<string> = _set

function emit(): void {
  // Snapshot identity changes only when membership changes — keeps
  // useSyncExternalStore from triggering renders for unrelated calls.
  _snapshot = new Set(_set)
  for (const cb of _listeners) cb()
}

/**
 * Mark a startup-store field as having been prefilled by the bootstrap
 * chain.  Called by `useStartupPrefill` for every key it sets.  Safe
 * to call multiple times for the same key (Set semantics dedupe).
 */
export function markStartupPrefilled(...keys: string[]): void {
  let changed = false
  for (const k of keys) {
    if (!_set.has(k)) {
      _set.add(k)
      changed = true
    }
  }
  if (changed) emit()
}

/**
 * Reset the prefill marker set.  Wired to the `?reset=1` URL handling
 * in `useStartupSessionSync` so a "start fresh" navigation drops the
 * badges with the data.
 */
export function resetStartupPrefilledKeys(): void {
  if (_set.size === 0) return
  _set.clear()
  emit()
}

function subscribe(cb: () => void): () => void {
  _listeners.add(cb)
  return () => {
    _listeners.delete(cb)
  }
}

function getSnapshot(): ReadonlySet<string> {
  return _snapshot
}

function getServerSnapshot(): ReadonlySet<string> {
  return _snapshot
}

/**
 * React hook returning the current prefill-key set.  Re-renders the
 * caller only when the set's membership changes.  Components use the
 * returned set to decide what `PrefillBadge` variant (if any) to
 * render under each input.
 */
export function useStartupPrefilledKeys(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
