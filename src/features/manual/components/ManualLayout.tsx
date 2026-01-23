/**
 * ManualLayout Component
 *
 * Main layout component for manual valuation flow.
 * Single Responsibility: Layout orchestration and UI state management.
 *
 * @module features/manual/components/ManualLayout
 */

import React, { Suspense, useEffect, useRef } from 'react'
import { AssetInspector } from '../../../components/debug/AssetInspector'
import { FullScreenModal } from '../../../components/FullScreenModal'
import { LoadingState } from '../../../components/LoadingState'
import { useLoadingSteps } from '../../../hooks/useLoadingSteps'
import { ResizableDivider } from '../../../components/ResizableDivider'
import { InputFieldsSkeleton } from '../../../components/skeletons'
import { ValuationForm } from '../../../components/ValuationForm'
import { ValuationToolbar } from '../../../components/ValuationToolbar'
import { useAuth } from '../../../hooks/useAuth'
import { useBootstrapSync } from '../../../hooks/useBootstrapSync'
import { useToast } from '../../../hooks/useToast'
import {
  useValuationToolbarFullscreen,
  useValuationToolbarTabs,
  type ValuationTab,
} from '../../../hooks/valuationToolbar'
import { useManualFormStore, useManualResultsStore } from '../../../store/manual'
import { useSessionStore } from '../../../store/useSessionStore'
import type { ValuationResponse } from '../../../types/valuation'
import { generalLogger } from '../../../utils/logger'
import { ReportPanel } from '../../conversational/components/ReportPanel'
import { useManualPanelResize, useManualToolbar } from '../hooks'
import { MobilePanelSwitcher } from './MobilePanelSwitcher'

/**
 * Manual Layout Component Props
 */
interface ManualLayoutProps {
  /** Unique report identifier */
  reportId: string
  /** Callback when manual valuation completes */
  onComplete: (result: ValuationResponse) => void
  /** Initial version to load (M&A workflow) */
  initialVersion?: number
  /** Initial mode (edit/view) */
  initialMode?: 'edit' | 'view'
  /** Initial tab to display (for Mercury integration - 'info' shows breakdown) */
  initialTab?: 'preview' | 'info' | 'history'
  /** URL action parameter (e.g., 'download' to trigger PDF download on load) */
  urlAction?: string
}

/**
 * Manual Layout Component
 *
 * Provides 2-panel layout:
 * - Left: Form inputs for manual data entry
 * - Right: Report preview (Preview/Info tabs)
 */
export const ManualLayout: React.FC<ManualLayoutProps> = ({
  reportId,
  onComplete,
  initialVersion,
  initialMode = 'edit',
  initialTab = 'preview',
  urlAction,
}) => {
  // EMERGENCY: Render loop detector to prevent tab freeze
  const renderCountRef = useRef(0)
  const renderTimestampRef = useRef(Date.now())

  renderCountRef.current += 1
  const now = Date.now()

  // Reset counter every 5 seconds
  if (now - renderTimestampRef.current > 5000) {
    renderCountRef.current = 1
    renderTimestampRef.current = now
  }

  // Log excessive renders (synchronous warning is fine)
  if (renderCountRef.current > 50) {
    generalLogger.warn('[ManualLayout] High render count detected', {
      reportId,
      renderCount: renderCountRef.current,
    })
  }

  // Check for render loop asynchronously to avoid inconsistent state during render
  useEffect(() => {
    if (renderCountRef.current > 100) {
      const timeWindow = performance.now() - renderTimestampRef.current
      generalLogger.error('[ManualLayout] RENDER LOOP DETECTED - Throwing error to break loop', {
        reportId,
        renderCount: renderCountRef.current,
        timeWindow,
      })
      // Throw asynchronously via setTimeout to ensure error boundary catches it properly
      setTimeout(() => {
        throw new Error(
          `Render loop detected in ManualLayout (${renderCountRef.current} renders in ${timeWindow.toFixed(0)}ms). Please contact support.`
        )
      }, 0)
    }
  })

  const { user } = useAuth()
  
  // WORLD CLASS: Sync bootstrap state with stores for unified initialization
  useBootstrapSync()
  
  // ✅ WORLD-CLASS: Restoration is handled centrally by SessionRestorationService
  // No need for useBootstrapPrefill - stores are hydrated atomically in loadSession()
  
  const { isCalculating, error, result } = useManualResultsStore()
  // CRITICAL FIX: Don't subscribe to formData or updateFormData - they cause re-renders on every form change
  // We only need updateFormData inside the restoration effect, accessed via getState()
  const { showToast } = useToast()

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
  const sessionError = useSessionStore((state) => state.errorMessage)

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
  if (sessionError) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="max-w-md mx-auto text-center">
          <div className="bg-rust-500/20 border border-rust-500/30 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-rust-400 mb-2">Session Error</h3>
            <p className="text-rust-300 mb-6">{sessionError}</p>
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
  const hasUnsavedChanges = useSessionStore((state) => state.hasUnsavedChanges)
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
  // This component only renders - it does NOT restore data
  // 
  // Previous restoration code removed:
  // - restorationRef tracking (700+ lines of complex restoration logic)
  // - Main restoration useEffect (form data, results, HTML reports)
  // - Reactive restoration useEffect (sessionData changes)
  // - HTML report restoration useEffect
  //
  // All restoration is now handled by:
  // 1. SessionRestorationService.restore() - called from useSessionStore.loadSession()
  // 2. SessionNormalizer - handles all naming conversions (camelCase/snake_case)
  // 3. Atomic store hydration - all stores updated synchronously

  // Panel resize hook
  const { leftPanelWidth, handleResize, isMobile, mobileActivePanel, setMobileActivePanel } =
    useManualPanelResize()

  // Toolbar hooks
  const { activeTab, handleTabChange: handleHookTabChange } = useValuationToolbarTabs()
  const { handleRefresh, handleDownload, isDownloading } = useManualToolbar({ result })
  const {
    isFullScreen,
    handleOpenFullscreen: handleHookOpenFullscreen,
    handleCloseFullscreen: handleHookCloseFullscreen,
  } = useValuationToolbarFullscreen()

  // ✅ Mercury Integration: Set initial tab from URL parameter (e.g., tab=info for "View Breakdown")
  const hasInitialTabBeenSet = React.useRef(false)
  useEffect(() => {
    if (!hasInitialTabBeenSet.current && initialTab && initialTab !== 'preview') {
      console.log('[ManualLayout] Setting initial tab from URL:', initialTab)
      handleHookTabChange(initialTab)
      hasInitialTabBeenSet.current = true
    }
  }, [initialTab, handleHookTabChange])

  // ✅ Mercury Integration: Handle URL action parameter (e.g., action=download for PDF download)
  const hasActionBeenTriggered = React.useRef(false)
  useEffect(() => {
    if (!hasActionBeenTriggered.current && urlAction === 'download' && result) {
      console.log('[ManualLayout] Triggering PDF download from URL action')
      hasActionBeenTriggered.current = true
      // Small delay to ensure the UI is ready
      setTimeout(() => {
        handleDownload()
      }, 500)
    }
  }, [urlAction, result, handleDownload])

  // Handle valuation completion when result changes
  useEffect(() => {
    if (result) {
      onComplete(result)
    }
  }, [result, onComplete])

  // ✅ FIX: Get company name from formData (current input) or result (after calculation)
  // This ensures valuation name updates as user types company name
  const formCompanyName = useManualFormStore((state) => state.formData.company_name)
  const resultCompanyName = result?.company_name
  const companyName = formCompanyName || resultCompanyName

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Client Context Banner is rendered in root layout - no need to duplicate here */}

      {/* Toolbar (Save Status integrated inside toolbar) */}
      <ValuationToolbar
        onRefresh={handleRefresh}
        onDownload={handleDownload}
        onFullScreen={handleHookOpenFullscreen}
        isGenerating={isCalculating || isDownloading}
        user={user}
        valuationName="Valuation"
        valuationId={result?.valuation_id}
        activeTab={activeTab}
        onTabChange={(tab) => {
          handleHookTabChange(tab as 'preview' | 'info' | 'history')
        }}
        companyName={companyName}
      />

      {/* Split Panel */}
      <div
        className="flex flex-col lg:flex-row flex-1 overflow-hidden mx-4 my-4 rounded-lg border border-zinc-800"
        style={{ transition: 'width 150ms ease-out' }}
      >
        {/* Left Panel: Form */}
        <div
          className={`${
            isMobile ? (mobileActivePanel === 'form' ? 'w-full' : 'hidden') : ''
          } h-full flex flex-col bg-zinc-900 border-r border-zinc-800 w-full lg:w-auto overflow-y-auto`}
          style={{
            width: isMobile ? '100%' : `${leftPanelWidth}%`,
          }}
        >
          <div className="flex-1 p-6">
            {/* ValuationForm - Main form inputs with Suspense boundary */}
            <Suspense fallback={<InputFieldsSkeleton />}>
              <ValuationForm
                initialVersion={initialVersion}
                isRegenerationMode={initialMode === 'edit' && !!initialVersion}
              />
            </Suspense>
          </div>
        </div>

        {/* Resizable Divider */}
        <ResizableDivider onResize={handleResize} leftWidth={leftPanelWidth} isMobile={isMobile} />

        {/* Right Panel: Report Display */}
        <div
          className={`${
            isMobile ? (mobileActivePanel === 'preview' ? 'w-full' : 'hidden') : ''
          } h-full min-h-[400px] lg:min-h-0 w-full lg:w-auto border-t lg:border-t-0 border-zinc-800`}
          style={{ width: isMobile ? '100%' : `${100 - leftPanelWidth}%` }}
        >
          <ReportPanel
            reportId={reportId}
            activeTab={activeTab as 'preview' | 'info' | 'history'}
            onTabChange={(tab: 'preview' | 'info' | 'history') => {
              handleHookTabChange(tab as ValuationTab)
            }}
            isCalculating={isCalculating}
            error={error}
            result={result}
            onClearError={() => {
              const { clearError } = useManualResultsStore.getState()
              clearError()
            }}
          />
        </div>
      </div>

      {/* Mobile Panel Switcher */}
      {isMobile && (
        <MobilePanelSwitcher activePanel={mobileActivePanel} onPanelChange={setMobileActivePanel} />
      )}

      {/* Full Screen Modal */}
      <FullScreenModal
        isOpen={isFullScreen}
        onClose={handleHookCloseFullscreen}
        title="Valuation - Full Screen"
      >
        <ReportPanel
          reportId={reportId}
          className="h-full"
          activeTab={activeTab}
          onTabChange={(tab) => {
            handleHookTabChange(tab as 'preview' | 'info' | 'history')
          }}
          isCalculating={isCalculating}
          error={error}
          result={result}
          onClearError={() => {
            const { clearError } = useManualResultsStore.getState()
            clearError()
          }}
        />
      </FullScreenModal>

      {/* Asset Inspector (dev only) */}
      <AssetInspector />
    </div>
  )
}
