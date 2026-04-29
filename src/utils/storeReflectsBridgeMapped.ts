/**
 * Skip redundant `updateFormData` when the clarity→store bridge output matches the store.
 * Panel ↔ Zustand ping-pong otherwise triggers React error #185 (maximum update depth).
 */

import type { ValuationFormData as VenusFormData } from '../types/valuation'
import { deepEqual } from './performance'

export function storeReflectsBridgeMapped(
  mapped: Partial<VenusFormData>,
  current: VenusFormData
): boolean {
  for (const k of Object.keys(mapped) as Array<keyof VenusFormData>) {
    if (!deepEqual(mapped[k], current[k])) return false
  }
  return true
}
