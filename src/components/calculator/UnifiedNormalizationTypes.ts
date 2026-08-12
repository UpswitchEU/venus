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
  /** Set when an advisor explicitly accepts an imported auto-suggestion after review. */
  reviewedAt?: string
  applyAllYears: boolean
  applyYears?: number[]
  year: number
  confidence?: 'high' | 'medium' | 'low'
  marketBenchmark?: number
  /** Economic role used only for owner-compensation normalizations. */
  ownerRole?: 'working' | 'passive'
  /** Gross compensation actually paid to the owner in this fiscal year. */
  actualOwnerCompensation?: number
  /** Market replacement compensation (zero for a genuinely passive owner). */
  replacementOwnerCompensation?: number
  /** Versioned economic policy that authorized this normalization. */
  ruleVersion?: string
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

const ACCOUNTING_IMPORT_NORMALIZATION_SOURCES = new Set<NormalizationSource>([
  'yuki',
  'exact',
  'silverfin',
  'bizzcontrol',
  'odoo',
  'octopus',
  'expertm',
  'accountable',
])

export function requiresIndividualImportedNormalizationReview(
  item: Pick<NormalizationItem, 'id' | 'source'>
): boolean {
  return (
    isImportedLedgerNormalizationItem(item) ||
    ACCOUNTING_IMPORT_NORMALIZATION_SOURCES.has(item.source)
  )
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
