import { useCallback } from 'react'
import { trackReturnToMercury } from '@/lib/analytics'
import { useAuthStore } from '../../../lib/auth'
import { clearDelegatedClientContext } from '../../../lib/auth/persistedClientContext'
import { useClientContext } from '../../../stores/clientContext'
import { getMercuryUrl } from '../../../utils/getMercuryUrl'
import { generalLogger } from '../../../utils/logger'
import {
  navigateToMercuryFromManualHandoff,
  performManualMercuryNavigation,
  readManualMercuryHandoffFromBrowser,
} from '../utils/manualMercuryNavigate'
import {
  buildManualContinueToListingUrl,
  buildManualExitClientViewFallbackUrl,
  buildManualExitClientViewTarget,
  buildManualImportReviewTarget,
  buildManualLogoutPostUrl,
  buildManualMercuryAccountSettingsUrl,
  buildManualMercuryAdvisorDashboardUrl,
  buildManualMercuryBillingUrl,
  buildManualMercuryClientUrl,
  buildManualMercuryHelpUrl,
  buildManualSwitchWorkspaceReturnUrl,
  getManualBackNavigationDecision,
  getManualMercuryLocale,
  hasCompletedManualValuation,
  type ManualMercuryLocale,
  resolveManualMercuryCompanyName,
  resolveManualMercuryReportId,
} from '../utils/manualMercuryNavigation'

interface ManualNavigationRouter {
  back: () => void
  push: (href: string) => void
}

export interface UseManualMercuryNavigationActionsParams {
  clientContextId?: string | null
  contextRelationshipId?: string | null
  currentLocale: string
  report?: unknown
  session?: unknown
  resolvedReportId?: unknown
  router: ManualNavigationRouter
}

export interface UseManualMercuryNavigationActionsResult {
  mercuryLocale: ManualMercuryLocale
  handleBack: () => void
  handleExitClientView: () => void
  handleContinueImportReview: () => void
  handleContinueToListing: () => void
  handleLogout: () => void
  handleAccountSettings: () => void
  handleSwitchWorkspace: () => void
  handleNavigateToDashboard: () => void
  handleNavigateToBilling: () => void
  handleNavigateToHelp: () => void
  handleOpenMercuryClientForInvite: () => void
}

export function useManualMercuryNavigationActions({
  clientContextId,
  contextRelationshipId,
  currentLocale,
  report,
  session,
  resolvedReportId,
  router,
}: UseManualMercuryNavigationActionsParams): UseManualMercuryNavigationActionsResult {
  const mercuryLocale = getManualMercuryLocale(currentLocale)

  const handleExitClientView = useCallback(() => {
    try {
      try {
        clearDelegatedClientContext(() => useClientContext.getState().clearClientContext())
      } catch (err) {
        generalLogger.warn('[ManualLayout] Client context cleanup failed', {
          error: err instanceof Error ? err.message : String(err),
        })
      }

      navigateToMercuryFromManualHandoff({
        currentLocale,
        clientContextId,
        hasCompletedValuation: hasCompletedManualValuation(report, session),
        companyName: resolveManualMercuryCompanyName(report, session),
        reportId: resolveManualMercuryReportId(report, session, resolvedReportId),
      })
    } catch (error) {
      generalLogger.error('[ManualLayout] handleExitClientView failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      try {
        let sourceApp: string | null = null
        try {
          sourceApp = sessionStorage.getItem('upswitch_source')
        } catch {
          // sessionStorage unavailable; helper will choose its safe fallback.
        }
        performManualMercuryNavigation({
          targetUrl: buildManualExitClientViewFallbackUrl({
            clientContextId,
            currentLocale,
            sourceApp,
            mercuryUrl: getMercuryUrl(),
          }),
          postEngineCloseOnEmbedFailure: true,
        })
      } catch {
        // Last-ditch navigation failed; nothing useful left to do.
      }
    }
  }, [clientContextId, currentLocale, report, resolvedReportId, session])

  const handleBack = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        const { returnUrl, sourceApp } = readManualMercuryHandoffFromBrowser()
        const decision = getManualBackNavigationDecision({
          returnUrl,
          clientContextId,
          historyLength: window.history.length,
          sourceApp,
          currentLocale,
          mercuryUrl: getMercuryUrl(),
        })
        if (decision.kind === 'exit-client-view') {
          handleExitClientView()
          return
        }
        if (decision.kind === 'redirect') {
          performManualMercuryNavigation({ targetUrl: decision.url })
          return
        }
      } catch {
        // sessionStorage or URL parsing can be unavailable in hardened browsers.
      }
    }
    router.back()
  }, [clientContextId, currentLocale, router, handleExitClientView])

  const handleContinueImportReview = useCallback(() => {
    const relId =
      clientContextId ?? contextRelationshipId ?? useClientContext.getState()?.relationshipId
    if (!relId || typeof window === 'undefined') {
      handleExitClientView()
      return
    }
    const { targetPath, targetUrl } = buildManualImportReviewTarget({
      relationshipId: relId,
      currentLocale,
      resolvedReportId,
      mercuryUrl: getMercuryUrl(),
    })

    performManualMercuryNavigation({ targetUrl, targetPath })
  }, [
    clientContextId,
    contextRelationshipId,
    currentLocale,
    handleExitClientView,
    resolvedReportId,
  ])

  const handleContinueToListing = useCallback(() => {
    if (typeof window === 'undefined') return

    trackReturnToMercury()

    try {
      const { returnUrl, sourceApp } = readManualMercuryHandoffFromBrowser()
      const targetUrl = buildManualContinueToListingUrl({
        mercuryUrl: getMercuryUrl(),
        locale: mercuryLocale,
        clientContextId,
        returnUrl,
        sourceApp,
        hasCompletedValuation: hasCompletedManualValuation(report, session),
      })
      performManualMercuryNavigation({ targetUrl, postEngineCloseOnEmbedFailure: true })
    } catch (error) {
      generalLogger.error('[ManualLayout] handleContinueToListing failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      try {
        navigateToMercuryFromManualHandoff({
          currentLocale: mercuryLocale,
          clientContextId,
          hasCompletedValuation: hasCompletedManualValuation(report, session),
        })
      } catch {
        // Last-ditch navigation failed; nothing useful left to do.
      }
    }
  }, [clientContextId, mercuryLocale, report, session])

  const handleLogout = useCallback(() => {
    const postLogoutUrl = buildManualLogoutPostUrl({
      mercuryUrl: getMercuryUrl(),
      locale: currentLocale,
      origin: window.location.origin,
    })
    void useAuthStore.getState().logout({ postLogoutUrl })
  }, [currentLocale])

  const handleAccountSettings = useCallback(() => {
    window.location.href = buildManualMercuryAccountSettingsUrl({
      mercuryUrl: getMercuryUrl(),
      locale: currentLocale,
    })
  }, [currentLocale])

  const handleSwitchWorkspace = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        const returnUrl = sessionStorage.getItem('upswitch_return_url')
        const sourceApp = sessionStorage.getItem('upswitch_source')
        const { relationshipId } = useClientContext.getState()
        const targetUrl = buildManualSwitchWorkspaceReturnUrl({
          returnUrl,
          sourceApp,
          relationshipId,
          currentLocale,
        })
        if (targetUrl) {
          window.location.href = targetUrl
          return
        }
      } catch (error) {
        generalLogger.warn(
          '[ManualLayout] handleSwitchWorkspace: sessionStorage unavailable, falling back to Venus home',
          {
            error: error instanceof Error ? error.message : String(error),
          }
        )
      }
    }
    router.push(`/${currentLocale}/home`)
  }, [router, currentLocale])

  const handleNavigateToDashboard = useCallback(() => {
    window.location.href = buildManualMercuryAdvisorDashboardUrl({
      mercuryUrl: getMercuryUrl(),
      locale: mercuryLocale,
    })
  }, [mercuryLocale])

  const handleNavigateToBilling = useCallback(() => {
    window.location.href = buildManualMercuryBillingUrl({
      mercuryUrl: getMercuryUrl(),
      locale: mercuryLocale,
    })
  }, [mercuryLocale])

  const handleNavigateToHelp = useCallback(() => {
    window.location.href = buildManualMercuryHelpUrl({
      mercuryUrl: getMercuryUrl(),
      locale: mercuryLocale,
    })
  }, [mercuryLocale])

  const handleOpenMercuryClientForInvite = useCallback(() => {
    if (!clientContextId) return
    window.location.href = buildManualMercuryClientUrl({
      mercuryUrl: getMercuryUrl(),
      locale: mercuryLocale,
      clientContextId,
    })
  }, [clientContextId, mercuryLocale])

  return {
    mercuryLocale,
    handleBack,
    handleExitClientView,
    handleContinueImportReview,
    handleContinueToListing,
    handleLogout,
    handleAccountSettings,
    handleSwitchWorkspace,
    handleNavigateToDashboard,
    handleNavigateToBilling,
    handleNavigateToHelp,
    handleOpenMercuryClientForInvite,
  }
}
