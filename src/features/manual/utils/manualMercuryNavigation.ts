import {
  fallbackDashboardForSource,
  getSafeMercuryReturnUrl,
  isLegacyReturnUrl,
} from '@/lib/return-url'

const MERCURY_IMPORT_REVIEW_SESSION_KEY_RE = /^val_[a-zA-Z0-9_-]{8,128}$/

export type ManualMercuryLocale = 'en' | 'nl'

function normalizeMercuryBaseUrl(mercuryUrl: string): string {
  return mercuryUrl.replace(/\/$/, '')
}

export function getManualMercuryLocale(locale: string | null | undefined): ManualMercuryLocale {
  return locale === 'nl' || locale === 'en' ? locale : 'en'
}

export interface BuildManualMercuryUrlParams {
  mercuryUrl: string
  locale: string | null | undefined
}

export function buildManualMercuryAdvisorDashboardUrl({
  mercuryUrl,
  locale,
}: BuildManualMercuryUrlParams): string {
  return `${normalizeMercuryBaseUrl(mercuryUrl)}/${getManualMercuryLocale(locale)}/advisor/dashboard`
}

export function buildManualMercuryAccountSettingsUrl({
  mercuryUrl,
  locale,
}: BuildManualMercuryUrlParams): string {
  return `${normalizeMercuryBaseUrl(mercuryUrl)}/${getManualMercuryLocale(locale)}/advisor/settings`
}

export function buildManualMercuryBillingUrl({
  mercuryUrl,
  locale,
}: BuildManualMercuryUrlParams): string {
  return `${buildManualMercuryAccountSettingsUrl({ mercuryUrl, locale })}?tab=billing`
}

export function buildManualMercuryHelpUrl({
  mercuryUrl,
  locale,
}: BuildManualMercuryUrlParams): string {
  return `${normalizeMercuryBaseUrl(mercuryUrl)}/${getManualMercuryLocale(locale)}/help`
}

export function buildManualMercuryBusinessDashboardUrl({
  mercuryUrl,
  locale,
}: BuildManualMercuryUrlParams): string {
  return `${normalizeMercuryBaseUrl(mercuryUrl)}/${getManualMercuryLocale(locale)}/business/dashboard`
}

export function buildManualMercuryPricingUrl({
  mercuryUrl,
  locale,
}: BuildManualMercuryUrlParams): string {
  return `${normalizeMercuryBaseUrl(mercuryUrl)}/${getManualMercuryLocale(locale)}/pricing`
}

export interface BuildManualMercuryClientUrlParams extends BuildManualMercuryUrlParams {
  clientContextId: string
}

export function buildManualMercuryClientUrl({
  mercuryUrl,
  locale,
  clientContextId,
}: BuildManualMercuryClientUrlParams): string {
  return `${normalizeMercuryBaseUrl(mercuryUrl)}/${getManualMercuryLocale(
    locale
  )}/advisor/clients/${encodeURIComponent(clientContextId)}`
}

export interface BuildManualLogoutPostUrlParams extends BuildManualMercuryUrlParams {
  origin: string
}

export function buildManualLogoutPostUrl({
  mercuryUrl,
  locale,
  origin,
}: BuildManualLogoutPostUrlParams): string {
  const mercuryLocale = getManualMercuryLocale(locale)
  const returnUrl = `${origin}/${mercuryLocale}/reports/new`
  return `${normalizeMercuryBaseUrl(
    mercuryUrl
  )}/${mercuryLocale}/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`
}

export interface BuildManualSafeMercuryReturnUrlParams {
  returnUrl: string | null
  clientContextId?: string | null
  currentLocale: string | null | undefined
  sourceApp?: string | null
}

export function buildManualSafeMercuryReturnUrl({
  returnUrl,
  clientContextId,
  currentLocale,
  sourceApp,
}: BuildManualSafeMercuryReturnUrlParams): string {
  return getSafeMercuryReturnUrl(returnUrl, {
    clientContextId: clientContextId ?? undefined,
    locale: getManualMercuryLocale(currentLocale),
    sourceApp: sourceApp ?? undefined,
  })
}

export interface BuildManualSwitchWorkspaceReturnUrlParams {
  returnUrl: string | null
  sourceApp?: string | null
  relationshipId?: string | null
  currentLocale: string | null | undefined
}

export function buildManualSwitchWorkspaceReturnUrl({
  returnUrl,
  sourceApp,
  relationshipId,
  currentLocale,
}: BuildManualSwitchWorkspaceReturnUrlParams): string | null {
  if (!returnUrl || isLegacyReturnUrl(returnUrl)) return null
  if (!sourceApp?.toLowerCase().includes('mercury')) return null

  return buildManualSafeMercuryReturnUrl({
    returnUrl,
    clientContextId: relationshipId,
    currentLocale,
    sourceApp,
  })
}

export type ManualBackNavigationDecision =
  | { kind: 'exit-client-view' }
  | { kind: 'redirect'; url: string }
  | { kind: 'router-back' }

export interface GetManualBackNavigationDecisionParams {
  returnUrl: string | null
  clientContextId?: string | null
  historyLength: number
  sourceApp?: string | null
  currentLocale: string | null | undefined
  mercuryUrl: string
}

export function getManualBackNavigationDecision({
  returnUrl,
  clientContextId,
  historyLength,
  sourceApp,
  currentLocale,
  mercuryUrl,
}: GetManualBackNavigationDecisionParams): ManualBackNavigationDecision {
  if (returnUrl && !isLegacyReturnUrl(returnUrl)) {
    return { kind: 'exit-client-view' }
  }

  if (clientContextId) {
    return { kind: 'exit-client-view' }
  }

  if (historyLength <= 1) {
    return {
      kind: 'redirect',
      url: fallbackDashboardForSource(sourceApp, getManualMercuryLocale(currentLocale), mercuryUrl),
    }
  }

  return { kind: 'router-back' }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

export function hasCompletedManualValuation(report: unknown, session: unknown): boolean {
  const reportRecord = asRecord(report)
  const sessionRecord = asRecord(session)
  const valuation = reportRecord?.valuation
  return !!(
    (typeof valuation === 'number' && Number.isFinite(valuation)) ||
    sessionRecord?.valuationResult ||
    sessionRecord?.htmlReport
  )
}

export interface BuildManualExitClientViewTargetParams {
  returnUrl: string | null
  clientContextId?: string | null
  currentLocale: string | null | undefined
  sourceApp?: string | null
  mercuryUrl: string
  hasCompletedValuation: boolean
}

export function buildManualExitClientViewTarget({
  returnUrl,
  clientContextId,
  currentLocale,
  sourceApp,
  mercuryUrl,
  hasCompletedValuation,
}: BuildManualExitClientViewTargetParams): string {
  const locale = getManualMercuryLocale(currentLocale)
  const mercuryBaseUrl = normalizeMercuryBaseUrl(mercuryUrl)
  const clientDetailFallback = clientContextId
    ? `${mercuryBaseUrl}/${locale}/advisor/clients/${clientContextId}`
    : null

  return getSafeMercuryReturnUrl(returnUrl ?? clientDetailFallback, {
    clientContextId: clientContextId ?? undefined,
    locale,
    sourceApp: sourceApp ?? undefined,
    celebrateMercuryReturn: hasCompletedValuation,
  })
}

export interface BuildManualExitClientViewFallbackUrlParams {
  clientContextId?: string | null
  currentLocale: string | null | undefined
  sourceApp?: string | null
  mercuryUrl: string
}

export function buildManualExitClientViewFallbackUrl({
  clientContextId,
  currentLocale,
  sourceApp,
  mercuryUrl,
}: BuildManualExitClientViewFallbackUrlParams): string {
  const locale = getManualMercuryLocale(currentLocale)
  if (clientContextId) {
    return `${normalizeMercuryBaseUrl(mercuryUrl)}/${locale}/advisor/clients/${clientContextId}`
  }
  return fallbackDashboardForSource(sourceApp ?? null, locale, mercuryUrl)
}

export function getManualImportReviewSessionKey(resolvedReportId: unknown): string | null {
  if (typeof resolvedReportId !== 'string') return null
  const trimmed = resolvedReportId.trim()
  return MERCURY_IMPORT_REVIEW_SESSION_KEY_RE.test(trimmed) ? trimmed : null
}

export interface BuildManualImportReviewTargetParams {
  relationshipId: string
  currentLocale: string | null | undefined
  resolvedReportId: unknown
  mercuryUrl: string
}

export function buildManualImportReviewTarget({
  relationshipId,
  currentLocale,
  resolvedReportId,
  mercuryUrl,
}: BuildManualImportReviewTargetParams): { targetPath: string; targetUrl: string } {
  const locale = getManualMercuryLocale(currentLocale)
  const qs = new URLSearchParams({ import_review: '1' })
  const pendingImportReviewKey = getManualImportReviewSessionKey(resolvedReportId)
  if (pendingImportReviewKey) {
    qs.set('session_key', pendingImportReviewKey)
  }

  const targetPath = `/${locale}/advisor/clients/${encodeURIComponent(relationshipId)}?${qs}`
  return {
    targetPath,
    targetUrl: `${normalizeMercuryBaseUrl(mercuryUrl)}${targetPath}`,
  }
}

export interface ResolveManualListingRelationshipIdParams {
  targetAccountantCustomerId?: string | null
  clientContextId?: string | null
  contextRelationshipId?: string | null
  fallbackRelationshipId?: string | null
}

export function resolveManualListingRelationshipId({
  targetAccountantCustomerId,
  clientContextId,
  contextRelationshipId,
  fallbackRelationshipId,
}: ResolveManualListingRelationshipIdParams): string | null {
  return (
    targetAccountantCustomerId ||
    clientContextId ||
    contextRelationshipId ||
    fallbackRelationshipId ||
    null
  )
}

export interface BuildManualListingWizardUrlParams {
  mercuryUrl: string
  locale: string | null | undefined
  reportId: string
  relationshipId?: string | null
  visibility?: string | null
}

function normalizeManualListingVisibility(
  value: string | null | undefined
): 'public' | 'private' | null {
  const normalized = value?.trim().toLowerCase()
  return normalized === 'public' || normalized === 'private' ? normalized : null
}

export function buildManualListingWizardUrl({
  mercuryUrl,
  locale,
  reportId,
  relationshipId,
  visibility,
}: BuildManualListingWizardUrlParams): string {
  const mercuryBaseUrl = normalizeMercuryBaseUrl(mercuryUrl)
  const mercuryLocale = getManualMercuryLocale(locale)
  const params = [`report_id=${encodeURIComponent(reportId)}`]
  const normalizedVisibility = normalizeManualListingVisibility(visibility)
  if (normalizedVisibility) {
    params.push(`visibility=${normalizedVisibility}`)
  }
  const qs = `?${params.join('&')}`
  const wizardPath = relationshipId
    ? `/${mercuryLocale}/advisor/clients/${encodeURIComponent(relationshipId)}/listings/new${qs}`
    : `/${mercuryLocale}/business/listing/new${qs}`
  return `${mercuryBaseUrl}${wizardPath}`
}

export interface BuildManualContinueToListingUrlParams {
  mercuryUrl: string
  locale: string | null | undefined
  clientContextId?: string | null
  hasCompletedValuation: boolean
}

export function buildManualContinueToListingUrl({
  mercuryUrl,
  locale,
  clientContextId,
  hasCompletedValuation,
}: BuildManualContinueToListingUrlParams): string {
  const mercuryBaseUrl = normalizeMercuryBaseUrl(mercuryUrl)
  const mercuryLocale = getManualMercuryLocale(locale)
  const basePath = clientContextId
    ? `${mercuryBaseUrl}/${mercuryLocale}/advisor/clients/${clientContextId}`
    : `${mercuryBaseUrl}/${mercuryLocale}/advisor/clients`

  return getSafeMercuryReturnUrl(basePath, {
    clientContextId: clientContextId ?? undefined,
    locale: mercuryLocale,
    sourceApp: 'mercury',
    celebrateMercuryReturn: hasCompletedValuation,
  })
}
