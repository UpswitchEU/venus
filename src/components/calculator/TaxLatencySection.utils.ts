import type {
  TaxLatencyCandidate,
  TaxLatencyItem,
  TaxLatencyType,
} from '../../store/useTaxLatencyStore'
import { createRandomId } from '../../utils/secureRandom'

export function generateTaxLatencyId(): string {
  return createRandomId('tl', 10)
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

export function clampTaxLatencyRate(value: number): number {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0))
}

export function resolveTaxLatencyDefaultRate(
  navTaxLatencyPct: number | null | undefined,
  fallbackRate: number
): { rate: number; source: 'navSchedule' | 'fallback' } {
  if (typeof navTaxLatencyPct === 'number' && Number.isFinite(navTaxLatencyPct)) {
    return {
      rate: clampTaxLatencyRate(navTaxLatencyPct),
      source: 'navSchedule',
    }
  }

  return {
    rate: clampTaxLatencyRate(fallbackRate),
    source: 'fallback',
  }
}

export function buildTaxLatencyDraftMetrics({
  amountInput,
  rateInput,
  type,
}: {
  amountInput: string
  rateInput: string
  type: TaxLatencyType
}): {
  canSubmitAmount: boolean
  parsedAmount: number
  parsedRate: number
  preview: number
} {
  const parsedAmount = parseNumericInput(amountInput)
  const parsedRate = clampTaxLatencyRate(parseNumericInput(rateInput))
  const unsignedPreview = Math.abs(parsedAmount) * (parsedRate / 100)

  return {
    canSubmitAmount: parsedAmount > 0,
    parsedAmount,
    parsedRate,
    preview: type === 'active' ? unsignedPreview : -unsignedPreview,
  }
}

export function buildTaxLatencyDraftPayload({
  accountCode,
  accountName,
  amountInput,
  description,
  existingAccountName,
  rateInput,
  selectedLedgerName,
  type,
}: {
  accountCode: string
  accountName: string
  amountInput: string
  description: string
  existingAccountName?: string
  rateInput: string
  selectedLedgerName?: string
  type: TaxLatencyType
}): Omit<TaxLatencyItem, 'id'> | null {
  const metrics = buildTaxLatencyDraftMetrics({ amountInput, rateInput, type })
  if (accountCode.length === 0 || !metrics.canSubmitAmount) {
    return null
  }

  return {
    type,
    accountCode,
    accountName: selectedLedgerName || accountName || existingAccountName || '',
    description,
    temporaryDifference: Math.abs(metrics.parsedAmount),
    taxRate: metrics.parsedRate,
  }
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

export interface NavTaxLatencyAssets {
  nav_real_estate_adjustment?: number | null
  nav_inventory_adjustment?: number | null
  nav_hidden_reserves?: number | null
  nav_other_revaluations?: number | null
}

export function findNavTaxLatencyConflicts({
  countryCode,
  items,
  navTaxLatencyPct,
  navAssets,
}: {
  countryCode?: string | null
  items: TaxLatencyItem[]
  navTaxLatencyPct?: number | null
  navAssets: NavTaxLatencyAssets
}): TaxLatencyItem[] {
  // BE-only for now. Dutch RGS uses different prefixes; applying Belgian
  // MAR rules to NL data would create false positives during review.
  if (countryCode !== 'BE') return []

  const navPctActive =
    typeof navTaxLatencyPct === 'number' &&
    Number.isFinite(navTaxLatencyPct) &&
    navTaxLatencyPct > 0
  if (!navPctActive) return []

  const grossPositiveNav =
    Math.max(0, Number(navAssets.nav_real_estate_adjustment) || 0) +
    Math.max(0, Number(navAssets.nav_inventory_adjustment) || 0) +
    Math.max(0, Number(navAssets.nav_hidden_reserves) || 0) +
    Math.max(0, Number(navAssets.nav_other_revaluations) || 0)
  if (grossPositiveNav <= 0) return []

  return items.filter((item) => {
    if (item.type !== 'passive') return false
    const code = (item.accountCode || '').trim()
    const realEstateOverlap =
      code.startsWith('22') && Number(navAssets.nav_real_estate_adjustment) > 0
    const inventoryOverlap = code.startsWith('3') && Number(navAssets.nav_inventory_adjustment) > 0
    return realEstateOverlap || inventoryOverlap
  })
}
