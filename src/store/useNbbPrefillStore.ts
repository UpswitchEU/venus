/**
 * NBB Prefill Store
 *
 * Tracks original values from NBB CBSO multi-year prefill so the UI can:
 * - Show provenance dots for NBB-sourced fields
 * - Offer "Reset to NBB values" when a user overrides a prefilled field
 * - Display abbreviated-schema tooltips
 */

import { create } from 'zustand'
import type { OfficialFinancialsYear } from '../lib/bootstrap/types'

export interface NbbYearSnapshot {
  fiscalYear: number
  revenue: number | undefined
  ebitda: number | undefined
  revenueSource: 'turnover' | 'gross_margin'
  schemaType: 'full' | 'abbreviated'
  rubricsUsed?: Record<string, string>
}

interface NbbPrefillState {
  /** Original NBB values keyed by fiscal year string. */
  yearSnapshots: Record<string, NbbYearSnapshot>
  /** Whether the prefill store has data (at least one year). */
  hasNbbData: boolean

  /** Populate from bootstrap officialFinancials.historicalYears. */
  setFromHistoricalYears: (years: OfficialFinancialsYear[]) => void
  /** Get the original NBB snapshot for a fiscal year. */
  getYearSnapshot: (fiscalYear: string | number) => NbbYearSnapshot | undefined
  /** Check if a specific field in a specific year was prefilled from NBB. */
  isNbbPrefilled: (field: 'revenue' | 'ebitda', fiscalYear: string | number) => boolean
  /** Clear all NBB prefill data. */
  clear: () => void
}

export const useNbbPrefillStore = create<NbbPrefillState>((set, get) => ({
  yearSnapshots: {},
  hasNbbData: false,

  setFromHistoricalYears: (years) => {
    const snapshots: Record<string, NbbYearSnapshot> = {}
    for (const yr of years) {
      snapshots[String(yr.fiscalYear)] = {
        fiscalYear: yr.fiscalYear,
        revenue: yr.revenue,
        ebitda: yr.ebitda,
        revenueSource: yr.revenueSource ?? 'turnover',
        schemaType: yr.schemaType ?? 'full',
        rubricsUsed: yr.rubricsUsed,
      }
    }
    set({ yearSnapshots: snapshots, hasNbbData: Object.keys(snapshots).length > 0 })
  },

  getYearSnapshot: (fiscalYear) => {
    return get().yearSnapshots[String(fiscalYear)]
  },

  isNbbPrefilled: (field, fiscalYear) => {
    const snap = get().yearSnapshots[String(fiscalYear)]
    if (!snap) return false
    return snap[field] != null
  },

  clear: () => {
    set({ yearSnapshots: {}, hasNbbData: false })
  },
}))
