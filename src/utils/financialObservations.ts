import type { FinancialObservationStatus } from '../types/valuation/request'
import { parseFlexibleNumber } from './isFiniteNumeric'

const statuses = new Set<FinancialObservationStatus>([
  'observed',
  'derived',
  'missing',
  'placeholder',
  'unknown',
])

export function readFinancialObservations(
  value: unknown
): Record<string, FinancialObservationStatus> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, FinancialObservationStatus] =>
        typeof entry[1] === 'string' && statuses.has(entry[1] as FinancialObservationStatus)
    )
  )
}

export function isEvidencedFinancialField(source: unknown, field: string): boolean {
  if (!source || typeof source !== 'object') return false
  const row = source as Record<string, unknown>
  const status = readFinancialObservations(row.financial_observations)[field]
  return (
    (status === 'observed' || status === 'derived') && parseFlexibleNumber(row[field]) !== undefined
  )
}

export function hasEvidencedFinancialValue(source: unknown): boolean {
  if (!source || typeof source !== 'object') return false
  const row = source as Record<string, unknown>
  return Object.keys(readFinancialObservations(row.financial_observations)).some((field) =>
    isEvidencedFinancialField(row, field)
  )
}

export function copyFinancialObservation(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  field: string
): void {
  const incoming = readFinancialObservations(source.financial_observations)[field]
  if (incoming || target.financial_observations) {
    target.financial_observations = {
      ...readFinancialObservations(target.financial_observations),
      [field]: incoming ?? 'unknown',
    }
  }
}

/** Legacy unannotated amounts remain usable; explicitly absent facts never do. */
export function availableFinancialNumber(source: unknown, field: string): number | undefined {
  if (!source || typeof source !== 'object') return undefined
  const row = source as Record<string, unknown>
  const status = readFinancialObservations(row.financial_observations)[field]
  if (status === 'missing' || status === 'placeholder' || status === 'unknown') return undefined
  return parseFlexibleNumber(row[field])
}

/** Change only the fields actually edited or generated; retain unrelated source statuses. */
export function setFinancialObservationStatuses(
  existing: unknown,
  fields: readonly string[],
  status: FinancialObservationStatus
): Record<string, FinancialObservationStatus> {
  const next = readFinancialObservations(existing)
  for (const field of fields) next[field] = status
  return next
}
