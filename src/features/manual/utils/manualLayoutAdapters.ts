import type { PreparerMultiplePatchPayload } from '@/store/manual/usePreparerMultipleStore'
import type { ValuationMethodResult } from '@/types/valuation'
import { hydrateClientValuationResultsMap } from '@/utils/extractValuationResultsMap'

export interface ManualUserIdentity {
  name?: string | null
  email?: string | null
}

export interface ManualModalEditPersistToast {
  titleKey: 'modalEditInputsMissing' | 'modalEditInputsIncomplete' | 'persistFailed'
  descriptionKey?: 'persistFailedDesc'
}

export function getManualUserInitials(user: ManualUserIdentity | null | undefined): string {
  if (!user?.name) return (user?.email?.[0] || 'G').toUpperCase()
  const names = user.name.trim().split(/\s+/)
  if (names.length >= 2) return `${names[0][0]}${names[1][0]}`.toUpperCase()
  return user.name.substring(0, 2).toUpperCase()
}

export function getManualHydratedValuationResults(
  result: unknown
): Record<string, ValuationMethodResult> | null {
  return hydrateClientValuationResultsMap(result)
}

export function serializeManualPreparerPayload(
  payload: PreparerMultiplePatchPayload | null
): string {
  return payload ? JSON.stringify(payload) : 'none'
}

function getAxiosLikeErrorMessage(err: unknown): string {
  const e = err as { response?: { data?: { message?: unknown } }; message?: string }
  const raw = e?.response?.data?.message
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string').join(' ')
  if (typeof e?.message === 'string') return e.message
  return ''
}

/** Titan modal-edit failures — same message buckets as Mercury OmniCalcSummary mapping. */
export function getManualModalEditPersistToast(err: unknown): ManualModalEditPersistToast {
  const msg = getAxiosLikeErrorMessage(err)
  if (msg.includes('Stored valuation inputs not found')) {
    return { titleKey: 'modalEditInputsMissing' }
  }
  if (msg.includes('Stored valuation inputs are incomplete')) {
    return { titleKey: 'modalEditInputsIncomplete' }
  }
  return { titleKey: 'persistFailed', descriptionKey: 'persistFailedDesc' }
}
