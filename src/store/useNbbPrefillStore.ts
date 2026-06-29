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

const MAX_AUTO_ACCEPTED_PUBLIC_FILING_EBITDA_MARGIN = 0.9

export interface NbbYearSnapshot {
  fiscalYear: number
  revenue: number | undefined
  ebitda: number | undefined
  revenueSource: 'turnover' | 'gross_margin' | undefined
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

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function readFiscalYear(year: OfficialFinancialsYear): number | undefined {
  const record = year as OfficialFinancialsYear & Record<string, unknown>
  const parsed = finiteNumber(record.fiscalYear ?? record.fiscal_year)
  return parsed != null && Number.isInteger(parsed) ? parsed : undefined
}

function normalizedString(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function readRevenueSource(year: OfficialFinancialsYear): 'turnover' | 'gross_margin' | undefined {
  const record = year as OfficialFinancialsYear & Record<string, unknown>
  const source = normalizedString(record.revenueSource ?? record.revenue_source)
  if (source === 'gross_margin_revenue_proxy') return 'gross_margin'
  return source === 'turnover' || source === 'gross_margin' ? source : undefined
}

function readSchemaType(year: OfficialFinancialsYear): 'full' | 'abbreviated' {
  const record = year as OfficialFinancialsYear & Record<string, unknown>
  return record.schemaType === 'abbreviated' || record.schema_type === 'abbreviated'
    ? 'abbreviated'
    : 'full'
}

function readRubricsUsed(year: OfficialFinancialsYear): Record<string, string> | undefined {
  const record = year as OfficialFinancialsYear & Record<string, unknown>
  const rubrics = record.rubricsUsed ?? record.rubrics_used
  if (!rubrics || typeof rubrics !== 'object' || Array.isArray(rubrics)) return undefined
  const entries = Object.entries(rubrics).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string'
  )
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function hasUnsafeOperatingValues(year: OfficialFinancialsYear): boolean {
  if (readRevenueSource(year) === 'gross_margin') return true

  const revenue = finiteNumber(year.revenue)
  const ebitda = finiteNumber(year.ebitda)
  return (
    revenue != null &&
    revenue > 0 &&
    ebitda != null &&
    ebitda >= 0 &&
    ebitda / revenue >= MAX_AUTO_ACCEPTED_PUBLIC_FILING_EBITDA_MARGIN
  )
}

export const useNbbPrefillStore = create<NbbPrefillState>((set, get) => ({
  yearSnapshots: {},
  hasNbbData: false,

  setFromHistoricalYears: (years) => {
    const snapshots: Record<string, NbbYearSnapshot> = {}
    for (const yr of years) {
      const fiscalYear = readFiscalYear(yr)
      if (fiscalYear == null) continue
      const unsafeOperatingValues = hasUnsafeOperatingValues(yr)
      const revenue = unsafeOperatingValues ? undefined : finiteNumber(yr.revenue)
      const ebitda = unsafeOperatingValues ? undefined : finiteNumber(yr.ebitda)
      if (revenue == null && ebitda == null) continue
      snapshots[String(fiscalYear)] = {
        fiscalYear,
        revenue,
        ebitda,
        revenueSource: readRevenueSource(yr),
        schemaType: readSchemaType(yr),
        rubricsUsed: readRubricsUsed(yr),
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
