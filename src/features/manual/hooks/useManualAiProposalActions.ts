import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback } from 'react'
import { toast } from 'sonner'
import { trackReturnToMercury } from '@/lib/analytics'
import type { ChatMessage, ValuationFormData } from '../../../components/calculator'
import { useClientContext } from '../../../stores/clientContext'
import { getMercuryUrl } from '../../../utils/getMercuryUrl'
import { generalLogger } from '../../../utils/logger'
import {
  applyManualChatSellabilityComputedScore,
  markManualChatProposalDecision,
} from '../utils/manualChatToolCards'
import {
  buildManualListingWizardUrl,
  type ManualMercuryLocale,
  resolveManualListingRelationshipId,
} from '../utils/manualMercuryNavigation'
import { runManualSellabilityScore } from '../utils/manualSellabilityScore'
import { resolveManualCanonicalReportId } from '../utils/manualSessionIdentifiers'

type ManualSubmitHandler = (data: ValuationFormData) => void | Promise<void>
type GeneratePdfHandler = (() => Promise<unknown>) | null | undefined

export interface UseManualAiProposalActionsParams {
  activeSessionKey?: string | null
  buildLiveValuationSubmitData: () => ValuationFormData
  clientContextId?: string | null
  contextRelationshipId?: string | null
  generatePdf?: GeneratePdfHandler
  handleManualSubmit: ManualSubmitHandler
  lastSubmittedDataRef: MutableRefObject<ValuationFormData | null>
  mercuryLocale: ManualMercuryLocale
  postValuationListingHandoffPendingRef: MutableRefObject<boolean>
  reportId?: string | null
  resolvedReportId?: string | null
  resultValuationId?: string | null
  session?: unknown
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>
}

export interface UseManualAiProposalActionsResult {
  handleApproveValuationRun: (proposalId: string, reportId?: string) => void
  handleRejectValuationRun: (proposalId: string) => void
  handleApproveReportGeneration: (proposalId: string, reportId?: string) => void
  handleRejectReportGeneration: (proposalId: string) => void
  handleApproveSellabilityRun: (proposalId: string) => Promise<void>
  handleRejectSellabilityRun: (proposalId: string) => void
  handleApproveListingCreate: (
    proposalId: string,
    reportId?: string,
    accountantCustomerId?: string | null
  ) => void
  handleRejectListingCreate: (proposalId: string) => void
}

export function useManualAiProposalActions({
  activeSessionKey,
  buildLiveValuationSubmitData,
  clientContextId,
  contextRelationshipId,
  generatePdf,
  handleManualSubmit,
  lastSubmittedDataRef,
  mercuryLocale,
  postValuationListingHandoffPendingRef,
  reportId,
  resolvedReportId,
  resultValuationId,
  session,
  setChatMessages,
}: UseManualAiProposalActionsParams): UseManualAiProposalActionsResult {
  const handleApproveValuationRun = useCallback(
    (proposalId: string, _reportId?: string) => {
      setChatMessages((prev) =>
        markManualChatProposalDecision(prev, 'valuationRunRequests', proposalId, 'approved')
      )
      const submitData = lastSubmittedDataRef.current ?? buildLiveValuationSubmitData()
      postValuationListingHandoffPendingRef.current = true
      void handleManualSubmit(submitData)
    },
    [
      buildLiveValuationSubmitData,
      handleManualSubmit,
      lastSubmittedDataRef,
      postValuationListingHandoffPendingRef,
      setChatMessages,
    ]
  )

  const handleRejectValuationRun = useCallback(
    (proposalId: string) => {
      setChatMessages((prev) =>
        markManualChatProposalDecision(prev, 'valuationRunRequests', proposalId, 'rejected')
      )
    },
    [setChatMessages]
  )

  const handleApproveReportGeneration = useCallback(
    (proposalId: string, _reportId?: string) => {
      setChatMessages((prev) =>
        markManualChatProposalDecision(prev, 'reportGenerationRequests', proposalId, 'approved')
      )
      if (generatePdf) {
        generatePdf().catch((err: unknown) => {
          generalLogger.warn('[ManualLayout] AI-approved PDF generation failed', {
            error: err instanceof Error ? err.message : String(err),
          })
          toast.error(
            // TODO i18n
            'PDF generatie mislukt. Probeer opnieuw via de download-knop in het rapport.'
          )
        })
      } else {
        toast.info(
          // TODO i18n
          'PDF generatie nog niet beschikbaar — bereken eerst de waardering.'
        )
      }
    },
    [generatePdf, setChatMessages]
  )

  const handleRejectReportGeneration = useCallback(
    (proposalId: string) => {
      setChatMessages((prev) =>
        markManualChatProposalDecision(prev, 'reportGenerationRequests', proposalId, 'rejected')
      )
    },
    [setChatMessages]
  )

  const handleApproveSellabilityRun = useCallback(
    async (proposalId: string) => {
      setChatMessages((prev) =>
        markManualChatProposalDecision(prev, 'sellabilityRunRequests', proposalId, 'approved')
      )
      try {
        const sellability = await runManualSellabilityScore()
        if (sellability.kind === 'scored') {
          setChatMessages((prev) =>
            applyManualChatSellabilityComputedScore(prev, proposalId, {
              score: sellability.score,
              band: sellability.band,
              confidence: sellability.confidence,
            })
          )
          toast.success(
            // TODO i18n
            `Sellability: ${sellability.score}/100 (${sellability.band})`
          )
        } else {
          toast.info(/* TODO i18n */ 'Sellability berekend.')
        }
      } catch (err) {
        generalLogger.warn('[ManualLayout] AI-approved sellability compute failed', {
          error: err instanceof Error ? err.message : String(err),
        })
        toast.error(
          // TODO i18n
          'Sellability berekening mislukt. Probeer het opnieuw via je owner profile in Mercury.'
        )
      }
    },
    [setChatMessages]
  )

  const handleRejectSellabilityRun = useCallback(
    (proposalId: string) => {
      setChatMessages((prev) =>
        markManualChatProposalDecision(prev, 'sellabilityRunRequests', proposalId, 'rejected')
      )
    },
    [setChatMessages]
  )

  const handleApproveListingCreate = useCallback(
    (proposalId: string, targetReportId?: string, targetAccountantCustomerId?: string | null) => {
      setChatMessages((prev) =>
        markManualChatProposalDecision(prev, 'listingCreateRequests', proposalId, 'approved')
      )

      const reportIdForListing = resolveManualCanonicalReportId({
        targetReportId,
        session,
        resolvedReportId,
        routeReportId: reportId,
        resultValuationId,
        activeSessionKey,
      })
      if (!reportIdForListing) {
        toast.error(
          // TODO i18n
          'Geen waarderingsrapport gevonden om de listing voor te bereiden.'
        )
        return
      }

      const relationshipId = resolveManualListingRelationshipId({
        targetAccountantCustomerId,
        clientContextId,
        contextRelationshipId,
        fallbackRelationshipId: useClientContext.getState()?.relationshipId,
      })

      trackReturnToMercury()
      window.location.href = buildManualListingWizardUrl({
        mercuryUrl: getMercuryUrl(),
        locale: mercuryLocale,
        reportId: reportIdForListing,
        relationshipId,
      })
    },
    [
      activeSessionKey,
      clientContextId,
      contextRelationshipId,
      mercuryLocale,
      reportId,
      resolvedReportId,
      resultValuationId,
      session,
      setChatMessages,
    ]
  )

  const handleRejectListingCreate = useCallback(
    (proposalId: string) => {
      setChatMessages((prev) =>
        markManualChatProposalDecision(prev, 'listingCreateRequests', proposalId, 'rejected')
      )
    },
    [setChatMessages]
  )

  return {
    handleApproveValuationRun,
    handleRejectValuationRun,
    handleApproveReportGeneration,
    handleRejectReportGeneration,
    handleApproveSellabilityRun,
    handleRejectSellabilityRun,
    handleApproveListingCreate,
    handleRejectListingCreate,
  }
}
