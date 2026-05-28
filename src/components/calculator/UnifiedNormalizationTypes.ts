import type React from 'react'
import type { LedgerAccount } from '../../constants/grootboek'

export type NormalizationType = 'add' | 'subtract' | 'add_percent' | 'subtract_percent' | 'absolute'
export type NormalizationSource =
  | 'manual'
  | 'yuki'
  | 'exact'
  | 'silverfin'
  | 'bizzcontrol'
  | 'odoo'
  | 'octopus'
  | 'expertm'
  | 'accountable'
  | 'csv'
  | 'ai'
  | 'auto'
export type NormalizationStatus = 'pending' | 'accepted' | 'rejected'

export interface NormalizationItem {
  id: string
  ledgerCode: string
  ledgerName: string
  category: 'salary' | 'rent' | 'vehicle' | 'one-time' | 'personal' | 'depreciation' | 'other'
  /** Original backend 12-category value, preserved for lossless round-trip persistence. */
  backendCategory?: string
  type: NormalizationType
  value: number
  adjustment: number
  reason?: string
  source: NormalizationSource
  sourceRef?: string
  status: NormalizationStatus
  applyAllYears: boolean
  applyYears?: number[]
  year: number
  confidence?: 'high' | 'medium' | 'low'
  marketBenchmark?: number
}

export type SearchableLedgerAccount = LedgerAccount & {
  _codeIndices?: number[]
  _nameIndices?: number[]
}

export interface NormalizationPresetOption {
  id: string
  label: string
  ledgerCode: string
  ledgerName: string
  category: NormalizationItem['category']
  defaultType: NormalizationType
  defaultValue: number
  description: string
  marketBenchmark?: string
}

/** Titan / ValuationIQ imported-ledger SDE rows use this ID prefix (stable across bulk + manual follow-up). */
export function isImportedLedgerNormalizationItem(item: Pick<NormalizationItem, 'id'>): boolean {
  return typeof item.id === 'string' && item.id.startsWith('imported_sde_')
}

export interface UnifiedNormalizationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  companyName: string
  currentYear?: number
  originalEBITDA: number
  /** Per-year reported EBITDA for accurate multi-year totals */
  originalEBITDAByYear?: Record<number, number>
  normalizations: NormalizationItem[]
  onNormalizationsChange: (normalizations: NormalizationItem[]) => void
  ledgerAccounts?: LedgerAccount[]
  countryCode?: string | null
  hasUploadedData?: boolean
  onUploadClick?: () => void
  initialSearchQuery?: string
  initialYearFilter?: number | null
  /** Financial years entered by the user (historical + optional forecasts; numeric years) */
  financialYears?: number[]
  /** Fallback form data ref (from ManualInputPanel) — read when originalEBITDA is 0. Modal renders after panel, so ref has latest. */
  fallbackFormDataRef?: React.MutableRefObject<Record<string, unknown> | null>
}
