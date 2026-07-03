import { PRESERVED_REPORT_BOOTSTRAP_PARAM_KEYS } from '@/lib/cross-app/preservedReportBootstrapParams'
import { isSafeMercuryReturnUrlInput } from '@/lib/return-url'
import { getMercuryUrl } from '@/utils/getMercuryUrl'
import type { RecentValuation } from '../../../components/calculator'
import { isSessionKey } from '../../../utils/identifiers'
import {
  buildManualExitClientViewTarget,
  buildManualSafeMercuryReturnUrl,
} from './manualMercuryNavigation'

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

interface BuildPostDeleteCurrentReportRedirectUrlParams {
  postDeleteNewValuationUrl?: string | null
  isAccountantMode: boolean
  returnUrl?: string | null
  sourceApp?: string | null
  clientContextId?: string | null
  currentLocale: string
}

interface BuildCurrentReportDeletedMercuryMessageParams {
  reportId: string
  currentLocale: string
  clientContextId?: string | null
  hasRemainingValuations: boolean
}

interface BuildSidebarReportDeletedMercuryMessageParams {
  reportId: string
  clientContextId?: string | null
}

export interface ManualReportDeletedMercuryMessage {
  type: 'venus-report-deleted'
  reportId: string
  keepOpen: boolean
  source: 'venus'
  clientId?: string
  redirectTo?: string
}

function normalizeText(value?: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function isSafePassthroughParam(key: string, value: string): boolean {
  if (!value) return false
  if (key !== 'return_url') return true
  return isSafeMercuryReturnUrlInput(value)
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

  params.set('_ts', String(Date.now()))

  const query = params.toString()
  return query ? `/${locale}/reports/new?${query}` : `/${locale}/reports/new`
}

export function buildPostDeleteCurrentReportRedirectUrl({
  postDeleteNewValuationUrl,
  isAccountantMode,
  returnUrl = null,
  sourceApp = null,
  clientContextId = null,
  currentLocale,
}: BuildPostDeleteCurrentReportRedirectUrlParams): string {
  if (postDeleteNewValuationUrl) return postDeleteNewValuationUrl

  if (isAccountantMode) {
    return buildManualSafeMercuryReturnUrl({
      returnUrl,
      clientContextId,
      currentLocale,
      sourceApp,
    })
  }

  if (returnUrl || sourceApp) {
    return buildManualExitClientViewTarget({
      returnUrl: returnUrl ?? null,
      clientContextId: null,
      currentLocale,
      sourceApp,
      mercuryUrl: getMercuryUrl(),
      hasCompletedValuation: false,
    })
  }

  return `/${currentLocale}/reports/new`
}

function buildDeletedMessageBase({
  reportId,
  clientContextId,
  keepOpen,
}: {
  reportId: string
  clientContextId?: string | null
  keepOpen: boolean
}): ManualReportDeletedMercuryMessage {
  return {
    type: 'venus-report-deleted',
    reportId,
    keepOpen,
    source: 'venus',
    ...(clientContextId ? { clientId: clientContextId } : {}),
  }
}

export function buildCurrentReportDeletedMercuryMessage({
  reportId,
  currentLocale,
  clientContextId,
  hasRemainingValuations,
}: BuildCurrentReportDeletedMercuryMessageParams): ManualReportDeletedMercuryMessage {
  const redirectTo = clientContextId
    ? `/${currentLocale}/advisor/clients/${encodeURIComponent(clientContextId)}`
    : `/${currentLocale}/advisor/dashboard`

  return {
    ...buildDeletedMessageBase({
      reportId,
      clientContextId,
      keepOpen: hasRemainingValuations,
    }),
    redirectTo,
  }
}

export function buildSidebarReportDeletedMercuryMessage({
  reportId,
  clientContextId,
}: BuildSidebarReportDeletedMercuryMessageParams): ManualReportDeletedMercuryMessage {
  return buildDeletedMessageBase({
    reportId,
    clientContextId,
    keepOpen: true,
  })
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

  try {
    await deleteReport(valuation.id)
  } catch (err) {
    // Bootstrapped draft still in recent list with stale deleteMode, or report already gone.
    if (isSessionKey(valuation.id)) {
      await deleteDraftSession(valuation.id)
      return
    }
    throw err
  }
}
