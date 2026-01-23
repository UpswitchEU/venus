import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  Edit3,
  Eye,
  GitBranch,
  History,
  Info,
  Loader2,
  Maximize,
  MessageSquare,
  RefreshCw,
  Save,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import React from 'react'
import { useEmbeddedMode } from '../hooks/useEmbeddedMode'
import {
  useValuationToolbarAuth,
  useValuationToolbarDownload,
  useValuationToolbarFlow,
  useValuationToolbarFullscreen,
  useValuationToolbarName,
  useValuationToolbarRefresh,
  useValuationToolbarTabs,
} from '../hooks/valuationToolbar'
import { useSessionStore } from '../store/useSessionStore'
import { useVersionHistoryStore } from '../store/useVersionHistoryStore'
import { ValuationToolbarProps } from '../types/valuation'
import { formatVersionLabel } from '../utils/formatters'
import { FlowSwitchWarningModal } from './FlowSwitchWarningModal'
import { UserDropdown } from './UserDropdown'
import { Tooltip } from './ui/Tooltip'

export const ValuationToolbar: React.FC<ValuationToolbarProps> = ({
  onRefresh,
  onDownload,
  onFullScreen,
  isGenerating = false,
  user,
  valuationName = 'Valuation test123',
  activeTab = 'preview',
  onTabChange,
  companyName,
  versions,
  activeVersion,
  onVersionSelect,
}) => {
  // Read from unified session store
  // ROOT CAUSE FIX: Only subscribe to specific primitives, not entire session object
  const reportId = useSessionStore((state) => state.session?.reportId)
  const currentView = useSessionStore((state) => state.session?.currentView)
  const isSaving = useSessionStore((state) => state.isSaving)
  const lastSaved = useSessionStore((state) => state.lastSaved)
  const hasUnsavedChanges = useSessionStore((state) => state.hasUnsavedChanges)
  const syncError = useSessionStore((state) => state.error)
  const valuationResult = useSessionStore((state) => state.session?.valuationResult)

  // Flow detection from session
  const isManualFlow = currentView === 'manual'
  const isConversationalFlow = currentView === 'conversational'

  const {
    versions: storeVersions,
    getActiveVersion,
    setActiveVersion,
    // NOTE: fetchVersions removed - now handled by SessionRestorationService
  } = useVersionHistoryStore()

  // ✅ FIX: Deduplicate versions when combining props and store versions
  // Use props if provided, otherwise use store, but ensure no duplicates
  const rawDisplayVersions = versions || (reportId ? storeVersions[reportId] || [] : [])

  // Deduplicate by versionNumber (keep the latest one if duplicates exist)
  const versionMap = new Map<number, (typeof rawDisplayVersions)[0]>()
  rawDisplayVersions.forEach((version) => {
    const existing = versionMap.get(version.versionNumber)
    // Keep the version with the latest createdAt or id if duplicates exist
    if (
      !existing ||
      (version.createdAt && existing.createdAt && version.createdAt > existing.createdAt) ||
      (!version.createdAt && !existing.createdAt && version.id > existing.id)
    ) {
      versionMap.set(version.versionNumber, version)
    }
  })
  const displayVersions = Array.from(versionMap.values()).sort(
    (a, b) => b.versionNumber - a.versionNumber
  )

  const storeActiveVersion = reportId ? getActiveVersion(reportId) : null
  const displayActiveVersion = activeVersion ?? storeActiveVersion?.versionNumber

  const handleVersionSelect =
    onVersionSelect ||
    ((versionNumber: number) => {
      if (reportId) {
        setActiveVersion(reportId, versionNumber)
      }
    })

  // NOTE: Version fetching is now handled by SessionRestorationService
  // when the session is loaded. No need to fetch here - versions will be
  // in the store once the session is fully restored.

  // Save status icon (minimalist - just icon with tooltip)
  const getSaveStatusIcon = () => {
    if (syncError) {
      return <AlertCircle className="w-4 h-4 text-accent-500" />
    }
    if (isSaving) {
      return <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
    }
    if (hasUnsavedChanges) {
      return <Save className="w-4 h-4 text-harvest-500" />
    }
    if (lastSaved) {
      const timeAgo = Math.floor((Date.now() - lastSaved.getTime()) / 1000 / 60)
      if (timeAgo < 1) return <Check className="w-4 h-4 text-primary-600" />
      return <Check className="w-4 h-4 text-primary-600 opacity-70" />
    }
    return null
  }

  const t = useTranslations()
  const getSaveStatusTooltip = () => {
    if (syncError) return t('report.saveStatus.saveFailed')
    if (isSaving) return t('report.saveStatus.saving')
    // ✅ FIX: Only show "Auto-saving soon..." when there are actual unsaved changes
    if (hasUnsavedChanges) return t('report.saveStatus.savingSoon')
    if (lastSaved) {
      const timeAgo = Math.floor((Date.now() - lastSaved.getTime()) / 1000 / 60)
      if (timeAgo < 1) return t('report.saveStatus.saved')
      if (timeAgo < 60) return t('report.saveStatus.savedAgo', { minutes: timeAgo })
      return t('report.saveStatus.savedHoursAgo', { hours: Math.floor(timeAgo / 60) })
    }
    // ✅ FIX: Don't show "Saved" for new reports - return null to hide tooltip
    return null
  }

  // Handle retry save when error icon is clicked
  const handleRetrySave = async () => {
    if (!syncError || !reportId) return

    // Trigger save using unified store with 'user' reason to show toast
    const { saveSession: save } = useSessionStore.getState()
    await save('user')
  }

  // Use focused hooks for business logic
  const {
    showSwitchConfirmation,
    pendingFlowTarget,
    handleFlowIconClick,
    handleConfirmSwitch,
    handleCancelSwitch,
    isSyncing,
  } = useValuationToolbarFlow()

  const {
    isEditingName,
    editedName,
    setEditedName,
    generatedName,
    nameInputRef,
    handleNameEdit,
    handleNameSave,
    handleNameCancel,
    handleKeyDown,
  } = useValuationToolbarName({
    initialName: valuationName,
    companyName,
    reportId,
  })

  const { handleLogout } = useValuationToolbarAuth()

  // Tab management hook - use prop if provided (parent-controlled), otherwise use hook state
  const { activeTab: hookActiveTab, handleTabChange: handleHookTabChange } =
    useValuationToolbarTabs({
      initialTab: activeTab || 'preview',
      onTabChange,
    })

  // Use prop tab if provided (parent-controlled), otherwise use hook state
  const currentActiveTab = activeTab ?? hookActiveTab
  const handleTabClick = (tab: 'preview' | 'info' | 'history') => {
    // If parent provides onTabChange, use it (parent-controlled)
    // Otherwise use hook handler (self-controlled)
    if (onTabChange) {
      onTabChange(tab)
    } else {
      handleHookTabChange(tab)
    }
  }

  // Refresh hook - use prop if provided, otherwise use hook
  const { handleRefresh: handleHookRefresh } = useValuationToolbarRefresh()
  const handleRefresh = onRefresh ?? handleHookRefresh

  // Download hook - track loading state for UI feedback
  // Note: Parent components should provide onDownload handler that uses the hook
  const { isDownloading } = useValuationToolbarDownload()
  const handleDownload =
    onDownload ??
    (() => {
      // If no prop handler provided, this shouldn't be called
      // Parent components should always provide onDownload handler
    })

  // Fullscreen hook - use prop if provided, otherwise use hook
  const { handleOpenFullscreen: handleHookFullscreen } = useValuationToolbarFullscreen()
  const handleFullScreen = onFullScreen ?? handleHookFullscreen

  // Embedded mode detection for iframe integration
  const { isEmbedded, closeEmbedded } = useEmbeddedMode()

  // Return URL for Mercury integration (for direct access, not embedded)
  const [returnUrl, setReturnUrl] = React.useState<string | null>(null)
  const [sourceApp, setSourceApp] = React.useState<string | null>(null)

  React.useEffect(() => {
    // Check for return URL in sessionStorage
    if (typeof window !== 'undefined') {
      const storedReturnUrl = sessionStorage.getItem('upswitch_return_url')
      const storedSourceApp = sessionStorage.getItem('upswitch_source')
      setReturnUrl(storedReturnUrl)
      setSourceApp(storedSourceApp)
    }
  }, [])

  // Check if valuation result has price data available
  // Button should only appear when price is available
  const hasValuationPrice = React.useMemo(() => {
    if (!valuationResult) return false
    
    const result = valuationResult as any
    return !!(
      result.equity_value_mid ||
      result.recommended_asking_price ||
      result.equity_value_low ||
      result.equity_value_high
    )
  }, [valuationResult])

  const handleReturnToMercury = () => {
    // Broadcast report update before leaving
    if (reportId) {
      try {
        const session = useSessionStore.getState().session
        const event = new CustomEvent('upswitch-report-updated', {
          detail: {
            reportId,
            reportName: session?.name,
            updatedAt: session?.updatedAt || new Date(),
            source: 'valuation.upswitch.app',
          },
        })
        window.dispatchEvent(event)

        // Also try BroadcastChannel if available
        if (typeof BroadcastChannel !== 'undefined') {
          const channel = new BroadcastChannel('upswitch-report-sync')
          channel.postMessage({
            type: 'upswitch-report-updated',
            data: {
              reportId,
              reportName: session?.name,
              updatedAt: session?.updatedAt || new Date(),
            },
            source: 'valuation.upswitch.app',
          })
          channel.close()
        }
      } catch (error) {
        console.warn('[Toolbar] Failed to broadcast before return:', error)
      }
    }

    // ✅ FIX: Construct full Mercury URL from returnUrl
    // Return URL from Mercury is relative (e.g., /nl/accountant/clients/...)
    // We need to construct full URL using Mercury domain (upswitch.app, not valuation.upswitch.app)
    const mercuryUrl = process.env.NEXT_PUBLIC_PARENT_DOMAIN || 'https://upswitch.app'
    
    let targetUrl: string
    
    if (returnUrl) {
      if (returnUrl.startsWith('http://') || returnUrl.startsWith('https://')) {
        // Already a full URL - use as-is if it's from upswitch.app domain
        const url = new URL(returnUrl)
        if (url.origin.includes('upswitch.app')) {
          targetUrl = returnUrl
        } else {
          // Different domain - fall back to dashboard
          const locale = returnUrl.match(/\/(en|nl)\//)?.[1] || 'en'
          targetUrl = `${mercuryUrl}/${locale}/accountant/dashboard`
        }
      } else {
        // Relative URL - construct full URL using Mercury domain
        targetUrl = `${mercuryUrl}${returnUrl.startsWith('/') ? '' : '/'}${returnUrl}`
      }
    } else {
      // No return URL - fall back to dashboard based on user role
      // Try to get locale from current URL or default to 'en'
      const currentLocale = typeof window !== 'undefined' 
        ? window.location.pathname.match(/\/(en|nl)\//)?.[1] || 'en'
        : 'en'
      
      // Determine dashboard based on source app or default to accountant dashboard
      // ✅ FIX: Mercury sends 'mercury' as source, not 'mercury-accountant'
      if (sourceApp?.includes('mercury')) {
        targetUrl = `${mercuryUrl}/${currentLocale}/accountant/dashboard`
      } else {
        // Default to seller dashboard or home
        targetUrl = `${mercuryUrl}/${currentLocale}/my-business/overview`
      }
    }

    // Navigate back to Mercury
    window.location.href = targetUrl
  }

  return (
    <>
      <nav className="relative min-h-12 w-full shrink-0 flex items-center gap-2 px-4 py-2 border-b border-zinc-800/50 bg-zinc-950/50 backdrop-blur-sm overflow-visible z-[1000]" style={{ zIndex: 1000 }}>
        <div className="relative max-w-full gap-1 flex w-full shrink-0 items-center">
          <div className="w-full overflow-visible whitespace-nowrap scrollbar-hide">
            <div className="relative flex w-full flex-shrink-0 items-center justify-between">
              {/* Left Section - Valuation Name + Save Status */}
              <div className="flex flex-shrink-0 items-center gap-2" style={{ width: '23%' }}>
                <div className="relative flex items-center gap-2 group">
                  <div className="flex items-center gap-2 text-sm font-medium text-white">
                    {isGenerating ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <div className="w-4 h-4 rounded bg-gradient-to-br from-harvest-500 to-harvest-600 animate-pulse shadow-[0_0_8px_rgba(217,165,88,0.5)]"></div>
                    )}
                    {isEditingName ? (
                      <input
                        ref={nameInputRef}
                        type="text"
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        onBlur={handleNameSave}
                        onKeyDown={handleKeyDown}
                        className="bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus:border-none text-transparent bg-clip-text bg-gradient-to-r from-harvest-400 to-harvest-500 font-semibold text-sm"
                        style={{ minWidth: '120px' }}
                      />
                    ) : (
                      <button
                        onClick={handleNameEdit}
                        className="hidden md:block font-semibold text-transparent bg-clip-text bg-gradient-to-r from-harvest-400 to-harvest-500 hover:from-harvest-300 hover:to-harvest-400 transition-all duration-200 cursor-pointer hover:scale-105 drop-shadow-[0_1px_3px_rgba(217,165,88,0.4)]"
                        title={t('toolbar.tooltips.editName')}
                      >
                        {generatedName}
                      </button>
                    )}
                    <button
                      onClick={handleNameEdit}
                      className="md:hidden text-xs text-harvest-400 font-bold hover:text-harvest-300 transition-colors cursor-pointer"
                      title={t('toolbar.tooltips.editName')}
                    >
                      {t('valuation.title')}
                    </button>
                  </div>
                </div>
                {/* Save Status Icon (M&A Workflow) - Minimalist inline indicator */}
                {getSaveStatusIcon() &&
                  (() => {
                    const tooltipContent = getSaveStatusTooltip()
                    const iconContent = syncError ? (
                      // Clickable only when there's an error (manual retry)
                      <button
                        onClick={handleRetrySave}
                        className="flex items-center justify-center p-1 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
                        aria-label={t('common.actions.retry')}
                      >
                        {getSaveStatusIcon()}
                      </button>
                    ) : (
                      // Non-clickable for normal states (autosave)
                      <div className="flex items-center justify-center p-1">
                        {getSaveStatusIcon()}
                      </div>
                    )

                    // Only wrap in Tooltip if there's tooltip content (hide for new reports)
                    return tooltipContent ? (
                      <Tooltip content={tooltipContent} position="bottom" className="">
                        {iconContent}
                      </Tooltip>
                    ) : (
                      iconContent
                    )
                  })()}
              </div>

              {/* Center Section - Action Buttons */}
              {/* ✅ UX: Hide on very small screens to prioritize CTA */}
              <div className="absolute left-1/2 transform -translate-x-1/2 hidden sm:flex items-center gap-1">
                {/* Flow Toggles - Hidden on mobile, shown on md+ */}
                <div className="hidden md:flex items-center gap-1">
                  <Tooltip content={t('navigation.flows.manual')} position="bottom" className="">
                    <button
                      onClick={() => handleFlowIconClick('manual')}
                      disabled={currentView === 'manual' || isSyncing}
                      className={`p-2 rounded-lg transition-all duration-200 ${
                        currentView === 'manual'
                          ? 'bg-zinc-700 text-white'
                          : 'text-gray-400 hover:text-gray-300 hover:bg-zinc-800'
                      } ${isSyncing ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {isSyncing && currentView !== 'manual' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Edit3 className="w-4 h-4" />
                      )}
                    </button>
                  </Tooltip>
                  <Tooltip
                    content={t('navigation.flows.conversational')}
                    position="bottom"
                    className=""
                  >
                    <button
                      onClick={() => handleFlowIconClick('conversational')}
                      disabled={currentView === 'conversational' || isSyncing}
                      className={`p-2 rounded-lg transition-all duration-200 ${
                        currentView === 'conversational'
                          ? 'bg-zinc-700 text-white'
                          : 'text-gray-400 hover:text-gray-300 hover:bg-zinc-800'
                      } ${isSyncing ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {isSyncing && currentView !== 'conversational' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <MessageSquare className="w-4 h-4" />
                      )}
                    </button>
                  </Tooltip>
                  <div className="mx-2 h-6 w-px bg-zinc-700"></div>
                </div>
                <Tooltip content={t('navigation.tabs.preview')} position="bottom" className="">
                  <button
                    onClick={() => handleTabClick('preview')}
                    className={`p-2 rounded-lg transition-all duration-200 ${
                      currentActiveTab === 'preview'
                        ? 'bg-zinc-700 text-white'
                        : 'text-gray-400 hover:text-gray-300 hover:bg-zinc-800'
                    }`}
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </Tooltip>
                <Tooltip content={t('navigation.tabs.info')} position="bottom" className="">
                  <button
                    onClick={() => handleTabClick('info')}
                    className={`p-2 rounded-lg transition-all duration-200 ${
                      currentActiveTab === 'info'
                        ? 'bg-zinc-700 text-white'
                        : 'text-gray-400 hover:text-gray-300 hover:bg-zinc-800'
                    }`}
                  >
                    <Info className="w-4 h-4" />
                  </button>
                </Tooltip>
                <Tooltip content={t('navigation.tabs.history')} position="bottom" className="">
                  <button
                    onClick={() => handleTabClick('history')}
                    className={`p-2 rounded-lg transition-all duration-200 ${
                      currentActiveTab === 'history'
                        ? 'bg-zinc-700 text-white'
                        : 'text-gray-400 hover:text-gray-300 hover:bg-zinc-800'
                    }`}
                  >
                    <History className="w-4 h-4" />
                  </button>
                </Tooltip>
                <div className="mx-2 h-6 w-px bg-zinc-700"></div>
                {/* Refresh - Hidden on mobile */}
                <div className="hidden lg:block">
                  <Tooltip content={t('toolbar.tooltips.refresh')} position="bottom" className="">
                    <button
                      onClick={handleRefresh}
                      className="p-2 rounded-lg transition-all duration-200 text-gray-400 hover:text-gray-300 hover:bg-zinc-800"
                      disabled={isGenerating}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </Tooltip>
                </div>
                {/* Download - Always visible (important action) */}
                <Tooltip content={t('toolbar.tooltips.download')} position="bottom" className="">
                  <button
                    onClick={handleDownload}
                    className="p-2 rounded-lg transition-all duration-200 text-gray-400 hover:text-gray-300 hover:bg-zinc-800"
                    disabled={isDownloading}
                  >
                    {isDownloading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                  </button>
                </Tooltip>
                {/* Fullscreen - Hidden on mobile */}
                <div className="hidden lg:block">
                  <Tooltip content={t('toolbar.tooltips.fullscreen')} position="bottom" className="">
                    <button
                      onClick={handleFullScreen}
                      className="p-2 rounded-lg transition-all duration-200 text-gray-400 hover:text-gray-300 hover:bg-zinc-800"
                    >
                      <Maximize className="w-4 h-4" />
                    </button>
                  </Tooltip>
                </div>
                {/* Version Selector (M&A Workflow) - Shows valuation values */}
                {/* Hidden on mobile - shown on lg+ screens */}
                {displayVersions.length > 0 && (
                  <div className="hidden lg:flex items-center">
                    <div className="mx-2 h-6 w-px bg-zinc-700"></div>
                    <Tooltip
                      content={t('report.toolbar.selectVersion')}
                      position="bottom"
                      className=""
                    >
                      <div className="relative">
                        <select
                          value={
                            displayActiveVersion ||
                            displayVersions[displayVersions.length - 1].versionNumber
                          }
                          onChange={(e) => handleVersionSelect(parseInt(e.target.value))}
                          className="
                            px-2 py-1.5 pr-6 rounded-lg border border-zinc-700
                            bg-zinc-800 text-gray-200 text-xs font-medium
                            focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                            cursor-pointer hover:bg-zinc-750 transition-colors
                            appearance-none
                          "
                        >
                          {displayVersions
                            .sort((a, b) => b.versionNumber - a.versionNumber)
                            .map((version) => (
                              <option
                                key={version.id}
                                value={version.versionNumber}
                                className="bg-zinc-800 text-gray-200"
                              >
                                {formatVersionLabel(version)}
                              </option>
                            ))}
                        </select>
                        <GitBranch className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                      </div>
                    </Tooltip>
                  </div>
                )}
              </div>

              {/* Right Section - Close/Return Button + User Info */}
              <div className="flex items-center gap-1.5">
                {isEmbedded ? (
                  /* Embedded Mode - Show Close Button */
                  <>
                    <Tooltip
                      content={t('report.toolbar.returnToMercury')}
                      position="bottom"
                      className=""
                    >
                      <button
                        onClick={closeEmbedded}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-200 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium"
                      >
                        <X className="w-4 h-4" />
                        <span className="hidden sm:inline">{t('report.toolbar.close')}</span>
                      </button>
                    </Tooltip>
                    <div className="h-6 w-px bg-zinc-700 mx-1"></div>
                  </>
                ) : (
                  returnUrl && (
                    /* Direct Access with Return URL - Always show Return Button */
                    /* ✅ FIX: Don't require hasValuationPrice - user should always be able to return */
                    /* Style is more prominent when valuation is complete */
                    <>
                      <Tooltip
                        content={
                          sourceApp?.includes('mercury')
                            ? t('report.toolbar.backToClient')
                            : t('report.toolbar.continueToDashboard')
                        }
                        position="bottom"
                        className=""
                      >
                        <button
                          onClick={handleReturnToMercury}
                          className={`group flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 text-sm font-semibold ${
                            hasValuationPrice
                              ? 'bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-500 hover:to-primary-400 text-white shadow-lg shadow-primary-500/30 hover:shadow-xl hover:shadow-primary-500/40 hover:scale-105 ring-2 ring-primary-400/20'
                              : 'bg-zinc-700 hover:bg-zinc-600 text-gray-200 hover:text-white'
                          }`}
                        >
                          {hasValuationPrice && (
                            <Check className="w-4 h-4 flex-shrink-0" />
                          )}
                          {/* ✅ UX: Always show text - this is the primary CTA */}
                          <span className="whitespace-nowrap">
                            {sourceApp?.includes('mercury')
                              ? t('report.toolbar.backToClient')
                              : t('report.toolbar.continueToDashboard')}
                          </span>
                          <ArrowRight className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${hasValuationPrice ? 'group-hover:translate-x-1' : ''}`} />
                        </button>
                      </Tooltip>
                      <div className="h-6 w-px bg-zinc-700 mx-1"></div>
                    </>
                  )
                )}
                <div className="flex items-center gap-3">
                  <UserDropdown user={user} onLogout={handleLogout} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>
      <FlowSwitchWarningModal
        isOpen={showSwitchConfirmation}
        currentFlow={currentView || 'manual'}
        targetFlow={pendingFlowTarget || 'manual'}
        onConfirm={handleConfirmSwitch}
        onClose={handleCancelSwitch}
      />
    </>
  )
}
