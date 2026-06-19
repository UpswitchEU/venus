import type { LedgerAccount } from '../../constants/grootboek'
import type { NormalizationType, SuggestedNormalisation } from './NormalisationReviewStep.types'
import {
  calculateNormalizationAdjustment,
  parseNormalizationInputValue,
} from './UnifiedNormalizationEditorModel'
import { inferCategoryFromCode, parseCustomLedgerFromQuery } from './UnifiedNormalizationHelpers'

export { parseCustomLedgerFromQuery }

export interface NormalisationReviewSummary {
  pendingCount: number
  acceptedCount: number
  rejectedCount: number
  totalAcceptedAdjustment: number
  normalizedEbitda: number
}

export function summarizeNormalisationReview(
  suggestions: SuggestedNormalisation[],
  originalEbitda: number
): NormalisationReviewSummary {
  let pendingCount = 0
  let acceptedCount = 0
  let rejectedCount = 0
  let totalAcceptedAdjustment = 0

  for (const suggestion of suggestions) {
    if (suggestion.status === 'pending') pendingCount += 1
    if (suggestion.status === 'accepted') {
      acceptedCount += 1
      totalAcceptedAdjustment += Number.isFinite(suggestion.amount) ? suggestion.amount : 0
    }
    if (suggestion.status === 'rejected') rejectedCount += 1
  }

  const safeOriginalEbitda = Number.isFinite(originalEbitda) ? originalEbitda : 0

  return {
    pendingCount,
    acceptedCount,
    rejectedCount,
    totalAcceptedAdjustment,
    normalizedEbitda: safeOriginalEbitda + totalAcceptedAdjustment,
  }
}

export function filterNormalisationReviewLedgers(
  accounts: LedgerAccount[],
  searchQuery: string,
  options: { emptyLimit?: number; searchLimit?: number } = {}
): LedgerAccount[] {
  const emptyLimit = options.emptyLimit ?? 6
  const searchLimit = options.searchLimit ?? 8
  const query = searchQuery.trim().toLowerCase()

  if (!query) return accounts.slice(0, emptyLimit)

  return accounts
    .filter((account) => {
      const code = String(account.code ?? '').toLowerCase()
      const name = String(account.name ?? '').toLowerCase()
      return code.includes(query) || name.includes(query)
    })
    .slice(0, searchLimit)
}

export function buildNormalisationReviewUpdate({
  amountInput,
  type,
  applyAllYears,
  reason,
  originalEbitda,
}: {
  amountInput: string
  type: NormalizationType
  applyAllYears: boolean
  reason: string
  originalEbitda: number
}):
  | (Pick<SuggestedNormalisation, 'amount' | 'type' | 'applyAllYears'> &
      Partial<Pick<SuggestedNormalisation, 'reason'>>)
  | null {
  const numericValue = parseNormalizationInputValue(amountInput)
  if (numericValue == null) return null

  const safeEbitda = Number.isFinite(originalEbitda) ? originalEbitda : 0
  const amount = calculateNormalizationAdjustment({
    type,
    numericValue,
    safeEbitda,
  })

  return {
    amount,
    type,
    applyAllYears,
    reason: reason.trim() || undefined,
  }
}

export function buildManualNormalisationFromLedger({
  ledger,
  amountInput,
  type,
  applyAllYears,
  reason,
  originalEbitda,
  fallbackReason,
}: {
  ledger: LedgerAccount
  amountInput: string
  type: NormalizationType
  applyAllYears: boolean
  reason: string
  originalEbitda: number
  fallbackReason: string
}): Omit<SuggestedNormalisation, 'id' | 'status'> | null {
  const update = buildNormalisationReviewUpdate({
    amountInput,
    type,
    applyAllYears,
    reason,
    originalEbitda,
  })
  if (!update) return null

  return {
    code: ledger.code,
    description: ledger.name,
    category: inferCategoryFromCode(ledger.code) as SuggestedNormalisation['category'],
    amount: update.amount,
    reason: update.reason ?? fallbackReason,
    source: 'manual',
    type,
    applyAllYears,
  }
}
