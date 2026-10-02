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
