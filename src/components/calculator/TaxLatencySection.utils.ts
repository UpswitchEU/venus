import type { TaxLatencyCandidate } from '../../store/useTaxLatencyStore'

export function generateTaxLatencyId(): string {
  return `tl-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
}

export function sanitizeNumericInput(value: string): string {
  return value.replace(/[^\d.,]/g, '')
}

export function parseNumericInput(value: string): number {
  const raw = sanitizeNumericInput(value)
  if (raw === '') return 0
  const parsed = Number(raw.replace(',', '.'))
  return Number.isNaN(parsed) ? 0 : parsed
}

export function getLedgerDisplayLabel(code?: string, name?: string): string {
  if (code && name) return `${code} · ${name}`
  return code || name || '—'
}

export interface GroupedTaxLatencyCandidate {
  id: string
  candidate: TaxLatencyCandidate
  candidateIds: string[]
  years: number[]
}

function normalizeGroupingValue(value?: string | number | null): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

export function groupTaxLatencyCandidates(
  candidates: TaxLatencyCandidate[]
): GroupedTaxLatencyCandidate[] {
  const groups = new Map<string, GroupedTaxLatencyCandidate>()

  for (const candidate of candidates) {
    const key = [
      normalizeGroupingValue(candidate.accountCode),
      normalizeGroupingValue(candidate.accountName),
      normalizeGroupingValue(candidate.type),
      normalizeGroupingValue(candidate.taxRate),
      normalizeGroupingValue(candidate.description),
    ].join('|')

    const existing = groups.get(key)
    if (existing) {
      existing.candidateIds.push(candidate.id)
      if (candidate.year != null && !existing.years.includes(candidate.year)) {
        existing.years.push(candidate.year)
        existing.years.sort((a, b) => a - b)
      }
      if (existing.candidate.temporaryDifference == null && candidate.temporaryDifference != null) {
        existing.candidate = candidate
      }
      continue
    }

    groups.set(key, {
      id: key,
      candidate,
      candidateIds: [candidate.id],
      years: candidate.year != null ? [candidate.year] : [],
    })
  }

  return Array.from(groups.values())
}

export const fuzzyMatch = (text: string, query: string): { matches: boolean; score: number } => {
  const normalizedText = text.toLowerCase()
  const normalizedQuery = query.toLowerCase()

  if (!normalizedQuery) return { matches: true, score: 0 }
  if (normalizedText.includes(normalizedQuery)) {
    return { matches: true, score: normalizedQuery.length * 10 }
  }

  let textIndex = 0
  let queryIndex = 0
  let score = 0

  while (textIndex < normalizedText.length && queryIndex < normalizedQuery.length) {
    if (normalizedText[textIndex] === normalizedQuery[queryIndex]) {
      queryIndex += 1
      score += 1
    }
    textIndex += 1
  }

  return {
    matches: queryIndex === normalizedQuery.length,
    score,
  }
}
