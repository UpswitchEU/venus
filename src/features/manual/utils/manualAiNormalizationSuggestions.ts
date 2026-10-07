import type {
  ChatMessage,
  NormalizationItem,
  NormalizationSource,
  SuggestedNormalisation,
} from '@/components/calculator'
import { mapBackendCategoryToFrontend } from '@/store/normalizationStoreModel'
import { normalizationNumber } from '@/utils/normalizationAmount'

type ManualChatNormalisationSuggestion = NonNullable<
  ChatMessage['normalisationSuggestions']
>[number]

export type ManualNormalizationImportSource = Extract<
  NormalizationSource,
  'yuki' | 'exact' | 'odoo' | 'octopus' | 'expertm' | 'silverfin' | 'accountable'
>

export const MANUAL_NORMALIZATION_IMPORT_SOURCE_LABELS: Record<
  ManualNormalizationImportSource,
  string
> = {
  yuki: 'Yuki',
  exact: 'Exact Online',
  odoo: 'Odoo',
  octopus: 'Octopus',
  expertm: 'Expert/M',
  silverfin: 'Silverfin',
  accountable: 'Accountable',
}

interface BuildManualAiNormalizationSuggestionsParams {
  suggestions: readonly unknown[]
  filingYear: number
  createId: () => string
  sourceRef?: string
}

interface BuildManualImportedNormalizationSuggestionsParams {
  suggestions: readonly unknown[]
  source: ManualNormalizationImportSource
  filingYear: number
}

const FRONTEND_NORMALIZATION_CATEGORIES = new Set<NormalizationItem['category']>([
  'salary',
  'rent',
  'vehicle',
  'one-time',
  'personal',
  'depreciation',
  'other',
])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

const AI_CATEGORY_ALIASES: Record<string, string> = {
  owner_salary: 'owner_compensation_adjustment',
  management_fee: 'owner_compensation_adjustment',
  rent: 'related_party_transactions',
  related_party: 'related_party_transactions',
  one_time_costs: 'one_time_expenses',
  depreciation: 'depreciation_adjustment',
  insurance: 'discretionary_expenses',
  vehicle: 'personal_expenses',
  travel: 'discretionary_expenses',
  other: 'other_adjustments',
}

function readFrontendCategory(value: unknown): NormalizationItem['category'] {
  return typeof value === 'string' &&
    FRONTEND_NORMALIZATION_CATEGORIES.has(value as NormalizationItem['category'])
    ? (value as NormalizationItem['category'])
    : 'other'
}

export function buildSuggestedNormalisationsFromItems(
  items: readonly NormalizationItem[],
  fallbackSourceRef = 'Claude AI'
): SuggestedNormalisation[] {
  return items.map((item) => ({
    id: item.id,
    fiscalYear: item.year,
    code: item.ledgerCode,
    description: item.ledgerName,
    category: item.category,
    amount: item.adjustment,
    reason: item.reason || '',
    sourceRef: item.sourceRef || fallbackSourceRef,
    status: item.status,
    source: item.source,
    type: item.type,
    applyAllYears: item.applyAllYears,
  }))
}

export function updateSuggestedNormalisationStatus(
  suggestions: readonly SuggestedNormalisation[],
  id: string,
  status: SuggestedNormalisation['status']
): SuggestedNormalisation[] {
  return suggestions.map((suggestion) =>
    suggestion.id === id ? { ...suggestion, status } : suggestion
  )
}

export function buildManualImportedNormalizationSuggestions({
  suggestions,
  source,
  filingYear,
}: BuildManualImportedNormalizationSuggestionsParams): {
  items: NormalizationItem[]
  reviewSuggestions: SuggestedNormalisation[]
  chatSuggestions: ManualChatNormalisationSuggestion[]
} {
  const sourceLabel = MANUAL_NORMALIZATION_IMPORT_SOURCE_LABELS[source]
  const items: NormalizationItem[] = suggestions.map((suggestion, index) => {
    const record = asRecord(suggestion) ?? {}
    const amount = normalizationNumber(record.amount ?? record.adjustment ?? record.value)

    return {
      id: readString(record.id) || `${source}-${index + 1}`,
      ledgerCode: readString(record.code) || readString(record.ledgerCode) || '',
      ledgerName: readString(record.description) || readString(record.ledgerName) || '',
      category: readFrontendCategory(record.category),
      type: amount < 0 ? 'subtract' : 'add',
      value: Math.abs(amount),
      adjustment: amount,
      reason: readString(record.reason) || '',
      source,
      sourceRef: readString(record.sourceRef) || sourceLabel,
      status: 'pending',
      applyAllYears: false,
      year: filingYear,
    }
  })
  const reviewSuggestions = buildSuggestedNormalisationsFromItems(items, sourceLabel)

  return {
    items,
    reviewSuggestions,
    chatSuggestions: reviewSuggestions.map((suggestion) => ({
      id: suggestion.id,
      fiscalYear: suggestion.fiscalYear,
      code: suggestion.code,
      description: suggestion.description,
      category: suggestion.category,
      amount: suggestion.amount,
      reason: suggestion.reason,
      sourceRef: suggestion.sourceRef,
      status: suggestion.status,
    })),
  }
}

export function buildManualAiNormalizationSuggestions({
  suggestions,
  filingYear,
  createId,
  sourceRef = 'Claude AI',
}: BuildManualAiNormalizationSuggestionsParams): {
  items: NormalizationItem[]
  reviewSuggestions: SuggestedNormalisation[]
} {
  const items: NormalizationItem[] = suggestions.flatMap((suggestion) => {
    const record = asRecord(suggestion) ?? {}
    const rawCategory = readString(record.backendCategory) ?? readString(record.category)
    const backendCategory = rawCategory
      ? (AI_CATEGORY_ALIASES[rawCategory] ?? rawCategory)
      : undefined
    let rawAmount: number
    try {
      rawAmount = normalizationNumber(record.amount)
    } catch {
      return []
    }
    const direction = record.is_addback ?? record.isAddback
    const amount =
      typeof direction === 'boolean' ? (direction ? 1 : -1) * Math.abs(rawAmount) : rawAmount
    const requestedYear = record.fiscal_year ?? record.fiscalYear ?? record.year
    const year =
      Number.isInteger(requestedYear) &&
      Number(requestedYear) >= 2000 &&
      Number(requestedYear) <= 2100
        ? Number(requestedYear)
        : filingYear

    return {
      id: readString(record.id) || createId(),
      ledgerCode: readString(record.ledgerCode) || readString(record.code) || '',
      ledgerName: readString(record.description) || '',
      category:
        typeof record.category === 'string' &&
        FRONTEND_NORMALIZATION_CATEGORIES.has(record.category as NormalizationItem['category'])
          ? readFrontendCategory(record.category)
          : backendCategory
            ? mapBackendCategoryToFrontend(backendCategory)
            : 'other',
      backendCategory,
      type: amount < 0 ? 'subtract' : 'add',
      value: Math.abs(amount),
      adjustment: amount,
      reason: readString(record.justification) ?? readString(record.reason),
      source: 'ai',
      sourceRef,
      status: 'pending',
      applyAllYears: false,
      year,
    }
  })

  return {
    items,
    reviewSuggestions: buildSuggestedNormalisationsFromItems(items, sourceRef),
  }
}
