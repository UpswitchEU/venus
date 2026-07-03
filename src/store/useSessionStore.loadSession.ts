import type { StateCreator } from 'zustand'
import { navigateToMercuryFromManualHandoff } from '../features/manual/utils/manualMercuryNavigate'
import { isLegacyReturnUrl } from '../lib/return-url'
import { SessionRestorationService } from '../services/session/SessionRestorationService'
import type { ValuationSession } from '../types/valuation'
import { storeLogger } from '../utils/logger'
import { sessionEnvelopeHasIdentitySignals } from '../utils/mergeOptionalSessionPrefillFields'
import {
  officialFinancialsFromSurface,
  officialFinancialsRejectsValuationInputs,
  stripBlockedUntrustedOperatingFinancialSurface,
} from '../utils/officialValuationInputPolicy'
import { getFirstRenderableReportHtml } from '../utils/safetyNetReportHtml'
import type { SessionStatus, SessionStore } from './useSessionStore'
import {
  asSessionDataRecord,
  createSessionNotFoundError,
  hasNonEmptyString,
  preserveRecoveredHtmlOnSessionCommit,
  readHttpStatus,
  readNumericLike,
  readString,
  scheduleOptionalGapFillAfterHydrate,
} from './useSessionStore.helpers'

type StoreSet = Parameters<StateCreator<SessionStore>>[0]
type StoreGet = Parameters<StateCreator<SessionStore>>[1]

type PaywallLoadError = Error & {
  isPaywallError?: boolean
  current?: number
  limit?: number
}

const SESSION_NOT_READY_MESSAGE = 'Session not ready. Please wait for initialization or retry.'
const loadingPromises = new Map<string, Promise<void>>()
let activeLoadSequence = 0

export function preserveRejectedOfficialFinancialsOnSessionLoad(
  session: ValuationSession,
  previousSessionData: Record<string, unknown> | undefined
): ValuationSession {
  const nextData = asSessionDataRecord(session.sessionData)
  const nextOfficial = officialFinancialsFromSurface(nextData)
  const previousOfficial = officialFinancialsFromSurface(previousSessionData)
  const nextRejects = officialFinancialsRejectsValuationInputs(nextOfficial)
  const previousRejects = officialFinancialsRejectsValuationInputs(previousOfficial)

  if (nextOfficial && !nextRejects) return session
  if (!nextRejects && !previousRejects) return session

  const officialToKeep = nextRejects ? nextOfficial : previousOfficial
  if (!officialToKeep) return session

  const mergedData: Record<string, unknown> = { ...nextData }
  if (!nextOfficial) {
    mergedData.official_financials = officialToKeep
  }
  if (!mergedData.official_variance_analysis && previousSessionData?.official_variance_analysis) {
    mergedData.official_variance_analysis = previousSessionData.official_variance_analysis
  }
  if (!mergedData.official_verification_badge && previousSessionData?.official_verification_badge) {
    mergedData.official_verification_badge = previousSessionData.official_verification_badge
  }

  return {
    ...session,
    sessionData: stripBlockedUntrustedOperatingFinancialSurface(
      mergedData
    ) as ValuationSession['sessionData'],
  }
}

export function invalidateActiveLoads(reportId?: string): void {
  activeLoadSequence += 1
  if (reportId) {
    loadingPromises.delete(reportId)
    return
  }
  loadingPromises.clear()
}

export function createLoadSessionAction(set: StoreSet, get: StoreGet): SessionStore['loadSession'] {
  return async (reportId, flow, prefilledQuery) => {
    const state = get()
    const sessionMatches = state.session?.reportId === reportId
    const currentSessionData = asSessionDataRecord(state.session?.sessionData)
    const isBootstrapMinimal =
      sessionMatches &&
      state.status === 'loaded' &&
      ('_bootstrapPrefill' in currentSessionData ||
        '_bootstrapCreated' in currentSessionData ||
        '_optimisticMercuryShell' in currentSessionData)

    if (state.status === 'loaded' && sessionMatches && !isBootstrapMinimal) {
      storeLogger.debug('[Session] Already loaded, skipping', { reportId })
      return
    }

    if (!state.engine) {
      storeLogger.warn('[Session] loadSession blocked — engine not initialized', { reportId })
      throw new Error(SESSION_NOT_READY_MESSAGE)
    }

    if (loadingPromises.has(reportId)) {
      storeLogger.debug('[Session] Reusing existing load promise', { reportId })
      await loadingPromises.get(reportId)
      return
    }

    const loadToken = ++activeLoadSequence
    const isStaleLoad = () => loadToken !== activeLoadSequence
    const logStaleLoad = (phase: string) => {
      storeLogger.debug('[Session] Ignoring stale load completion', {
        reportId,
        phase,
      })
    }

    const loadPromise = (async () => {
      if (isBootstrapMinimal) {
        storeLogger.debug('[Session] Bootstrap-minimal refresh — keeping status=loaded', {
          reportId,
        })
        set({ errorMessage: null, renderError: null })
      } else {
        set({
          status: 'loading' as SessionStatus,
          errorMessage: null,
          renderError: null,
          restorationComplete: false,
          session: state.session?.reportId !== reportId ? null : state.session,
        })
      }

      try {
        storeLogger.debug('[Session] Loading session', { reportId, flow })

        const currentState = get()
        if (!currentState.engine) {
          throw new Error(SESSION_NOT_READY_MESSAGE)
        }

        const loadedSession = await currentState.engine.loadSession(reportId, flow, prefilledQuery)

        if (isStaleLoad()) {
          logStaleLoad('engine-load')
          return
        }

        if (!loadedSession) {
          throw createSessionNotFoundError(reportId)
        }

        let session: ValuationSession = loadedSession
        const previousSessionData = state.session?.sessionData as
          | Record<string, unknown>
          | undefined
        const previousBuyerReadiness =
          state.session?.buyerReadiness ??
          (previousSessionData?._buyerReadiness as ValuationSession['buyerReadiness'] | undefined)

        if (session.reportId !== reportId) {
          session = { ...session, reportId }
        }

        if (previousBuyerReadiness && !session.buyerReadiness) {
          session = {
            ...session,
            buyerReadiness: previousBuyerReadiness,
            sessionData: {
              ...(session.sessionData || {}),
              _buyerReadiness: previousBuyerReadiness,
            } as ValuationSession['sessionData'],
          }
        }

        session = preserveRecoveredHtmlOnSessionCommit(session, get().session ?? state.session)
        session = preserveRejectedOfficialFinancialsOnSessionLoad(session, previousSessionData)

        const sessionData = asSessionDataRecord(session.sessionData)
        const sessionRecord = session as ValuationSession & Record<string, unknown>
        const hasExistingHtmlReport = !!getFirstRenderableReportHtml(
          session.htmlReport,
          readString(sessionData, 'htmlReport'),
          readString(sessionData, 'html_report'),
          readString(sessionData, '_htmlReport')
        )
        const hasExistingValuationResult = !!(
          session.valuationResult ||
          hasExistingHtmlReport ||
          sessionData.valuationResult ||
          sessionData.valuation_result ||
          sessionData._valuationResult ||
          sessionRecord.latestValuation ||
          sessionRecord.latest_valuation
        )
        const hasMergedEnvelopeIdentity = sessionEnvelopeHasIdentitySignals(sessionData)
        const hasExistingFormData = !!(
          sessionData.formData ||
          sessionData.form_data ||
          hasNonEmptyString(sessionData, 'companyName') ||
          hasNonEmptyString(sessionData, 'company_name') ||
          sessionData.kboNumber ||
          sessionData.kbo_number ||
          sessionData.vatNumber ||
          sessionData.vat_number ||
          sessionData.businessTypeId ||
          sessionData.business_type_id ||
          sessionData.revenue ||
          sessionData.ebitda ||
          sessionData.foundingYear ||
          sessionData.founding_year ||
          hasNonEmptyString(sessionData, 'postalCode') ||
          hasNonEmptyString(sessionData, 'postal_code') ||
          hasNonEmptyString(sessionData, 'legalForm') ||
          hasNonEmptyString(sessionData, 'legal_form') ||
          sessionData.naceCode ||
          sessionData.nace_code ||
          hasMergedEnvelopeIdentity
        )
        const isExistingSession = hasExistingValuationResult || hasExistingFormData

        const sessionDataForLog = (session.sessionData || {}) as Record<string, unknown>
        storeLogger.info('[Session] Loaded successfully', {
          reportId: session.reportId?.substring(0, 30),
          hasSessionData: !!session.sessionData,
          isExistingSession,
          hasExistingValuationResult,
          hasExistingFormData,
          sessionDataKboFields: {
            company_name: !!sessionDataForLog.company_name,
            kbo_number: !!sessionDataForLog.kbo_number,
            vat_number: !!sessionDataForLog.vat_number,
          },
        })

        if (isStaleLoad()) {
          logStaleLoad('pre-restoration')
          return
        }

        if (isExistingSession) {
          storeLogger.debug('[Session] Existing session detected - triggering full restoration', {
            reportId,
          })
          SessionRestorationService.clearRestorationState(session.reportId)
          const restorationResult = await SessionRestorationService.restore(
            session.reportId,
            session,
            { shouldContinue: () => !isStaleLoad() }
          )

          storeLogger.debug('[Session] Restoration complete', {
            reportId: session.reportId,
            success: restorationResult.success,
            restoredFormFields: restorationResult.restoredFormFields,
            restoredValuationResult: restorationResult.restoredValuationResult,
            restoredHtmlReport: restorationResult.restoredHtmlReport,
            restoredVersionHistory: restorationResult.restoredVersionHistory,
            restoredEbitdaNormalizations: restorationResult.restoredEbitdaNormalizations,
          })
        } else {
          storeLogger.debug('[Session] New session detected - skipping restoration', { reportId })
          set({ restorationComplete: true })
        }

        if (isStaleLoad()) {
          logStaleLoad('pre-commit')
          return
        }

        set({
          session,
          status: 'loaded' as SessionStatus,
          errorMessage: null,
          hasUnsavedChanges: false,
          dirtyVersion: 0,
          lastSaved: session.updatedAt || null,
          isSaving: false,
        })
        scheduleOptionalGapFillAfterHydrate()
      } catch (error) {
        if (isStaleLoad()) {
          logStaleLoad('error')
          return
        }

        const rawMessage = error instanceof Error ? error.message : 'Failed to load session'
        const paywallError = error as PaywallLoadError

        if (paywallError.isPaywallError === true) {
          storeLogger.info('[Session] Load blocked by paywall', { reportId })
          set({
            status: 'idle' as SessionStatus,
            errorMessage: null,
            restorationComplete: true,
            paywallData: {
              current: readNumericLike(paywallError.current, 0),
              limit: readNumericLike(paywallError.limit, 1),
              message: rawMessage,
            },
          })
          return
        }

        storeLogger.error('[Session] Load failed', { reportId, error: rawMessage })
        set({
          status: 'error' as SessionStatus,
          errorMessage: rawMessage,
          restorationComplete: true,
        })

        const statusCode = readHttpStatus(error)
        if (statusCode === 404 && typeof window !== 'undefined') {
          const currentPath = window.location.pathname
          if (currentPath.includes('/reports/')) {
            const localeMatch = currentPath.match(/^\/(en|nl|fr)/)
            const locale = localeMatch ? localeMatch[1] : 'en'
            try {
              const returnUrl = sessionStorage.getItem('upswitch_return_url')
              const sourceApp = sessionStorage.getItem('upswitch_source')
              if (returnUrl && !isLegacyReturnUrl(returnUrl) && sourceApp?.includes('mercury')) {
                navigateToMercuryFromManualHandoff({
                  currentLocale: locale,
                  hasCompletedValuation: false,
                })
                return
              }
            } catch {
              // Fall through to Venus home.
            }
            window.location.assign(`/${locale}`)
          }
        }
      }
    })()

    loadingPromises.set(reportId, loadPromise)

    try {
      await loadPromise
    } finally {
      if (loadingPromises.get(reportId) === loadPromise) {
        loadingPromises.delete(reportId)
      }
    }
  }
}
