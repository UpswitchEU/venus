import type {
  ChatMessage,
  NormalizationItem,
  NormalizationSource,
  NormalizationStatus,
  SuggestedNormalisation,
} from '@/components/calculator'
import { mapBackendCategoryToFrontend } from '@/store/useNormalizationStore'

type ManualChatNormalisationSuggestion = NonNullable<
  ChatMessage['normalisationSuggestions']
>[number]

export type ManualNormalizationImportSource = Extract<
  NormalizationSource,
  'yuki' | 'exact' | 'odoo' | 'octopus' | 'accountable'
>

export const MANUAL_NORMALIZATION_IMPORT_SOURCE_LABELS: Record<
  ManualNormalizationImportSource,
  string
> = {
  yuki: 'Yuki',
  exact: 'Exact Online',
  odoo: 'Odoo',
  octopus: 'Octopus',
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
  multiple?: number
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

const NORMALIZATION_STATUSES = new Set<NormalizationStatus>(['pending', 'accepted', 'rejected'])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function readBoolean(value: unknown): boolean {
  return value === true
}

function readFiniteNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function readFrontendCategory(value: unknown): NormalizationItem['category'] {
  return typeof value === 'string' &&
    FRONTEND_NORMALIZATION_CATEGORIES.has(value as NormalizationItem['category'])
    ? (value as NormalizationItem['category'])
    : 'other'
}

function readNormalizationStatus(value: unknown): NormalizationStatus {
  return typeof value === 'string' && NORMALIZATION_STATUSES.has(value as NormalizationStatus)
    ? (value as NormalizationStatus)
    : 'pending'
}

export function buildSuggestedNormalisationsFromItems(
  items: readonly NormalizationItem[],
  fallbackSourceRef = 'Claude AI'
): SuggestedNormalisation[] {
  return items.map((item) => ({
    id: item.id,
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
  multiple = 5.2,
}: BuildManualImportedNormalizationSuggestionsParams): {
  items: NormalizationItem[]
  reviewSuggestions: SuggestedNormalisation[]
  chatSuggestions: ManualChatNormalisationSuggestion[]
} {
  const sourceLabel = MANUAL_NORMALIZATION_IMPORT_SOURCE_LABELS[source]
  const items: NormalizationItem[] = suggestions.map((suggestion, index) => {
    const record = asRecord(suggestion) ?? {}
    const amount = readFiniteNumber(record.amount ?? record.value)

    return {
      id: readString(record.id) || `${source}-${index + 1}`,
      ledgerCode: readString(record.code) || readString(record.ledgerCode) || '',
      ledgerName: readString(record.description) || readString(record.ledgerName) || '',
      category: readFrontendCategory(record.category),
      type: 'add',
      value: amount,
      adjustment: readFiniteNumber(record.amount ?? record.adjustment),
      reason: readString(record.reason) || '',
      source,
      sourceRef: readString(record.sourceRef) || sourceLabel,
      status: readNormalizationStatus(record.status),
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
      code: suggestion.code,
      description: suggestion.description,
      category: suggestion.category,
      amount: suggestion.amount,
      reason: suggestion.reason,
      sourceRef: suggestion.sourceRef,
      status: suggestion.status,
      multiple,
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
  const items: NormalizationItem[] = suggestions.map((suggestion) => {
    const record = asRecord(suggestion) ?? {}
    const backendCategory = readString(record.category)
    const amount = readFiniteNumber(record.amount)

    return {
      id: createId(),
      ledgerCode: readString(record.ledgerCode) || '',
      ledgerName: readString(record.description) || '',
      category: backendCategory ? mapBackendCategoryToFrontend(backendCategory) : 'other',
      backendCategory,
      type: readBoolean(record.isAddback) ? 'add' : 'subtract',
      value: Math.abs(amount),
      adjustment: amount,
      reason: readString(record.reason),
      source: 'ai',
      sourceRef,
      status: 'pending',
      applyAllYears: false,
      year: filingYear,
    }
  })

  return {
    items,
    reviewSuggestions: buildSuggestedNormalisationsFromItems(items, sourceRef),
  }
}
