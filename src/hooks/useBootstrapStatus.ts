/**
 * useBootstrapStatus Hook
 *
 * Provides a comprehensive status view of the bootstrap system.
 * Useful for debugging, monitoring, and conditional rendering.
 *
 * @module hooks/useBootstrapStatus
 */

import { useMemo } from 'react'
import { useAuthStore } from '../lib/auth'
import { useBootstrapSafe } from '../lib/bootstrap'
import { useManualFormStore } from '../store/manual/useManualFormStore'
import { useSessionStore } from '../store/useSessionStore'

export interface BootstrapStatus {
  // Bootstrap system status
  isBootstrapAvailable: boolean
  isBootstrapping: boolean
  bootstrapComplete: boolean
  bootstrapError: string | null
  bootstrapDurationMs: number

  // Identity status
  // AUTH-FIRST: 'guest' type is deprecated - kept for backward compatibility
  identityType: 'guest' | 'authenticated' | 'accountant_for_client' | 'unknown'
  /** @deprecated AUTH-FIRST: Guest mode is no longer supported. Always returns false. */
  isGuest: boolean
  isAuthenticated: boolean
  isAccountantFlow: boolean
  userId: string | null

  // Session status
  reportMode: 'new' | 'existing' | 'unknown'
  reportId: string | null
  hasExistingData: boolean
  sessionStatus: 'active' | 'completed' | 'draft' | 'expired' | 'unknown'

  // Prefill status
  prefillConfidence: number
  prefillSources: string[]
  fieldsPopulated: number
  fieldsRemaining: number

  // UI hints
  suggestedFlow: 'manual' | 'conversational'
  showWelcomeBack: boolean
  resumableSession: boolean

  // Legacy store sync status
  authStoreSynced: boolean
  sessionStoreSynced: boolean
  formStoreSynced: boolean
}

/**
 * Get comprehensive bootstrap status for debugging and UI logic
 */
export function useBootstrapStatus(): BootstrapStatus {
  const bootstrap = useBootstrapSafe()
  // Subscribe only to `user` — the rest of the auth store (loading flags,
  // refresh markers, error strings) does not influence the status payload
  // returned here, and re-rendering every consumer of this hook on
  // unrelated mutations is wasteful.
  const authUser = useAuthStore((s) => s.user)
  const sessionStore = useSessionStore()
  const formStore = useManualFormStore()

  return useMemo<BootstrapStatus>(() => {
    // Bootstrap system unavailable
    if (!bootstrap) {
      return {
        isBootstrapAvailable: false,
        isBootstrapping: false,
        bootstrapComplete: false,
        bootstrapError: null,
        bootstrapDurationMs: 0,

        // AUTH-FIRST: Default to 'authenticated' or 'unknown' - guest is deprecated
        identityType: authUser ? 'authenticated' : 'unknown',
        isGuest: false, // AUTH-FIRST: Always false
        isAuthenticated: !!authUser,
        isAccountantFlow: false,
        userId: authUser?.id || null,

        reportMode: sessionStore.session ? 'existing' : 'new',
        reportId: sessionStore.session?.reportId || null,
        hasExistingData: false,
        sessionStatus: 'unknown',

        prefillConfidence: 0,
        prefillSources: [],
        fieldsPopulated: 0,
        fieldsRemaining: 0,

        suggestedFlow: 'manual',
        showWelcomeBack: false,
        resumableSession: false,

        authStoreSynced: false,
        sessionStoreSynced: false,
        formStoreSynced: false,
      }
    }

    const { state, isBootstrapping, bootstrapError } = bootstrap
    const { identity, report, prefillData, ui } = state

    // Check legacy store sync - ensure boolean results
    // AUTH-FIRST: 'guest' type is deprecated, check for authenticated or accountant_for_client
    const authStoreSynced: boolean = !!(identity.userId && authUser?.id === identity.userId)

    const sessionStoreSynced: boolean =
      report.mode === 'new' || sessionStore.session?.reportId === report.reportId

    const formStoreSynced: boolean =
      prefillData.confidence < 0.1 ||
      !!(
        prefillData.companyInfo?.companyName &&
        formStore.formData.company_name === prefillData.companyInfo.companyName
      )

    return {
      isBootstrapAvailable: true,
      isBootstrapping,
      bootstrapComplete: !isBootstrapping && !bootstrapError,
      bootstrapError,
      bootstrapDurationMs: state.bootstrapDurationMs,

      identityType: identity.type,
      isGuest: false, // AUTH-FIRST: Always false - guest mode deprecated
      isAuthenticated:
        identity.type === 'authenticated' || identity.type === 'accountant_for_client',
      isAccountantFlow: identity.type === 'accountant_for_client',
      userId: identity.userId || null,

      reportMode: report.mode,
      reportId: report.reportId,
      hasExistingData: report.hasExistingData,
      sessionStatus: report.status,

      prefillConfidence: prefillData.confidence,
      prefillSources: prefillData.sources,
      fieldsPopulated: prefillData.fieldsPopulated.length,
      fieldsRemaining: prefillData.fieldsRemaining.length,

      suggestedFlow: ui.suggestedFlow,
      showWelcomeBack: ui.showWelcomeBack,
      resumableSession: ui.resumableSession,

      authStoreSynced,
      sessionStoreSynced,
      formStoreSynced,
    }
  }, [bootstrap, authUser, sessionStore.session, formStore.formData.company_name])
}

/**
 * Get bootstrap status as a log-friendly object
 */
export function useBootstrapStatusForLogging(): Record<string, string | number | boolean> {
  const status = useBootstrapStatus()

  return useMemo(
    () => ({
      bootstrap_available: status.isBootstrapAvailable,
      bootstrap_complete: status.bootstrapComplete,
      bootstrap_duration_ms: status.bootstrapDurationMs,
      identity_type: status.identityType,
      report_mode: status.reportMode,
      report_id: status.reportId?.substring(0, 30) || 'none',
      prefill_confidence: Math.round(status.prefillConfidence * 100),
      prefill_sources: status.prefillSources.join(',') || 'none',
      fields_populated: status.fieldsPopulated,
      suggested_flow: status.suggestedFlow,
      stores_synced: status.authStoreSynced && status.sessionStoreSynced && status.formStoreSynced,
    }),
    [status]
  )
}

export default useBootstrapStatus
