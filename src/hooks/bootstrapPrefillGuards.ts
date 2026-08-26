import type { NormalizationItem } from '../components/calculator/UnifiedNormalizationModal'
import type { PartialFinancials } from '../lib/bootstrap/types'
import type { TaxLatencyItem } from '../store/useTaxLatencyStore'
import type { ValuationFormData } from '../types/valuation'
import { getCurrentFilingYear } from '../utils/fiscalYear'
import {
  canonicalizeTaxLatencyWireArray,
  canonicalTaxLatenciesToStoreItems,
} from '../utils/taxLatencyWire'

export type ManualBusinessCard = {
  company_name: string
  industry: string
  business_model: string
  founding_year: number
  country_code: string
  employee_count?: number
  kbo_number?: string
  vat_number?: string
  city?: string
  postal_code?: string
  legal_form?: string
  nace_code?: string
  nace_description?: string
  activity_code?: string
  activity_label?: string
}

export type BootstrapPrefillPatch = Partial<ValuationFormData> & {
  year_data?: PartialFinancials['yearData']
  yearlyFinancials?: Array<{ year: string; revenue: number; ebitda: number }>
  business_context?: NonNullable<ValuationFormData['business_context']>
}

function normalizeCountryCode(countryCode?: string | null): string | undefined {
  if (!countryCode) return undefined
  const normalized = countryCode.trim().toUpperCase()
  if (normalized === 'UK') return 'GB'
  return normalized.length > 0 ? normalized : undefined
}

export function resolveCountryCode(
  ...candidates: Array<string | null | undefined>
): string | undefined {
  for (const candidate of candidates) {
    const normalized = normalizeCountryCode(candidate)
    if (normalized) return normalized
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const numericValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numericValue) ? numericValue : fallback
}

export function getRecordString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined
  const recordValue = value[key]
  return typeof recordValue === 'string' && recordValue.trim() ? recordValue : undefined
}

export function getRecordNumber(value: unknown, key: string): number | undefined {
  if (!isRecord(value)) return undefined
  const recordValue = value[key]
  return typeof recordValue === 'number' && Number.isFinite(recordValue) ? recordValue : undefined
}

export function readTaxLatencyItems(value: unknown): TaxLatencyItem[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = canonicalTaxLatenciesToStoreItems(value)
  return items.length > 0 ? items : undefined
}

export function toTaxLatencyFormInput(
  item: TaxLatencyItem
): NonNullable<ValuationFormData['tax_latencies']>[number] {
  return canonicalizeTaxLatencyWireArray([item])[0]
}

function isNormalizationCategory(value: unknown): value is NormalizationItem['category'] {
  return (
    value === 'salary' ||
    value === 'rent' ||
    value === 'vehicle' ||
    value === 'one-time' ||
    value === 'personal' ||
    value === 'depreciation' ||
    value === 'other'
  )
}

function isNormalizationType(value: unknown): value is NormalizationItem['type'] {
  return (
    value === 'add' ||
    value === 'subtract' ||
    value === 'add_percent' ||
    value === 'subtract_percent' ||
    value === 'absolute'
  )
}

function isNormalizationSource(value: unknown): value is NormalizationItem['source'] {
  return (
    value === 'manual' ||
    value === 'yuki' ||
    value === 'exact' ||
    value === 'silverfin' ||
    value === 'bizzcontrol' ||
    value === 'odoo' ||
    value === 'octopus' ||
    value === 'accountable' ||
    value === 'csv' ||
    value === 'ai' ||
    value === 'auto'
  )
}

function normalizeNormalizationItem(value: unknown): NormalizationItem | null {
  if (!isRecord(value)) return null
  const id = getRecordString(value, 'id')
  if (!id) return null
  const adjustment = toFiniteNumber(value.adjustment)
  return {
    id,
    ledgerCode: getRecordString(value, 'ledgerCode') ?? getRecordString(value, 'ledger_code') ?? '',
    ledgerName: getRecordString(value, 'ledgerName') ?? getRecordString(value, 'ledger_name') ?? '',
    category: isNormalizationCategory(value.category) ? value.category : 'other',
    type: isNormalizationType(value.type) ? value.type : 'add',
    value: toFiniteNumber(value.value, adjustment),
    adjustment,
    reason: getRecordString(value, 'reason'),
    source: isNormalizationSource(value.source) ? value.source : 'manual',
    sourceRef: getRecordString(value, 'sourceRef') ?? getRecordString(value, 'source_ref'),
    status:
      value.status === 'accepted' || value.status === 'rejected' || value.status === 'pending'
        ? value.status
        : 'pending',
    applyAllYears: value.applyAllYears === true || value.apply_all_years === true,
    applyYears: Array.isArray(value.applyYears)
      ? value.applyYears.filter((year): year is number => typeof year === 'number')
      : undefined,
    year: toFiniteNumber(value.year, getCurrentFilingYear()),
  }
}

export function readNormalizationItems(value: unknown): NormalizationItem[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value
    .map((item) => normalizeNormalizationItem(item))
    .filter((item): item is NormalizationItem => item !== null)
  return items.length > 0 ? items : undefined
}
