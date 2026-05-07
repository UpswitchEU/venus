import type { RecentValuation } from '../../../components/calculator'
import { PRESERVED_REPORT_BOOTSTRAP_PARAM_KEYS } from '@/lib/cross-app/preservedReportBootstrapParams'

interface DeleteValuationEntryParams {
  valuation: RecentValuation
  deleteDraftSession: (id: string) => Promise<unknown>
  deleteReport: (id: string) => Promise<unknown>
}

interface BuildPostDeleteNewValuationUrlParams {
  locale: string
  clientId?: string | null
  companyName?: string | null
  kboNumber?: string | null
  vatNumber?: string | null
  currentSearch?: string | URLSearchParams | null
}

function normalizeText(value?: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function isSafePassthroughParam(key: string, value: string): boolean {
  if (!value) return false
  if (key !== 'return_url') return true
  if (value.startsWith('/') && !value.startsWith('//')) return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function normalizeSearchParams(input?: string | URLSearchParams | null): URLSearchParams {
  if (!input) return new URLSearchParams()
  if (input instanceof URLSearchParams) return new URLSearchParams(input)
  return new URLSearchParams(input.startsWith('?') ? input.slice(1) : input)
}

export function buildPostDeleteNewValuationUrl({
  locale,
  clientId,
  companyName,
  kboNumber,
  vatNumber,
  currentSearch,
}: BuildPostDeleteNewValuationUrlParams): string {
  const params = new URLSearchParams()
  const normalizedClientId = normalizeText(clientId)
  const prefilledQuery =
    normalizeText(companyName) ?? normalizeText(kboNumber) ?? normalizeText(vatNumber)

  if (normalizedClientId) params.set('clientId', normalizedClientId)
  if (prefilledQuery) params.set('prefilledQuery', prefilledQuery)

  const current = normalizeSearchParams(currentSearch)
  for (const key of PRESERVED_REPORT_BOOTSTRAP_PARAM_KEYS) {
    const value = current.get(key)
    if (value && !params.has(key) && isSafePassthroughParam(key, value)) {
      params.set(key, value)
    }
  }

  const query = params.toString()
  return query ? `/${locale}/reports/new?${query}` : `/${locale}/reports/new`
}

/**
 * When a session/report URL is stale (e.g. deleted report), recover by opening a new
 * valuation with the same Mercury/accountant query params — no form snapshot.
 */
export function buildStaleReportRecoveryUrl(locale: string, search?: string): string {
  const params = new URLSearchParams()
  const current = normalizeSearchParams(
    search ?? (typeof window !== 'undefined' ? window.location.search : '')
  )
  for (const key of PRESERVED_REPORT_BOOTSTRAP_PARAM_KEYS) {
    const value = current.get(key)
    if (value && !params.has(key) && isSafePassthroughParam(key, value)) {
      params.set(key, value)
    }
  }
  const query = params.toString()
  return query ? `/${locale}/reports/new?${query}` : `/${locale}/reports/new`
}

export async function deleteValuationEntry({
  valuation,
  deleteDraftSession,
  deleteReport,
}: DeleteValuationEntryParams): Promise<void> {
  if (valuation.deleteMode === 'session') {
    await deleteDraftSession(valuation.id)
    return
  }

  await deleteReport(valuation.id)
}
