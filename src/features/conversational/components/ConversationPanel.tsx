/**
 * ConversationPanel Component
 *
 * Single Responsibility: Wrapper around StreamingChat with error boundary and context integration
 * SOLID Principles: SRP - Only handles chat UI wrapper and error handling
 *
 * @module features/conversational/components/ConversationPanel
 */

import React, { useCallback, useMemo, useState } from 'react'
import { NormalizationModal } from '../../../components/normalization/NormalizationModal'
import { StreamingChat } from '../../../components/StreamingChat'
import { reportService, valuationService } from '../../../services'
import { valuationAuditService } from '../../../services/audit/ValuationAuditService'
import {
  useConversationalChatStore,
  useConversationalResultsStore,
} from '../../../store/conversational'
import { useEbitdaNormalizationStore } from '../../../store/useEbitdaNormalizationStore'
import { useSessionStore } from '../../../store/useSessionStore'
import { useVersionHistoryStore } from '../../../store/useVersionHistoryStore'
import type { Message } from '../../../types/message'
import type { ValuationResponse } from '../../../types/valuation'
import { buildValuationRequest } from '../../../utils/buildValuationRequest'
import { chatLogger, generalLogger } from '../../../utils/logger'
import { snapshotNormalizationsToVersion } from '../../../utils/normalizationSnapshot'
import {
  areChangesSignificant,
  detectVersionChanges,
  generateAutoLabel,
} from '../../../utils/versionDiffDetection'
import { ComponentErrorBoundary } from '../../shared/components/ErrorBoundary'
import { useConversationActions, useConversationState } from '../context/ConversationContext'
import { ConversationSummaryBlock } from './ConversationSummaryBlock'

/**
 * ConversationPanel Props
 */
export interface ConversationPanelProps {
  sessionId: string
  userId?: string
  restoredMessages?: Message[]
  isRestoring?: boolean
  isRestorationComplete?: boolean
  isSessionInitialized?: boolean
  pythonSessionId?: string | null
  onPythonSessionIdReceived?: (pythonSessionId: string) => void
  onValuationComplete?: (result: ValuationResponse) => void
  onValuationStart?: () => void
  onReportUpdate?: (htmlContent: string, progress: number) => void
  onDataCollected?: (data: { field: string; value: unknown }) => void
  onValuationPreview?: (data: unknown) => void
  onCalculateOptionAvailable?: (data: unknown) => void
  onProgressUpdate?: (data: unknown) => void
  onReportSectionUpdate?: (
    section: string,
    html: string,
    phase: number,
    progress: number,
    is_fallback?: boolean,
    is_error?: boolean,
    error_message?: string
  ) => void
  onSectionLoading?: (section: string, html: string, phase: number, data?: unknown) => void
  onSectionComplete?: (event: {
    sectionId: string
    sectionName: string
    html: string
    progress: number
    phase?: number
  }) => void
  onReportComplete?: (html: string, valuationId: string) => void
  onContextUpdate?: (context: unknown) => void
  onHtmlPreviewUpdate?: (html: string, previewType: string) => void
  initialMessage?: string | null
  autoSend?: boolean
}

/**
 * ConversationPanel Component
 *
 * Wraps StreamingChat component with error boundary and connects to ConversationContext.
 * Handles data collection callbacks and syncs to valuation stores.
 */
export const ConversationPanel: React.FC<ConversationPanelProps> = ({
  sessionId,
  userId,
  restoredMessages = [],
  isRestoring = false,
  isRestorationComplete = false,
  isSessionInitialized = false,
  pythonSessionId,
  onPythonSessionIdReceived,
  onValuationComplete,
  onValuationStart,
  onReportUpdate,
  onDataCollected,
  onValuationPreview,
  onCalculateOptionAvailable,
  onProgressUpdate,
  onReportSectionUpdate,
  onSectionLoading,
  onSectionComplete,
  onReportComplete,
  onContextUpdate,
  onHtmlPreviewUpdate,
  initialMessage = null,
  autoSend = false,
}) => {
  const state = useConversationState()
  const actions = useConversationActions()
  const { updateCollectedData } = useConversationalChatStore()

  // Normalization state
  const [showNormalizationModal, setShowNormalizationModal] = useState(false)
  const [selectedNormalizationYear, setSelectedNormalizationYear] = useState<number | null>(null)

  // Handle data collection - sync to conversational chat store
  const handleDataCollected = useCallback(
    (data: { field: string; value: unknown }) => {
      chatLogger.debug('[Conversational] Data collected', {
        field: data.field,
        value: data.value,
      })

      // Sync to conversational chat store if field and value are present
      // Note: StreamingChat manages its own collectedData state internally
      // This callback is for external notification, but we can also sync here if needed
      if (data.field && data.value !== undefined) {
        // Call parent callback (used by ConversationalLayout for logging)
        onDataCollected?.(data)

        // Update collected data in conversational store
        updateCollectedData({ [data.field]: data.value })
      }
    },
    [onDataCollected, updateCollectedData]
  )

  // Handle valuation complete - sync to context and conversational results store
  const { isCalculating, setResult, trySetCalculating, setCalculating } =
    useConversationalResultsStore()
  // ROOT CAUSE FIX: Only subscribe to reportId, not entire session object
  const reportId = useSessionStore((state) => state.session?.reportId)
  const { createVersion, getLatestVersion } = useVersionHistoryStore()

  const handleValuationComplete = useCallback(
    async (result: ValuationResponse) => {
      chatLogger.info('ConversationPanel: Valuation complete', {
        valuationId: result.valuation_id,
        hasHtmlReport: !!result.html_report,
        htmlReportLength: result.html_report?.length || 0,
        hasInfoTabHtml: !!result.info_tab_html,
        infoTabHtmlLength: result.info_tab_html?.length || 0,
      })

      // ✅ FIX: Merge HTML reports from store if missing from result
      // HTML reports might arrive via stream events before valuation_complete
      const currentResult = useConversationalResultsStore.getState().result
      const resultWithHtml = {
        ...result,
        html_report: result.html_report || currentResult?.html_report,
        info_tab_html: result.info_tab_html || currentResult?.info_tab_html,
      }

      // Update conversation context
      actions.setValuationResult(resultWithHtml)
      actions.setGenerating(false)

      // Sync to results store (same as manual flow)
      setResult(resultWithHtml)

      // CRITICAL: Save complete session atomically (using unified store)
      // Uses sessionService for consistency across flows
      const sessionStore = useSessionStore.getState()

      if (reportId) {
        try {
          // Get collected data from session for restoration
          const sessionData = sessionStore.session?.sessionData || {}
          const sessionName = sessionStore.session?.name // Get name from session

          // ATOMIC SAVE: Save complete package in single API call
          // - sessionData: Collected data from conversation for restoration
          // - valuationResult: Calculation result
          // - htmlReport: Main report HTML
          // - infoTabHtml: Info tab HTML
          // - name: Custom valuation name (e.g., "Amadeus report")
          await reportService.saveReportAssets(reportId, {
            sessionData: sessionData, // ✅ NEW: Include collected data
            valuationResult: resultWithHtml,
            htmlReport: resultWithHtml.html_report || '',
            infoTabHtml: resultWithHtml.info_tab_html || '',
            name: sessionName, // ✅ NEW: Include custom valuation name
          })

          chatLogger.info('[Conversational] Complete report package saved atomically', {
            reportId,
            hasSessionData: !!sessionData,
            sessionDataKeys: sessionData ? Object.keys(sessionData) : [],
            hasResult: !!resultWithHtml,
            hasHtmlReport: !!resultWithHtml.html_report,
            htmlReportLength: resultWithHtml.html_report?.length || 0,
            hasInfoTabHtml: !!resultWithHtml.info_tab_html,
            infoTabHtmlLength: resultWithHtml.info_tab_html?.length || 0,
          })

          sessionStore.markSaved()
        } catch (error) {
          chatLogger.error('[Conversational] Failed to save complete report package', {
            reportId,
            error: error instanceof Error ? error.message : String(error),
          })
          // Error handled by store
        }
      } else {
        sessionStore.markSaved()
      }

      // M&A Workflow: Create new version if this is a regeneration (conversational flow)
      // reportId is already available from selector above
      if (reportId) {
        try {
          const previousVersion = getLatestVersion(reportId)

          // CRITICAL FIX: Get complete formData from session, not just result
          // The result only has calculated fields, but formData needs all input fields
          const sessionData = (useSessionStore.getState().session?.sessionData || {}) as any

          // Build complete formData from session + result
          // Session has the collected data, result has calculated/computed fields
          const resultAny = result as any
          const newFormData = {
            // From session (collected during conversation)
            company_name: sessionData.company_name || result.company_name || '',
            business_type: sessionData.business_type || '',
            business_type_id: sessionData.business_type_id || '',
            industry: sessionData.industry || resultAny.industry || '',
            business_model: sessionData.business_model || '',
            country_code: sessionData.country_code || resultAny.country_code || 'BE',
            founding_year: sessionData.founding_year || 0,
            number_of_employees: sessionData.number_of_employees || 0,
            number_of_owners: sessionData.number_of_owners || 0,
            shares_for_sale: sessionData.shares_for_sale || 100,
            recurring_revenue_percentage: sessionData.recurring_revenue_percentage || 0,

            // Financial data from session (preferred) or result
            current_year_data: {
              year: sessionData.current_year_data?.year || new Date().getFullYear(),
              revenue:
                sessionData.current_year_data?.revenue ||
                sessionData.revenue ||
                resultAny.revenue ||
                0,
              ebitda:
                sessionData.current_year_data?.ebitda ||
                sessionData.ebitda ||
                resultAny.ebitda ||
                0,
              net_income: sessionData.current_year_data?.net_income || 0,
              total_assets: sessionData.current_year_data?.total_assets || 0,
              total_debt: sessionData.current_year_data?.total_debt || 0,
              cash: sessionData.current_year_data?.cash || 0,
            },

            // Historical data if available
            historical_years_data: sessionData.historical_years_data || [],

            // Additional context
            business_description: sessionData.business_description || '',
            business_highlights: sessionData.business_highlights || '',
            reason_for_selling: sessionData.reason_for_selling || '',
            city: sessionData.city || '',
          } as any

          if (previousVersion) {
            const changes = detectVersionChanges(previousVersion.formData, newFormData)

            if (areChangesSignificant(changes)) {
              const newVersion = await createVersion({
                reportId,
                formData: newFormData,
                valuationResult: result,
                htmlReport: result.html_report || undefined,
                infoTabHtml: result.info_tab_html || undefined,
                changesSummary: changes,
                versionLabel: generateAutoLabel(previousVersion.versionNumber + 1, changes),
              })

              chatLogger.info('New version created on conversational valuation', {
                reportId,
                versionNumber: newVersion.versionNumber,
                versionLabel: newVersion.versionLabel,
                totalChanges: changes.totalChanges,
                significantChanges: changes.significantChanges,
              })

              // Log regeneration to audit trail
              valuationAuditService.logRegeneration(
                reportId,
                newVersion.versionNumber,
                changes,
                undefined // Duration not tracked in conversational flow
              )
            }
          } else {
            // First version - create it
            await createVersion({
              reportId,
              formData: newFormData,
              valuationResult: result,
              htmlReport: result.html_report || undefined,
              infoTabHtml: result.info_tab_html || undefined,
              changesSummary: { totalChanges: 0, significantChanges: [] },
              versionLabel: 'v1 - Initial valuation',
            })
          }
        } catch (versionError) {
          // Don't fail the valuation if versioning fails
          chatLogger.error('Failed to create version on conversational valuation', {
            reportId,
            error: versionError instanceof Error ? versionError.message : 'Unknown error',
          })
        }
      }

      // Call parent callback
      onValuationComplete?.(result)
    },
    [actions, onValuationComplete, setResult, reportId, getLatestVersion, createVersion]
  )

  // Handle valuation start
  const handleValuationStart = useCallback(() => {
    chatLogger.info('ConversationPanel: Valuation started')
    actions.setGenerating(true)
    onValuationStart?.()
  }, [actions, onValuationStart])

  // Handle Python session ID
  const handlePythonSessionIdReceived = useCallback(
    (newPythonSessionId: string) => {
      chatLogger.info('ConversationPanel: Python session ID received', {
        pythonSessionId: newPythonSessionId,
      })
      actions.setPythonSessionId(newPythonSessionId)
      onPythonSessionIdReceived?.(newPythonSessionId)
    },
    [actions, onPythonSessionIdReceived]
  )

  // Handle message complete - sync to context
  const handleMessageComplete = useCallback((message: Message) => {
    chatLogger.debug('ConversationPanel: Message complete', {
      messageId: message.id,
      type: message.type,
    })
    // Messages are managed by StreamingChat internally
    // We can add to context if needed for cross-component access
  }, [])

  // Get valuation data for summary block (Conversational flow)
  const valuationResult = useConversationalResultsStore((state) => state.result)

  // Determine if we should show summary block
  // ✅ FIX: Don't show summary block at top if there are messages (component will be inline)
  const showSummaryBlock = useMemo(() => {
    // Only show at top if NO messages exist (new conversation with data)
    // If messages exist, the summary will be rendered inline as a message component
    const hasRestoredMessages = restoredMessages && restoredMessages.length > 0
    if (hasRestoredMessages) {
      return false // Messages exist - summary will be inline
    }

    // Show if we have collected data but no messages yet
    const currentSession = useSessionStore.getState().session
    const hasCollectedData =
      currentSession?.sessionData && Object.keys(currentSession.sessionData).length > 0
    return hasCollectedData && isRestorationComplete
  }, [restoredMessages, reportId, isRestorationComplete]) // Depend on reportId instead of session

  // Calculate completion percentage
  const completionPercentage = useMemo(() => {
    // ROOT CAUSE FIX: Read session state via getState(), not as subscription
    const currentSession = useSessionStore.getState().session
    if (!currentSession?.sessionData) return 0

    const data = currentSession.sessionData as any
    let filledFields = 0
    const totalFields = 8 // Key fields we track

    if (data.company_name) filledFields++
    if (data.industry) filledFields++
    if (data.country_code) filledFields++
    if (data.current_year_data?.revenue || data.revenue) filledFields++
    if (data.current_year_data?.ebitda !== undefined || data.ebitda !== undefined) filledFields++
    if (data.business_type_id) filledFields++
    if (data.number_of_employees) filledFields++
    if (data.number_of_owners) filledFields++

    return Math.round((filledFields / totalFields) * 100)
  }, [reportId]) // Depend on reportId instead of session

  // Handle continue action
  const handleContinue = useCallback(() => {
    // Hide summary block and focus on input
    // Find and focus the textarea input
    const textarea = document.querySelector(
      'textarea[placeholder*="Ask about your business"]'
    ) as HTMLTextAreaElement
    if (textarea) {
      textarea.focus()
      // Scroll to bottom to show input
      const chatContainer = document.querySelector('[data-chat-container]')
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight
      }
    }
  }, [])

  // Handle view report action
  const handleViewReport = useCallback(() => {
    // Trigger report panel to show
    onReportComplete?.(valuationResult?.html_report || '', valuationResult?.valuation_id || '')
  }, [valuationResult, onReportComplete])

  // ROOT CAUSE FIX: Read session data via useMemo to avoid subscription
  const sessionDataForSummary = useMemo(() => {
    const currentSession = useSessionStore.getState().session
    return currentSession?.sessionData || {}
  }, [reportId])

  const completedAtForSummary = useMemo(() => {
    const currentSession = useSessionStore.getState().session
    return currentSession?.completedAt
  }, [reportId])

  // Handle manual calculate action (same as manual flow)
  const handleManualCalculate = useCallback(async () => {
    // ROOT CAUSE FIX: Read session state via getState(), not as subscription
    const currentSession = useSessionStore.getState().session
    if (!currentSession?.sessionData) {
      chatLogger.warn('[Conversational] Cannot calculate: no session data')
      return
    }

    // CRITICAL: Use atomic check-and-set (Conversational flow)
    const wasSet = trySetCalculating()
    if (!wasSet) {
      chatLogger.warn('[Conversational] Calculation already in progress')
      return
    }

    chatLogger.info('[Conversational] Loading state set atomically', { wasSet })

    try {
      chatLogger.info('[Conversational] Manual calculate triggered', {
        sessionId,
        hasSessionData: !!currentSession.sessionData,
      })

      // Mark conversation as generating
      actions.setGenerating(true)
      onValuationStart?.()

      // Build ValuationRequest from session data (same as manual flow)
      const sessionData = currentSession.sessionData as any
      const formData = {
        company_name: sessionData.company_name || '',
        industry: sessionData.industry || '',
        country_code: sessionData.country_code || 'BE',
        business_model: sessionData.business_model || '',
        founding_year: sessionData.founding_year || 0,
        revenue: sessionData.current_year_data?.revenue || sessionData.revenue || 0,
        ebitda: sessionData.current_year_data?.ebitda || sessionData.ebitda || 0,
        current_year_data: {
          year: sessionData.current_year_data?.year || new Date().getFullYear(),
          revenue: sessionData.current_year_data?.revenue || sessionData.revenue || 0,
          ebitda: sessionData.current_year_data?.ebitda || sessionData.ebitda || 0,
          net_income: sessionData.current_year_data?.net_income || 0,
          total_assets: sessionData.current_year_data?.total_assets || 0,
          total_debt: sessionData.current_year_data?.total_debt || 0,
          cash: sessionData.current_year_data?.cash || 0,
        },
        historical_years_data: sessionData.historical_years_data || [],
        number_of_employees: sessionData.number_of_employees || 0,
        number_of_owners: sessionData.number_of_owners || 0,
        recurring_revenue_percentage: sessionData.recurring_revenue_percentage || 0,
        comparables: sessionData.comparables || [],
        business_type_id: sessionData.business_type_id || '',
        business_type: sessionData.business_type || '',
        shares_for_sale: sessionData.shares_for_sale || 100,
        business_context: sessionData.business_context || '',
      } as any

      // Build request using unified function
      const request = buildValuationRequest(formData)
      ;(request as any).dataSource = 'ai-guided' // Conversational flow

      // Validate required fields
      if (
        !request.current_year_data?.revenue ||
        !request.current_year_data?.ebitda ||
        !request.industry ||
        !request.country_code
      ) {
        const missingFields = []
        if (!request.current_year_data?.revenue) missingFields.push('Revenue')
        if (!request.current_year_data?.ebitda) missingFields.push('EBITDA')
        if (!request.industry) missingFields.push('Industry')
        if (!request.country_code) missingFields.push('Country')

        chatLogger.warn('[Conversational] Cannot calculate: missing required fields', {
          missingFields,
        })
        actions.setError(`Please provide: ${missingFields.join(', ')}`)
        actions.setGenerating(false)
        setCalculating(false) // Reset on validation error
        return
      }

      // Calculate valuation using service (Conversational flow)
      const result = await valuationService.calculateValuation(request)

      if (result) {
        // Call handleValuationComplete directly (it's already defined above)
        await handleValuationComplete(result)
        // CRITICAL: Reset loading state after successful completion
        setCalculating(false)
        actions.setGenerating(false)
      } else {
        chatLogger.error('[Conversational] Manual calculate returned no result')
        actions.setError('Calculation failed')
        actions.setGenerating(false)
        setCalculating(false) // Reset on failure
      }
    } catch (error) {
      chatLogger.error('[Conversational] Manual calculate failed', { error })
      actions.setError(
        error instanceof Error
          ? `Calculation failed: ${error.message}`
          : 'Calculation failed. Please try again.'
      )
      actions.setGenerating(false)
      setCalculating(false) // Reset on error
    } finally {
      // CRITICAL: Always reset loading state, even if handleValuationComplete throws
      // This ensures the UI doesn't get stuck in loading state
      const finalState = useConversationalResultsStore.getState()
      if (finalState.isCalculating) {
        setCalculating(false)
        chatLogger.debug('[Conversational] Loading state reset in finally block')
      }
    }
  }, [
    reportId,
    sessionId,
    trySetCalculating,
    handleValuationComplete,
    actions,
    onValuationStart,
    setCalculating,
  ])

  // Handle opening normalization modal
  const handleOpenNormalization = useCallback(() => {
    generalLogger.info('[Conversational] Opening normalization modal', { sessionId })

    // Get session data to extract years
    const session = useSessionStore.getState().session
    if (!session?.sessionData) {
      generalLogger.warn('[Conversational] No session data for normalization')
      return
    }

    const sessionData = session.sessionData as any

    // Start with current year if available
    const currentYear = sessionData.current_year_data?.year || new Date().getFullYear()

    // For now, open modal for current year (multi-year support can be added later)
    setSelectedNormalizationYear(currentYear)
    setShowNormalizationModal(true)
  }, [sessionId])

  // Handle normalization modal close
  const handleCloseNormalization = useCallback(() => {
    setShowNormalizationModal(false)
    setSelectedNormalizationYear(null)
  }, [])

  // Handle recalculate valuation after normalization
  const handleRecalculateValuation = useCallback(async () => {
    try {
      generalLogger.info('[Conversational] Recalculating valuation with normalization', {
        sessionId,
      })

      // Get current session data
      const session = useSessionStore.getState().session
      if (!session) {
        generalLogger.error('[Conversational] No session for recalculation')
        return
      }

      // Get all normalizations
      const normalizations = useEbitdaNormalizationStore.getState().normalizations
      const hasNormalizations = Object.keys(normalizations).length > 0

      if (!hasNormalizations) {
        generalLogger.warn('[Conversational] No normalizations to recalculate')
        return
      }

      // Mark as generating
      actions.setGenerating(true)
      onValuationStart?.()
      const wasSet = trySetCalculating()

      if (!wasSet) {
        generalLogger.warn('[Conversational] Already calculating, skipping recalculate')
        return
      }

      // Build valuation request with normalized EBITDA
      const sessionData = session.sessionData as any
      const formData = {
        company_name: sessionData.company_name || '',
        industry: sessionData.industry || '',
        country_code: sessionData.country_code || 'BE',
        business_model: sessionData.business_model || '',
        founding_year: sessionData.founding_year || 0,
        revenue: sessionData.current_year_data?.revenue || sessionData.revenue || 0,
        ebitda: sessionData.current_year_data?.ebitda || sessionData.ebitda || 0,
        current_year_data: {
          year: sessionData.current_year_data?.year || new Date().getFullYear(),
          revenue: sessionData.current_year_data?.revenue || sessionData.revenue || 0,
          ebitda: sessionData.current_year_data?.ebitda || sessionData.ebitda || 0,
          net_income: sessionData.current_year_data?.net_income || 0,
          total_assets: sessionData.current_year_data?.total_assets || 0,
          total_debt: sessionData.current_year_data?.total_debt || 0,
          cash: sessionData.current_year_data?.cash || 0,
        },
        historical_years_data: sessionData.historical_years_data || [],
        number_of_employees: sessionData.number_of_employees || 0,
        number_of_owners: sessionData.number_of_owners || 0,
        recurring_revenue_percentage: sessionData.recurring_revenue_percentage || 0,
        comparables: sessionData.comparables || [],
        business_type_id: sessionData.business_type_id || '',
        business_type: sessionData.business_type || '',
        shares_for_sale: sessionData.shares_for_sale || 100,
        business_context: sessionData.business_context || '',
      } as any

      // Build request (buildValuationRequest will include normalized EBITDA)
      const request = buildValuationRequest(formData)
      ;(request as any).dataSource = 'ai-guided'

      // CRITICAL: Include reportId from session for version linking
      // This ensures versions are created correctly and linked to the session
      if (sessionId) {
        ;(request as any).reportId = sessionId
      }

      // Trigger valuation
      const result = await valuationService.calculateValuation(request)

      if (result) {
        // Get previous version for change detection
        if (!reportId) {
          throw new Error('Report ID is required for version creation')
        }

        const previousVersion = getLatestVersion(reportId)

        // Detect changes if previous version exists
        const changes = previousVersion
          ? detectVersionChanges(previousVersion.formData, formData)
          : { totalChanges: 0, significantChanges: [] }

        // Create new version with normalized EBITDA metadata
        const newVersion = await createVersion({
          reportId,
          formData,
          valuationResult: result,
          htmlReport: result.html_report || undefined,
          infoTabHtml: result.info_tab_html || undefined,
          changesSummary: changes,
          versionLabel: previousVersion
            ? generateAutoLabel(previousVersion.versionNumber + 1, changes)
            : 'v1 - Normalized EBITDA',
        })

        generalLogger.info('[Conversational] Created new version for normalization', {
          versionId: newVersion.id,
          versionNumber: newVersion.versionNumber,
        })

        // Snapshot normalizations to version (using shared utility - same as manual flow)
        await snapshotNormalizationsToVersion(sessionId, newVersion.id)

        generalLogger.info('[Conversational] Normalization snapshots created')

        // Update results store
        setResult(result)

        // Notify parent
        onValuationComplete?.(result)

        generalLogger.info('[Conversational] Recalculation complete with normalized EBITDA')

        // Reset states
        setCalculating(false)
        actions.setGenerating(false)
      } else {
        throw new Error('Recalculation returned no result')
      }
    } catch (error) {
      generalLogger.error('[Conversational] Recalculation failed', { error })
      actions.setError(
        error instanceof Error
          ? `Recalculation failed: ${error.message}`
          : 'Recalculation failed. Please try again.'
      )
      actions.setGenerating(false)
      setCalculating(false)
    }
  }, [
    sessionId,
    userId,
    reportId,
    onValuationComplete,
    onValuationStart,
    actions,
    trySetCalculating,
    createVersion,
    getLatestVersion,
    setResult,
    setCalculating,
  ])

  return (
    <ComponentErrorBoundary component="ConversationPanel">
      <div className="flex flex-col h-full">
        {/* Summary Block (shown at top when restoring existing session) */}
        {showSummaryBlock && (
          <div className="flex-shrink-0 p-4 overflow-y-auto">
            <ConversationSummaryBlock
              sessionId={sessionId}
              collectedData={sessionDataForSummary}
              completionPercentage={completionPercentage}
              calculatedAt={completedAtForSummary}
              valuationResult={valuationResult}
              onContinue={handleContinue}
              onViewReport={valuationResult ? handleViewReport : undefined}
              onNormalizeEbitda={handleOpenNormalization}
              onRecalculateValuation={handleRecalculateValuation}
            />
          </div>
        )}

        {/* Chat Interface */}
        <div className="flex-1 min-h-0">
          <StreamingChat
            sessionId={sessionId}
            userId={userId}
            initialMessages={restoredMessages}
            isRestoring={isRestoring}
            isRestorationComplete={isRestorationComplete}
            isSessionInitialized={isSessionInitialized}
            pythonSessionId={pythonSessionId ?? state.pythonSessionId}
            onPythonSessionIdReceived={handlePythonSessionIdReceived}
            onValuationComplete={handleValuationComplete}
            onValuationStart={handleValuationStart}
            onMessageComplete={handleMessageComplete}
            onReportUpdate={onReportUpdate}
            onDataCollected={handleDataCollected}
            onValuationPreview={onValuationPreview}
            onCalculateOptionAvailable={onCalculateOptionAvailable}
            onProgressUpdate={onProgressUpdate}
            onReportSectionUpdate={onReportSectionUpdate}
            onSectionLoading={onSectionLoading}
            onSectionComplete={onSectionComplete}
            onReportComplete={onReportComplete}
            onContextUpdate={onContextUpdate}
            onHtmlPreviewUpdate={onHtmlPreviewUpdate}
            onCalculate={handleManualCalculate}
            isCalculating={isCalculating || state.isGenerating}
            initialMessage={initialMessage}
            autoSend={autoSend}
            onContinueConversation={handleContinue}
            onViewReport={valuationResult ? handleViewReport : undefined}
            onNormalizeEbitda={handleOpenNormalization}
            onRecalculateValuation={handleRecalculateValuation}
          />
        </div>

        {/* Normalization Modal */}
        {showNormalizationModal && selectedNormalizationYear && (
          <NormalizationModal
            isOpen={showNormalizationModal}
            onClose={handleCloseNormalization}
            year={selectedNormalizationYear}
            sessionId={sessionId}
          />
        )}
      </div>
    </ComponentErrorBoundary>
  )
}
