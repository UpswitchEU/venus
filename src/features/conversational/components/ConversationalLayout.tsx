/**
 * ConversationalLayout Component
 *
 * Main layout component for conversational valuation flow.
 * Single Responsibility: Layout orchestration and UI state management.
 *
 * @module features/conversational/components/ConversationalLayout
 */

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { AssetInspector } from '../../../components/debug/AssetInspector'
import { FullScreenModal } from '../../../components/FullScreenModal'
import { LoadingState } from '../../../components/LoadingState'
import { useLoadingSteps } from '../../../hooks/useLoadingSteps'
import { ResizableDivider } from '../../../components/ResizableDivider'
import { ValuationToolbar } from '../../../components/ValuationToolbar'
import { MOBILE_BREAKPOINT } from '../../../constants/panelConstants'
import { useAuth } from '../../../hooks/useAuth'
import { useBootstrapSync } from '../../../hooks/useBootstrapSync'
import { useConversationalToolbar } from '../../../hooks/useConversationalToolbar'
import { usePanelResize } from '../../../hooks/usePanelResize'
import { useReportIdTracking } from '../../../hooks/useReportIdTracking'
import { useToast } from '../../../hooks/useToast'
import { conversationAPI } from '../../../services/api/conversation/ConversationAPI'
// AUTH-FIRST: guestCreditService removed - authentication is required
import {
  useConversationalChatStore,
  useConversationalResultsStore,
} from '../../../store/conversational'
import { useSessionStore } from '../../../store/useSessionStore'
import type { Message } from '../../../types/message'
import type { ValuationResponse } from '../../../types/valuation'
import { chatLogger } from '../../../utils/logger'
import { CreditGuard } from '../../auth/components/CreditGuard'
import {
  ConversationProvider,
  useConversationActions,
  useConversationState,
} from '../context/ConversationContext'
import { useConversationRestoration } from '../hooks'
import {
  generateImportSummaryMessage,
  shouldGenerateImportSummary,
} from '../utils/generateImportSummary'
import { BusinessProfileSection } from './BusinessProfileSection'
import { ConversationPanel } from './ConversationPanel'
import { ErrorDisplay } from './ErrorDisplay'
import { MobilePanelSwitcher } from './MobilePanelSwitcher'
import { ReportPanel } from './ReportPanel'

// Chat skeleton component
const ChatSkeleton: React.FC = () => (
  <div className="flex flex-col h-full p-4 space-y-4">
    <div className="flex items-start space-x-2">
      <div className="w-8 h-8 rounded-full bg-zinc-700 animate-pulse" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-zinc-700 rounded w-3/4 animate-pulse" />
        <div className="h-4 bg-zinc-700 rounded w-1/2 animate-pulse" />
      </div>
    </div>
    <div className="flex items-start space-x-2 justify-end">
      <div className="flex-1 space-y-2 items-end flex flex-col">
        <div className="h-4 bg-zinc-700 rounded w-2/3 animate-pulse" />
        <div className="h-4 bg-zinc-700 rounded w-1/2 animate-pulse" />
      </div>
      <div className="w-8 h-8 rounded-full bg-zinc-700 animate-pulse" />
    </div>
  </div>
)

/**
 * Conversational Layout Component Props
 */
interface ConversationalLayoutProps {
  /** Unique report identifier for the conversation session */
  reportId: string
  /** Callback when conversational valuation completes */
  onComplete: (result: ValuationResponse) => void
  /** Optional initial query to start the conversation */
  initialQuery?: string | null
  /** Whether to automatically send the initial query */
  autoSend?: boolean
  /** Initial version to load (M&A workflow) */
  initialVersion?: number
  /** Initial mode (edit/view) */
  initialMode?: 'edit' | 'view'
}

/**
 * Inner ConversationalLayout Component (wrapped by Provider)
 */
const ConversationalLayoutInner: React.FC<ConversationalLayoutProps> = ({
  reportId,
  onComplete,
  initialQuery = null,
  autoSend = false,
  initialVersion,
  initialMode = 'edit',
}) => {
  const { user } = useAuth()
  
  // WORLD CLASS: Sync bootstrap state with stores for unified initialization
  useBootstrapSync()
  
  const state = useConversationState()
  const actions = useConversationActions()
  const { showToast } = useToast()

  // Use Conversational Flow isolated stores
  const { isCalculating, error, result, setResult, clearError } = useConversationalResultsStore()
  const { collectedData, updateCollectedData } = useConversationalChatStore()

  // Unified session store
  // ROOT CAUSE FIX: Only subscribe to primitive values, not entire session object
  // This prevents re-renders when session data updates
  const isSaving = useSessionStore((state) => state.isSaving)
  const lastSaved = useSessionStore((state) => state.lastSaved)
  const hasUnsavedChanges = useSessionStore((state) => state.hasUnsavedChanges)
  const syncError = useSessionStore((state) => state.errorMessage)

  // ✅ WORLD CLASS: Loading is handled upstream by ValuationSessionManager
  // This component only renders when ValuationSessionManager stage is 'data-entry' (session is ready)
  // These checks are safety guards that should never trigger in normal flow
  // ValuationSessionManager ensures session is ready before rendering ValuationFlow
  // ROOT CAUSE FIX: Subscribe to `status` directly, not computed getters
  // Zustand subscriptions don't trigger re-renders with getters - must subscribe to actual state
  const status = useSessionStore((state) => state.status)
  const isLoading = status === 'loading'
  const isInitializing = status === 'idle' || status === 'loading'
  const session = useSessionStore((state) => state.session)

  // ✅ WORLD CLASS: Use centralized hook to determine loading steps based on bootstrap mode
  // Automatically selects RESTORATION_STEPS for existing reports, INITIALIZATION_STEPS for new reports
  const loadingSteps = useLoadingSteps()

  // ✅ SAFETY GUARD: Show loading state if session is not ready (should never happen in normal flow)
  // ValuationSessionManager handles all loading states upstream - this is a defensive check only
  if (isLoading || isInitializing || !session || session.reportId !== reportId) {
    // BANK GRADE: White background with sage green loader
    // Different steps for new vs existing reports (handled by useLoadingSteps hook)
    return <LoadingState steps={loadingSteps} variant="light" />
  }

  // ✅ FIX: Show error state if session failed to load
  if (syncError) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="max-w-md mx-auto text-center">
          <div className="bg-rust-500/20 border border-rust-500/30 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-rust-400 mb-2">Session Error</h3>
            <p className="text-rust-300 mb-6">{syncError}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-rust-600 hover:bg-rust-700 text-white rounded-lg transition-colors font-medium"
            >
              Reload Page
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ✅ NEW: Track unsaved changes to determine if toast should show
  // ✅ FIX: Use a ref to track the last known unsaved changes state
  // This is updated reactively, and the callback reads it when invoked
  const lastUnsavedChangesRef = useRef<boolean>(false)

  // ✅ NEW: Update ref when hasUnsavedChanges changes
  // This ensures we always have the latest state when the callback is invoked
  useEffect(() => {
    lastUnsavedChangesRef.current = hasUnsavedChanges
  }, [hasUnsavedChanges])

  // ✅ NEW: Set up save success callback to show toast only when actual saves happen
  useEffect(() => {
    // Set up callback that will be called when saveSession completes (for 'user' saves only)
    useSessionStore.setState({
      onSaveSuccess: () => {
        // ✅ FIX: Check if we're still initializing (prevents toasts during auto-fill/setup)
        const isInitializing = useSessionStore.getState().isInitializing
        if (isInitializing) {
          // Skip toast during initialization phase (auto-fill, restoration, etc.)
          return
        }

        // ✅ FIX: Read ref value when callback is invoked
        // Since we update the ref reactively, this captures the state from before save started
        // (The saveSession function sets hasUnsavedChanges to false AFTER save completes,
        // so the ref will still have the "before save" value when callback is invoked)
        if (lastUnsavedChangesRef.current) {
          showToast('Valuation saved successfully', 'success', 3000)
        }
      },
      // ✅ NEW: Set up asset save success callback (when valuation assets are saved after CTA click)
      onAssetSaveSuccess: () => {
        // ✅ FIX: Check if we're still initializing (prevents toasts during auto-fill/setup)
        const isInitializing = useSessionStore.getState().isInitializing
        if (isInitializing) {
          return
        }
        // Show toast when valuation assets are saved (after calculation completes)
        showToast('Valuation saved successfully', 'success', 3000)
      },
    })

    return () => {
      // Clean up callbacks on unmount
      useSessionStore.setState({
        onSaveSuccess: undefined,
        onAssetSaveSuccess: undefined,
      })
    }
  }, [showToast])

  // ✅ WORLD-CLASS ARCHITECTURE: Session restoration is now handled centrally by SessionRestorationService
  // The restoration happens atomically in useSessionStore.loadSession() after session is fetched
  // This component only renders - it does NOT restore valuation results/HTML
  // 
  // Previous restoration code removed:
  // - Result restoration useEffect (valuation results, HTML reports)
  // - HTML report subscription useEffect
  //
  // All restoration is now handled by:
  // 1. SessionRestorationService.restore() - called from useSessionStore.loadSession()
  // 2. SessionNormalizer - handles all naming conversions (camelCase/snake_case)
  // 3. Atomic store hydration - all stores updated synchronously
  //
  // Conversation-specific restoration (chat messages) is still handled by useConversationRestoration hook below

  // Restore conversation from Python backend
  // FIX: Use refs to stabilize callbacks and prevent infinite loops
  const actionsRef = useRef(actions)
  actionsRef.current = actions // Always keep ref up to date

  const reportIdRef = useRef(reportId)
  reportIdRef.current = reportId // Always keep ref up to date

  const restoration = useConversationRestoration({
    sessionId: reportId,
    enabled: true,
    onRestored: useCallback(
      (messages: import('../../../types/message').Message[], pythonSessionId: string | null) => {
        chatLogger.info('Conversation restored in ConversationalLayout', {
          reportId: reportIdRef.current,
          messageCount: messages.length,
          pythonSessionId,
        })
        actionsRef.current.setMessages(messages)
        if (pythonSessionId) {
          actionsRef.current.setPythonSessionId(pythonSessionId)
        }
        actionsRef.current.setRestored(true)
        actionsRef.current.setInitialized(true)

        // ✅ FIX: Mark session as saved after restoration completes
        // Restored messages are already saved, so session should show "Saved"
        useSessionStore.getState().markSaved()
        chatLogger.info('[Conversational] Session marked as saved after restoration', {
          reportId: reportIdRef.current,
          messageCount: messages.length,
        })
      },
      [] // Empty deps - use refs instead
    ),
    onError: useCallback(
      (error: string) => {
        chatLogger.error('Failed to restore conversation', { reportId: reportIdRef.current, error })
        actionsRef.current.setError(error)
        actionsRef.current.setRestored(true)
        actionsRef.current.setInitialized(true)
      },
      [] // Empty deps - use refs instead
    ),
  })

  // ✅ FIX: Only mark as unsaved when user adds new messages, not during restoration
  // Track initial message count to distinguish restoration from user input
  const initialMessageCountRef = useRef<number | null>(null)
  const isRestoringRef = useRef(false)

  // Track restoration state and set initial message count
  useEffect(() => {
    if (restoration.state.isRestoring) {
      isRestoringRef.current = true
    } else if (restoration.state.isRestored && isRestoringRef.current) {
      // Restoration just completed
      isRestoringRef.current = false
      initialMessageCountRef.current = state.messages.length
    }
  }, [restoration.state.isRestoring, restoration.state.isRestored, state.messages.length])

  // Mark conversation changes as unsaved (for save status indicator)
  // ✅ FIX: Only mark as unsaved if messages increased beyond initial restored count
  // Skip during restoration to prevent false positives
  useEffect(() => {
    // Skip if currently restoring
    if (restoration.state.isRestoring || isRestoringRef.current) {
      return
    }

    // Skip if restoration hasn't completed yet (initialMessageCountRef is null)
    if (!restoration.state.isRestored || initialMessageCountRef.current === null) {
      return
    }

    // Only mark as unsaved if user added new messages (beyond restored messages)
    if (state.messages.length > initialMessageCountRef.current) {
      useSessionStore.getState().markUnsaved()
      chatLogger.debug('[Conversational] Marked as unsaved - new user messages', {
        reportId,
        initialCount: initialMessageCountRef.current,
        currentCount: state.messages.length,
      })
    } else if (
      state.messages.length === initialMessageCountRef.current &&
      state.messages.length > 0
    ) {
      // Messages match restored count - ensure we're marked as saved
      // This handles the case where messages were restored but we're not showing unsaved
      const currentState = useSessionStore.getState()
      if (currentState.hasUnsavedChanges) {
        useSessionStore.getState().markSaved()
        chatLogger.debug('[Conversational] Marked as saved - messages match restored count', {
          reportId,
          messageCount: state.messages.length,
        })
      }
    }
  }, [state.messages.length, restoration.state.isRestoring, restoration.state.isRestored, reportId])

  // Custom hooks for modular responsibilities
  const { leftPanelWidth, handleResize } = usePanelResize()
  const toolbar = useConversationalToolbar({
    reportId,
    restoration,
    actions,
    state,
    result,
  })

  // UI State
  const [isMobile, setIsMobile] = useState(false)
  const [mobileActivePanel, setMobileActivePanel] = useState<'chat' | 'preview'>('chat')
  const [showPreConversationSummary, setShowPreConversationSummary] = useState(false)

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Sync valuation result from conversation context to results store
  useEffect(() => {
    if (state.valuationResult) {
      setResult(state.valuationResult)
    }
  }, [state.valuationResult, setResult])

  // Sync restored messages to conversation context
  useEffect(() => {
    if (restoration.state.messages.length > 0 && state.messages.length === 0) {
      actions.setMessages(restoration.state.messages)
    }
    if (restoration.state.pythonSessionId && !state.pythonSessionId) {
      actions.setPythonSessionId(restoration.state.pythonSessionId)
    }
  }, [
    restoration.state.messages.length,
    restoration.state.pythonSessionId,
    state.messages.length,
    state.pythonSessionId,
    actions,
  ])

  // Generate import summary when switching from manual → conversational with data
  // Failproof: Comprehensive error handling and validation
  const hasGeneratedSummaryRef = useRef(false)
  useEffect(() => {
    // Failproof: Validate all prerequisites
    if (!reportId) {
      return
    }

    // Only run after restoration is complete
    if (!restoration.state.isRestored) {
      return
    }

    // Only run once per report
    if (hasGeneratedSummaryRef.current) {
      return
    }

    // Read session from store inside effect to avoid dependency on session object
    const currentSession = useSessionStore.getState().session
    if (!currentSession) {
      chatLogger.debug('Skipping import summary: session not available', { reportId })
      return
    }

    // Check if we should generate an import summary
    const sessionData = currentSession.sessionData
    if (!sessionData) {
      chatLogger.debug('Skipping import summary: no session data', { reportId })
      return
    }

    // FIX: Prevent duplicate import summary when ConversationSummaryBlock is shown
    // ConversationSummaryBlock is shown when there are restored messages and collected data
    // If summary block is displayed, skip generating the import summary message
    const hasRestoredMessages = state.messages.length > 0
    const hasCollectedData =
      sessionData && typeof sessionData === 'object' && Object.keys(sessionData).length > 0
    const wouldShowSummaryBlock =
      hasRestoredMessages && hasCollectedData && restoration.state.isRestored

    if (wouldShowSummaryBlock) {
      chatLogger.debug('Skipping import summary: ConversationSummaryBlock is displayed', {
        reportId,
        hasRestoredMessages,
        hasCollectedData,
        isRestored: restoration.state.isRestored,
      })
      return
    }

    try {
      if (shouldGenerateImportSummary(sessionData, state.messages)) {
        chatLogger.info('Generating import summary for manual → conversational switch', {
          reportId,
          hasCompanyName: !!sessionData?.company_name,
          hasRevenue: !!sessionData?.current_year_data?.revenue,
        })

        // Generate summary message with unique ID
        const messageId = `import_summary_${Date.now()}_${Math.random().toString(36).substring(7)}`

        // Failproof: Wrap in try-catch
        let summaryMessagePartial
        try {
          summaryMessagePartial = generateImportSummaryMessage(sessionData)
        } catch (error) {
          chatLogger.error('Failed to generate import summary message', {
            reportId,
            error: error instanceof Error ? error.message : String(error),
          })
          return // Don't proceed if generation fails
        }

        const summaryMessage: Message = {
          ...summaryMessagePartial,
          id: messageId,
          timestamp: new Date(),
        }

        // Failproof: Validate message before adding
        if (!summaryMessage.content || !summaryMessage.type) {
          chatLogger.warn('Invalid summary message generated, skipping', {
            reportId,
            hasContent: !!summaryMessage.content,
            hasType: !!summaryMessage.type,
          })
          return
        }

        // Add to conversation
        try {
          actions.addMessage(summaryMessage)
        } catch (error) {
          chatLogger.error('Failed to add import summary message to conversation', {
            reportId,
            error: error instanceof Error ? error.message : String(error),
          })
          return // Don't proceed if adding fails
        }

        // Persist to database (non-blocking)
        if (reportId && summaryMessage.id && summaryMessage.content) {
          conversationAPI
            .saveMessage({
              reportId,
              messageId: summaryMessage.id,
              role: summaryMessage.role || 'assistant',
              type: summaryMessage.type,
              content: summaryMessage.content,
              metadata: summaryMessage.metadata || {},
            })
            .catch((error) => {
              chatLogger.warn('Failed to persist import summary message', {
                reportId,
                messageId: summaryMessage.id,
                error: error instanceof Error ? error.message : String(error),
              })
              // Don't throw - persistence failure shouldn't break UI
            })
        }

        hasGeneratedSummaryRef.current = true
      }
    } catch (error) {
      // Failproof: Never let import summary generation break the app
      chatLogger.error('Unexpected error generating import summary', {
        reportId,
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      })
      // Continue execution - don't break the flow
    }
  }, [
    restoration.state.isRestored,
    reportId, // ROOT CAUSE FIX: Only depend on reportId prop, read sessionData inside effect
    state.messages.length,
    actions,
  ])

  // Reset summary generation flag when reportId changes
  useEffect(() => {
    hasGeneratedSummaryRef.current = false
  }, [reportId])

  // Track reportId changes and reset when needed
  useReportIdTracking({
    reportId,
    onReportIdChange: useCallback(
      (isNewReport) => {
        if (!isNewReport) {
          // Same reportId - just ensure session ID is set
          if (state.sessionId !== reportId) {
            actions.setSessionId(reportId)
          }
          return
        }

        // Don't reset if restoration is in progress
        if (restoration.state.isRestoring || restoration.state.isRestored) {
          chatLogger.debug('Skipping reset - restoration in progress or already restored', {
            reportId,
            isRestoring: restoration.state.isRestoring,
            isRestored: restoration.state.isRestored,
          })
          return
        }

        // Reset for new report
        restoration.reset()
        actions.setMessages([])
        actions.setValuationResult(null)
        actions.setGenerating(false)
        actions.setError(null)
        actions.setRestored(false)
        actions.setInitialized(false)
        actions.setPythonSessionId(null)
        actions.setSessionId(reportId)
      },
      [reportId, state.sessionId, restoration, actions]
    ),
  })

  // Handle Python session ID updates from conversation
  const handlePythonSessionIdReceived = useCallback(
    (sessionId: string) => {
      chatLogger.info('Python session ID received, updating conversation state', {
        sessionId,
        reportId,
      })
      actions.setPythonSessionId(sessionId)
    },
    [actions, reportId]
  )

  // Handle valuation completion
  const handleValuationComplete = useCallback(
    async (result: ValuationResponse) => {
      try {
        actions.setValuationResult(result)
        actions.setGenerating(false)

        // Store in results store (Conversational flow)
        setResult(result)

        // Call parent completion handler (may be async)
        await onComplete(result)

        // Mark as saved in unified store
        useSessionStore.getState().markSaved()

        // AUTH-FIRST: Guest credit tracking removed - backend handles credits
      } catch (error) {
        chatLogger.error('[Conversational] Completion handler failed', {
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
    [actions, onComplete, user, setResult]
  )

  // AUTH-FIRST: All users are authenticated - backend handles credit checks
  const hasCredits = true

  // Determine generating state (from API store or conversation context)
  const isGeneratingState = isCalculating || state.isGenerating

  return (
    <CreditGuard
      hasCredits={hasCredits}
      isBlocked={false}
      showOutOfCreditsModal={false}
      onCloseModal={() => {}}
      onSignUp={() => {
        chatLogger.info('User clicked sign up from out of credits modal')
      }}
      onTryManual={() => {
        chatLogger.info('User clicked try manual flow from out of credits modal')
      }}
    >
      <div className="flex flex-col h-full overflow-hidden">
        {/* Client Context Banner is rendered in root layout - no need to duplicate here */}

        {/* Toolbar (Save Status integrated inside toolbar) */}
        <ValuationToolbar
          onRefresh={toolbar.handleRefresh}
          onDownload={toolbar.handleDownload}
          onFullScreen={toolbar.handleOpenFullscreen}
          isGenerating={isGeneratingState || toolbar.isDownloading}
          user={user}
          valuationName="Valuation"
          valuationId={result?.valuation_id || state.valuationResult?.valuation_id}
          activeTab={toolbar.activeTab}
          onTabChange={(tab: 'preview' | 'info' | 'history') => {
            toolbar.handleTabChange(tab)
          }}
          companyName={state.businessProfile?.company_name || result?.company_name}
        />

        {/* Error Display - Show both conversation context errors and API errors */}
        <ErrorDisplay error={state.error || error || null} />

        {/* Business Profile Section */}
        <BusinessProfileSection
          showPreConversationSummary={showPreConversationSummary}
          onTogglePreConversationSummary={() => setShowPreConversationSummary(false)}
        />

        {/* Split Panel */}
        <div
          className="flex flex-col lg:flex-row flex-1 overflow-hidden mx-4 my-4 rounded-lg border border-zinc-800"
          style={{ transition: 'width 150ms ease-out' }}
        >
          {/* Left Panel: Chat */}
          <div
            className={`${
              isMobile ? (mobileActivePanel === 'chat' ? 'w-full' : 'hidden') : ''
            } h-full flex flex-col bg-zinc-900 border-r border-zinc-800 w-full lg:w-auto`}
            style={{
              width: isMobile ? '100%' : `${leftPanelWidth}%`,
            }}
          >
            <div className="flex-1 overflow-y-auto">
              <Suspense fallback={<ChatSkeleton />}>
                <ConversationPanel
                  sessionId={state.sessionId || reportId}
                  userId={user?.id}
                  restoredMessages={
                    restoration.state.messages.length > 0
                      ? restoration.state.messages.filter(
                          (m: import('../../../types/message').Message) => m.isComplete
                        )
                      : state.messages.filter(
                          (m: import('../../../types/message').Message) => m.isComplete
                        )
                  }
                  isRestoring={restoration.state.isRestoring}
                  isRestorationComplete={restoration.state.isRestored && state.isRestored}
                  isSessionInitialized={restoration.state.isRestored && state.isInitialized}
                  pythonSessionId={restoration.state.pythonSessionId || state.pythonSessionId}
                  onPythonSessionIdReceived={handlePythonSessionIdReceived}
                  onValuationComplete={handleValuationComplete}
                  onValuationStart={() => actions.setGenerating(true)}
                  onReportUpdate={() => {}}
                  onDataCollected={(data) => {
                    // Handle data collection - sync to form store
                    if (data.field && data.value !== undefined) {
                      chatLogger.debug('Data collected from conversational flow', {
                        field: data.field,
                        value: data.value,
                      })
                      // Data will be synced through StreamingChat's onDataCollected callback
                    }
                  }}
                  onValuationPreview={() => {}}
                  onCalculateOptionAvailable={() => {}}
                  onProgressUpdate={() => {}}
                  onReportSectionUpdate={() => {}}
                  onSectionLoading={() => {}}
                  onSectionComplete={() => {}}
                  onReportComplete={() => {}}
                  onContextUpdate={() => {}}
                  onHtmlPreviewUpdate={() => {}}
                  initialMessage={initialQuery}
                  autoSend={autoSend}
                />
              </Suspense>
            </div>
          </div>

          {/* Resizable Divider */}
          <ResizableDivider
            onResize={handleResize}
            leftWidth={leftPanelWidth}
            isMobile={isMobile}
          />

          {/* Right Panel: Report Display */}
          <div
            className={`${
              isMobile ? (mobileActivePanel === 'preview' ? 'w-full' : 'hidden') : ''
            } h-full min-h-[400px] lg:min-h-0 w-full lg:w-auto border-t lg:border-t-0 border-zinc-800`}
            style={{ width: isMobile ? '100%' : `${100 - leftPanelWidth}%` }}
          >
            <ReportPanel
              reportId={reportId}
              activeTab={toolbar.activeTab}
              onTabChange={toolbar.handleTabChange}
              isCalculating={isGeneratingState}
              error={error}
              result={result || state.valuationResult || null}
              onClearError={clearError}
            />
          </div>
        </div>

        {/* Mobile Panel Switcher */}
        {isMobile && (
          <MobilePanelSwitcher
            activePanel={mobileActivePanel}
            onPanelChange={setMobileActivePanel}
          />
        )}

        {/* Full Screen Modal */}
        <FullScreenModal
          isOpen={toolbar.isFullScreen}
          onClose={toolbar.handleCloseFullscreen}
          title="Valuation - Full Screen"
        >
          <ReportPanel
            reportId={reportId}
            className="h-full"
            activeTab={toolbar.activeTab}
            onTabChange={toolbar.handleTabChange}
            isCalculating={isGeneratingState}
            error={error}
            result={result || state.valuationResult || null}
            onClearError={clearError}
          />
        </FullScreenModal>

        {/* Asset Inspector (dev only) */}
        <AssetInspector />
      </div>
    </CreditGuard>
  )
}

/**
 * Conversational Layout Component (with Provider wrapper)
 *
 * Orchestrates the main layout for conversational valuation with AI-guided data collection.
 * Provides a chat-like interface for natural business valuation conversations.
 */
export const ConversationalLayout: React.FC<ConversationalLayoutProps> = React.memo(
  ({
    reportId,
    onComplete,
    initialQuery = null,
    autoSend = false,
    initialVersion,
    initialMode = 'edit',
  }) => {
    // Use key prop to force remount when reportId changes
    // This ensures clean state for each new report
    return (
      <ConversationProvider key={reportId} initialSessionId={reportId}>
        <ConversationalLayoutInner
          reportId={reportId}
          onComplete={onComplete}
          initialQuery={initialQuery}
          autoSend={autoSend}
          initialVersion={initialVersion}
          initialMode={initialMode}
        />
      </ConversationProvider>
    )
  }
)

ConversationalLayout.displayName = 'ConversationalLayout'
