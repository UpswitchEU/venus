import type { TaxLatencyItem } from '../store/useTaxLatencyStore'
import { ValidationError } from '../types/errors'
import type { TaxLatencyInput } from '../types/valuation'

export const TAX_LATENCY_SCHEMA_INVALID = 'TAX_LATENCY_SCHEMA_INVALID' as const
export const TAX_LATENCY_FIELD_CONFLICT = 'TAX_LATENCY_FIELD_CONFLICT' as const

export type TaxLatencyBoundaryCode =
  | typeof TAX_LATENCY_SCHEMA_INVALID
  | typeof TAX_LATENCY_FIELD_CONFLICT

export interface TaxLatencyBoundaryIssue {
  field: string
  message: string
  code: TaxLatencyBoundaryCode
}

export class TaxLatencyBoundaryError extends ValidationError {
  readonly boundaryCode: TaxLatencyBoundaryCode
  readonly issues: TaxLatencyBoundaryIssue[]

  constructor(code: TaxLatencyBoundaryCode, issues: TaxLatencyBoundaryIssue[]) {
    super(
      code === TAX_LATENCY_FIELD_CONFLICT
        ? 'Stored tax-latency values conflict and must be reviewed.'
        : 'Stored tax-latency values are incomplete or invalid.',
      issues[0]?.field ?? 'tax_latencies',
      undefined,
      { code, errors: issues }
    )
    this.name = 'TaxLatencyBoundaryError'
    this.boundaryCode = code
    this.issues = issues
  }
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function parseFiniteNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function addIssue(
  issues: TaxLatencyBoundaryIssue[],
  index: number,
  field: string,
  message: string,
  code: TaxLatencyBoundaryCode = TAX_LATENCY_SCHEMA_INVALID
): void {
  issues.push({ field: `tax_latencies.${index}.${field}`, message, code })
}

function readRequiredAliasedNumber(
  record: UnknownRecord,
  index: number,
  canonicalKey: 'temporary_difference' | 'tax_rate',
  aliasKey: 'temporaryDifference' | 'taxRate',
  issues: TaxLatencyBoundaryIssue[],
  min: number,
  max?: number
): number | undefined {
  const canonicalProvided = record[canonicalKey] !== undefined && record[canonicalKey] !== null
  const aliasProvided = record[aliasKey] !== undefined && record[aliasKey] !== null
  const canonical = parseFiniteNumber(record[canonicalKey])
  const alias = parseFiniteNumber(record[aliasKey])

  if (canonicalProvided && canonical === undefined) {
    addIssue(issues, index, canonicalKey, 'Must be a finite number')
  }
  if (aliasProvided && alias === undefined) {
    addIssue(issues, index, canonicalKey, `${aliasKey} must be a finite number`)
  }
  if (!canonicalProvided && !aliasProvided) {
    addIssue(issues, index, canonicalKey, 'Required')
    return undefined
  }
  if (canonical !== undefined && alias !== undefined && canonical !== alias) {
    addIssue(
      issues,
      index,
      canonicalKey,
      `${canonicalKey} conflicts with legacy alias ${aliasKey}`,
      TAX_LATENCY_FIELD_CONFLICT
    )
    return undefined
  }

  const value = canonical ?? alias
  if (value !== undefined && (value < min || (max !== undefined && value > max))) {
    addIssue(
      issues,
      index,
      canonicalKey,
      max === undefined ? `Must be at least ${min}` : `Must be between ${min} and ${max}`
    )
    return undefined
  }
  return value
}

function readAliasedString(
  record: UnknownRecord,
  index: number,
  canonicalKey: string,
  aliasKey: string,
  issues: TaxLatencyBoundaryIssue[]
): string | undefined {
  const canonicalRaw = record[canonicalKey]
  const aliasRaw = record[aliasKey]
  const canonical = typeof canonicalRaw === 'string' ? canonicalRaw.trim() : undefined
  const alias = typeof aliasRaw === 'string' ? aliasRaw.trim() : undefined

  if (canonicalRaw !== undefined && canonical === undefined) {
    addIssue(issues, index, canonicalKey, 'Must be a string')
  }
  if (aliasRaw !== undefined && alias === undefined) {
    addIssue(issues, index, canonicalKey, `${aliasKey} must be a string`)
  }
  if (canonical !== undefined && alias !== undefined && canonical !== alias) {
    addIssue(
      issues,
      index,
      canonicalKey,
      `${canonicalKey} conflicts with legacy alias ${aliasKey}`,
      TAX_LATENCY_FIELD_CONFLICT
    )
    return undefined
  }
  return canonical ?? alias
}

function optionalString(record: UnknownRecord, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function canonicalizeTaxLatencyRow(
  value: unknown,
  index: number,
  issues: TaxLatencyBoundaryIssue[]
): TaxLatencyInput | null {
  if (!isRecord(value)) {
    addIssue(issues, index, 'item', 'Must be an object')
    return null
  }

  const id = optionalString(value, 'id')
  if (value.id !== undefined && !id) addIssue(issues, index, 'id', 'Must be a non-empty string')

  const type = value.type
  if (type !== 'active' && type !== 'passive') {
    addIssue(issues, index, 'type', 'Must be active or passive')
  }

  const description = optionalString(value, 'description')
  if (typeof value.description !== 'string') {
    addIssue(issues, index, 'description', 'Must be a string')
  }

  const temporaryDifference = readRequiredAliasedNumber(
    value,
    index,
    'temporary_difference',
    'temporaryDifference',
    issues,
    0
  )
  const taxRate = readRequiredAliasedNumber(value, index, 'tax_rate', 'taxRate', issues, 0, 100)
  const accountCode = readAliasedString(value, index, 'account_code', 'accountCode', issues)

  const evidenceId = readAliasedString(value, index, 'evidence_id', 'evidenceId', issues)
  const reviewedAt = readAliasedString(value, index, 'reviewed_at', 'reviewedAt', issues)
  const ruleVersion = readAliasedString(value, index, 'rule_version', 'ruleVersion', issues)
  const approvedBy = readAliasedString(value, index, 'approved_by', 'approvedBy', issues)
  const effectiveDate = readAliasedString(value, index, 'effective_date', 'effectiveDate', issues)
  const fiscalYear = readRequiredOptionalInteger(value, index, issues)
  const currency = optionalString(value, 'currency')?.toUpperCase()
  if (currency && !/^[A-Z]{3}$/.test(currency)) {
    addIssue(issues, index, 'currency', 'Must be a three-letter currency code')
  }

  if (
    (type !== 'active' && type !== 'passive') ||
    typeof value.description !== 'string' ||
    temporaryDifference === undefined ||
    taxRate === undefined
  ) {
    return null
  }

  return {
    ...(id ? { id } : {}),
    type,
    description: description ?? '',
    temporary_difference: temporaryDifference,
    tax_rate: taxRate,
    ...(accountCode ? { account_code: accountCode } : {}),
    ...(optionalString(value, 'status') ? { status: optionalString(value, 'status') } : {}),
    ...(evidenceId ? { evidence_id: evidenceId } : {}),
    ...(reviewedAt ? { reviewed_at: reviewedAt } : {}),
    ...(ruleVersion ? { rule_version: ruleVersion } : {}),
    ...(approvedBy ? { approved_by: approvedBy } : {}),
    ...(currency && /^[A-Z]{3}$/.test(currency) ? { currency } : {}),
    ...(fiscalYear !== undefined ? { fiscal_year: fiscalYear } : {}),
    ...(effectiveDate ? { effective_date: effectiveDate } : {}),
  }
}

function readRequiredOptionalInteger(
  record: UnknownRecord,
  index: number,
  issues: TaxLatencyBoundaryIssue[]
): number | undefined {
  const canonicalProvided = record.fiscal_year !== undefined && record.fiscal_year !== null
  const aliasProvided = record.fiscalYear !== undefined && record.fiscalYear !== null
  const canonical = parseFiniteNumber(record.fiscal_year)
  const alias = parseFiniteNumber(record.fiscalYear)
  if (!canonicalProvided && !aliasProvided) return undefined
  if (canonical === undefined && canonicalProvided) {
    addIssue(issues, index, 'fiscal_year', 'Must be an integer year')
  }
  if (alias === undefined && aliasProvided) {
    addIssue(issues, index, 'fiscal_year', 'fiscalYear must be an integer year')
  }
  if (canonical !== undefined && alias !== undefined && canonical !== alias) {
    addIssue(
      issues,
      index,
      'fiscal_year',
      'fiscal_year conflicts with legacy alias fiscalYear',
      TAX_LATENCY_FIELD_CONFLICT
    )
    return undefined
  }
  const year = canonical ?? alias
  if (year !== undefined && (!Number.isInteger(year) || year < 1900 || year > 2100)) {
    addIssue(issues, index, 'fiscal_year', 'Must be an integer between 1900 and 2100')
    return undefined
  }
  return year
}

export function canonicalizeTaxLatencyWireArray(value: unknown): TaxLatencyInput[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    throw new TaxLatencyBoundaryError(TAX_LATENCY_SCHEMA_INVALID, [
      { field: 'tax_latencies', message: 'Must be an array', code: TAX_LATENCY_SCHEMA_INVALID },
    ])
  }
  if (value.length > 50) {
    throw new TaxLatencyBoundaryError(TAX_LATENCY_SCHEMA_INVALID, [
      {
        field: 'tax_latencies',
        message: 'Cannot contain more than 50 entries',
        code: TAX_LATENCY_SCHEMA_INVALID,
      },
    ])
  }

  const issues: TaxLatencyBoundaryIssue[] = []
  const canonical = value
    .map((item, index) => canonicalizeTaxLatencyRow(item, index, issues))
    .filter((item): item is TaxLatencyInput => item !== null)

  if (issues.length > 0) {
    const code = issues.some((issue) => issue.code === TAX_LATENCY_FIELD_CONFLICT)
      ? TAX_LATENCY_FIELD_CONFLICT
      : TAX_LATENCY_SCHEMA_INVALID
    throw new TaxLatencyBoundaryError(code, issues)
  }
  return canonical
}

export function canonicalTaxLatenciesToStoreItems(
  value: unknown,
  uiMetadataValue?: unknown
): TaxLatencyItem[] {
  const rawItems = Array.isArray(value) ? value : []
  const uiMetadataItems = Array.isArray(uiMetadataValue) ? uiMetadataValue : []
  return canonicalizeTaxLatencyWireArray(value).map((item, index) => {
    const rawItem = isRecord(rawItems[index]) ? rawItems[index] : {}
    const uiMetadataItem =
      uiMetadataItems.find(
        (candidate) => isRecord(candidate) && item.id !== undefined && candidate.id === item.id
      ) ?? uiMetadataItems[index]
    const metadataRecord = isRecord(uiMetadataItem) ? uiMetadataItem : rawItem
    const accountName =
      optionalString(metadataRecord, 'accountName') ??
      optionalString(metadataRecord, 'account_name') ??
      optionalString(rawItem, 'accountName') ??
      optionalString(rawItem, 'account_name')

    return {
      id: item.id ?? `tax_latency_${index}_${item.account_code ?? 'item'}`,
      type: item.type,
      description: item.description,
      temporaryDifference: item.temporary_difference,
      taxRate: item.tax_rate,
      ...(item.account_code ? { accountCode: item.account_code } : {}),
      ...(accountName ? { accountName } : {}),
      ...(item.status ? { status: item.status } : {}),
      ...(item.evidence_id ? { evidence_id: item.evidence_id } : {}),
      ...(item.reviewed_at ? { reviewed_at: item.reviewed_at } : {}),
      ...(item.rule_version ? { rule_version: item.rule_version } : {}),
      ...(item.approved_by ? { approved_by: item.approved_by } : {}),
      ...(item.currency ? { currency: item.currency } : {}),
      ...(item.fiscal_year !== undefined ? { fiscal_year: item.fiscal_year } : {}),
      ...(item.effective_date ? { effective_date: item.effective_date } : {}),
    }
  })
}
