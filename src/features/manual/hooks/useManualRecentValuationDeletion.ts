import { type Dispatch, type SetStateAction, useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { RecentValuation, RightPanelView, ValuationReportData } from '../../../components/calculator'
import { EMBEDDED_STORAGE_KEY } from '../../../hooks/useEmbeddedMode'
import { reportService } from '../../../services'
import { backendAPI } from '../../../services/backendApi'
import { useManualFormStore } from '../../../store/manual'
import { useNormalizationStore } from '../../../store/useNormalizationStore'
import { useClientContext } from '../../../stores/clientContext'
import { isValuationIdSameAsActiveReport } from '../../../utils/identifiers'
import { generalLogger } from '../../../utils/logger'
import { writeNewValuationPrefill } from '../../../utils/newValuationPrefillStorage'
import {
  buildCurrentReportDeletedMercuryMessage,
  buildPostDeleteCurrentReportRedirectUrl,
  buildPostDeleteNewValuationUrl,
  buildSidebarReportDeletedMercuryMessage,
  deleteValuationEntry,
} from '../utils/deleteValuationEntry'
import {
  performManualFlowRedirect,
  readManualMercuryHandoffFromBrowser,
} from '../utils/manualMercuryNavigate'
import { filterRemainingRecentValuationsAfterDelete } from '../utils/manualRecentValuations'
import { restoreManualWorkspaceAfterDeleteFailure } from '../utils/restoreManualWorkspaceAfterDeleteFailure'
import {
  beginOptimisticCurrentReportDelete,
  resetManualWorkspaceState,
} from '../utils/resetManualWorkspaceState'
import {
  clearReportsDeleting,
  markReportsDeleting,
} from '../utils/manualReportDeleteGuard'

interface ManualDeletionRouter {
  push: (href: string) => void
}

export interface UseManualRecentValuationDeletionParams {
  reportId: string
  resolvedReportId?: string | null
  sessionReportId?: string | null
  activeSessionKey?: string | null
  rawRecentValuations: RecentValuation[]
  setRawRecentValuations: Dispatch<SetStateAction<RecentValuation[]>>
  fetchRecentValuations: () => void
  isAccountantMode: boolean
  clientContextId?: string | null
  collectedCompanyName?: string | null
  clientCompanyName?: string | null
  router: ManualDeletionRouter
  currentLocale: string
  deleteReportFailedTitle: string
  setReport: Dispatch<SetStateAction<ValuationReportData | null>>
  setRightPanelView: Dispatch<SetStateAction<RightPanelView>>
  setShowFullscreenModal: Dispatch<SetStateAction<boolean>>
}

export interface UseManualRecentValuationDeletionResult {
  deletingValuationId: string | null
  handleDeleteValuation: (valuation: RecentValuation) => Promise<void>
}

function isEmbeddedAccountantMode(isAccountantMode: boolean): boolean {
  return (
    isAccountantMode &&
    typeof window !== 'undefined' &&
    sessionStorage.getItem(EMBEDDED_STORAGE_KEY) === 'true'
  )
}

export function useManualRecentValuationDeletion({
  reportId,
  resolvedReportId,
  sessionReportId,
  activeSessionKey,
  rawRecentValuations,
  setRawRecentValuations,
  fetchRecentValuations,
  isAccountantMode,
  clientContextId,
  collectedCompanyName,
  clientCompanyName,
  router,
  currentLocale,
  deleteReportFailedTitle,
  setReport,
  setRightPanelView,
  setShowFullscreenModal,
}: UseManualRecentValuationDeletionParams): UseManualRecentValuationDeletionResult {
  const [deletingValuationId, setDeletingValuationId] = useState<string | null>(null)
  const deleteInProgressRef = useRef<string | null>(null)

  const handleDeleteValuation = useCallback(
    async (valuation: RecentValuation) => {
      const { id } = valuation
      if (deleteInProgressRef.current === id) return

      deleteInProgressRef.current = id
      setDeletingValuationId(id)

      const isCurrentReport = isValuationIdSameAsActiveReport(id, {
        reportId,
        resolvedReportId,
        sessionReportId,
        sessionKey: activeSessionKey ?? undefined,
      })

      try {
        let postDeleteNewValuationUrl: string | null = null
        const cacheAndVersionIds = isCurrentReport
          ? [id, reportId, resolvedReportId, sessionReportId, activeSessionKey]
          : []

        if (isCurrentReport) {
          markReportsDeleting(cacheAndVersionIds)
          beginOptimisticCurrentReportDelete({
            setReport,
            setShowFullscreenModal,
            setRightPanelView,
          })
          try {
            const formData = useManualFormStore.getState().formData
            const normItems = useNormalizationStore
              .getState()
              .items.filter((n) => n.status === 'accepted')
            writeNewValuationPrefill(formData as unknown as Record<string, unknown>, {
              normCount: normItems.length,
            })

            const ctx = useClientContext.getState()
            const relId = clientContextId ?? ctx?.relationshipId
            const currentSearch = typeof window !== 'undefined' ? window.location.search : undefined
            postDeleteNewValuationUrl = buildPostDeleteNewValuationUrl({
              locale: currentLocale,
              clientId: (isAccountantMode || ctx?.isActingAsClient) && relId ? relId : undefined,
              companyName: formData.company_name || collectedCompanyName || clientCompanyName,
              kboNumber: formData.kbo_number,
              vatNumber: (formData as unknown as { vat_number?: string | null }).vat_number,
              currentSearch,
            })
          } catch (snapshotErr) {
            generalLogger.warn('[ManualLayout] Failed to snapshot current report before delete', {
              reportId: id,
              error: snapshotErr instanceof Error ? snapshotErr.message : String(snapshotErr),
            })
          }
        }

        await deleteValuationEntry({
          valuation,
          deleteDraftSession: (sessionId) => backendAPI.deleteValuationSession(sessionId),
          deleteReport: (reportIdForDelete) => reportService.deleteReport(reportIdForDelete),
        })

        if (isCurrentReport) {
          resetManualWorkspaceState({
            preserveForm: true,
            reportIdsToClearVersions: cacheAndVersionIds,
            cacheIdsToRemove: cacheAndVersionIds,
            onClearReportUi: () => {
              setReport(null)
              setRightPanelView('preview')
              setShowFullscreenModal(false)
            },
          })
          const remaining = filterRemainingRecentValuationsAfterDelete({
            rawRecentValuations,
            deletedId: id,
            sessionReportId,
            sessionKey: activeSessionKey ?? undefined,
          })

          if (isEmbeddedAccountantMode(isAccountantMode) && typeof window !== 'undefined') {
            window.parent.postMessage(
              buildCurrentReportDeletedMercuryMessage({
                reportId: id,
                currentLocale,
                clientContextId,
                hasRemainingValuations: remaining.length > 0,
              }),
              '*'
            )
          }

          // Keep delete guard until navigation unloads the page — avoids brief re-hydration
          // of the soft-deleted report between clearReportsDeleting and location.replace.

          if (remaining.length > 0) {
            const nextHref = `/${currentLocale}/reports/${remaining[0].id}`
            if (typeof window !== 'undefined') {
              window.location.replace(nextHref)
            } else {
              router.push(nextHref)
            }
          } else {
            const { returnUrl, sourceApp } = readManualMercuryHandoffFromBrowser()
            const redirectUrl = buildPostDeleteCurrentReportRedirectUrl({
              postDeleteNewValuationUrl,
              isAccountantMode,
              returnUrl,
              sourceApp,
              clientContextId,
              currentLocale,
            })
            // Full navigation — avoids bootstrap/module caches resurrecting deleted report HTML.
            if (typeof window !== 'undefined' && redirectUrl.startsWith('/')) {
              window.location.replace(redirectUrl)
            } else {
              performManualFlowRedirect(redirectUrl, { routerPush: router.push })
            }
          }
        } else {
          setRawRecentValuations((prev) => prev.filter((v) => v.id !== id))
          fetchRecentValuations()

          if (isEmbeddedAccountantMode(isAccountantMode) && typeof window !== 'undefined') {
            window.parent.postMessage(
              buildSidebarReportDeletedMercuryMessage({
                reportId: id,
                clientContextId,
              }),
              '*'
            )
          }
        }
      } catch (err) {
        clearReportsDeleting()
        toast.error(deleteReportFailedTitle, {
          description: err instanceof Error ? err.message : undefined,
        })
        if (isCurrentReport) {
          const restored = await restoreManualWorkspaceAfterDeleteFailure({
            lookupIds: [id, reportId, resolvedReportId, sessionReportId, activeSessionKey],
          })
          if (!restored && typeof window !== 'undefined') {
            window.location.reload()
          }
        }
      } finally {
        deleteInProgressRef.current = null
        setDeletingValuationId(null)
      }
    },
    [
      activeSessionKey,
      clientCompanyName,
      clientContextId,
      collectedCompanyName,
      currentLocale,
      deleteReportFailedTitle,
      fetchRecentValuations,
      isAccountantMode,
      rawRecentValuations,
      reportId,
      resolvedReportId,
      router,
      sessionReportId,
      setRawRecentValuations,
      setReport,
      setRightPanelView,
      setShowFullscreenModal,
    ]
  )

  return { deletingValuationId, handleDeleteValuation }
}
