import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  Eye,
  GitBranch,
  History,
  Loader2,
  Maximize,
  RefreshCw,
  Save,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import React from 'react'
import { toast } from 'sonner'
import { Tooltip } from '@/design-system'
import { dateLikeToUnixMs } from '@/utils/date-like'
import { generalLogger } from '@/utils/logger'
import { useEmbeddedMode } from '../hooks/useEmbeddedMode'
import {
  useValuationToolbarAuth,
  useValuationToolbarFullscreen,
  useValuationToolbarName,
  useValuationToolbarRefresh,
  useValuationToolbarTabs,
  type ValuationTab,
} from '../hooks/valuationToolbar'
import { navigateToMercuryFromManualHandoff } from '../features/manual/utils/manualMercuryNavigate'
import { useSessionStore } from '../store/useSessionStore'
import { useVersionHistoryStore } from '../store/useVersionHistoryStore'
import { APIError } from '../types/errors'
import { ValuationToolbarProps } from '../types/valuation'
import { formatVersionLabel } from '../utils/formatters'
import { UserDropdown } from './UserDropdown'

export const ValuationToolbar: React.FC<ValuationToolbarProps> = ({
  onRefresh,
  onDownload,
  onFullScreen,
  isGenerating = false,
  user,
  valuationName,
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
  const isSaving = useSessionStore((state) => state.isSaving)
  const lastSaved = useSessionStore((state) => state.lastSaved)
  const hasUnsavedChanges = useSessionStore((state) => state.hasUnsavedChanges)
  const syncError = useSessionStore((state) => state.error)
  const valuationResult = useSessionStore((state) => state.session?.valuationResult)

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
  // Aurora design system: primary, destructive, secondary (Burnt Clay)
  const getSaveStatusIcon = () => {
    if (syncError) {
      return <AlertCircle className="w-4 h-4 text-destructive" />
    }
    if (isSaving) {
      return <Loader2 className="w-4 h-4 animate-spin text-primary" />
    }
    if (hasUnsavedChanges) {
      return <Save className="w-4 h-4 text-secondary" />
    }
    if (lastSaved) {
      const savedMs = dateLikeToUnixMs(lastSaved)
      const timeAgo = savedMs === null ? 0 : Math.floor((Date.now() - savedMs) / 1000 / 60)
      if (timeAgo < 1) return <Check className="w-4 h-4 text-primary" />
      return <Check className="w-4 h-4 text-primary opacity-70" />
    }
    return null
  }

  const t = useTranslations()
  const tToast = useTranslations('toast')
  const getSaveStatusTooltip = () => {
    if (syncError) return t('report.saveStatus.saveFailed')
    if (isSaving) return t('report.saveStatus.saving')
    // ✅ FIX: Only show "Auto-saving soon..." when there are actual unsaved changes
    if (hasUnsavedChanges) return t('report.saveStatus.savingSoon')
    if (lastSaved) {
      const savedMs = dateLikeToUnixMs(lastSaved)
      const timeAgo = savedMs === null ? 0 : Math.floor((Date.now() - savedMs) / 1000 / 60)
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
    isEditingName,
    editedName,
    setEditedName,
    generatedName,
    nameInputRef,
    handleNameEdit,
    handleNameSave,
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
  const handleTabClick = (tab: ValuationTab) => {
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

  // WORLD-CLASS: PDF Generation with Titan API integration
  // Uses usePdfGeneration for server-side Puppeteer PDF generation
  const { usePdfGeneration } = React.useMemo(() => {
    // Lazy load to avoid circular dependencies
    return { usePdfGeneration: require('../hooks/usePdfGeneration').usePdfGeneration }
  }, [])

  const {
    state: pdfState,
    downloadPdf,
    isReady: isPdfReady,
    isGenerating: isPdfGenerating,
  } = usePdfGeneration(reportId || null)

  const isDownloading = isPdfGenerating

  const handleDownload = React.useCallback(async () => {
    if (onDownload) {
      onDownload()
    } else {
      try {
        await downloadPdf()
      } catch (err) {
        if (err instanceof APIError && err.statusCode === 402) {
          toast.error(tToast('pdfDownloadPlanBlocked'), {
            description: tToast('pdfDownloadPlanBlockedDesc'),
          })
          return
        }
        generalLogger.error('[ValuationToolbar] PDF download failed', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }, [onDownload, downloadPdf, tToast])

  // Fullscreen hook - use prop if provided, otherwise use hook
  const { handleOpenFullscreen: handleHookFullscreen } = useValuationToolbarFullscreen()
  const handleFullScreen = onFullScreen ?? handleHookFullscreen

  // Embedded mode detection for iframe integration
  const { isEmbedded } = useEmbeddedMode()

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

    return !!(
      valuationResult.equity_value_mid ||
      valuationResult.recommended_asking_price ||
      valuationResult.equity_value_low ||
      valuationResult.equity_value_high
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
        generalLogger.warn('[Toolbar] Failed to broadcast before return', { error })
      }
    }

    const currentLocale =
      typeof window !== 'undefined'
        ? window.location.pathname.match(/\/(en|nl|fr|de)\//)?.[1] || 'en'
        : 'en'
    navigateToMercuryFromManualHandoff({
      currentLocale,
      hasCompletedValuation: hasValuationPrice,
    })
  }

  return (
    <>
      <nav
        className="aurora-theme relative min-h-12 w-full shrink-0 flex items-center gap-2 px-4 py-2 border-b border-foreground/[0.06] bg-background backdrop-blur-sm overflow-visible z-[1000]"
        style={{ zIndex: 1000 }}
      >
        <div className="relative max-w-full gap-1 flex w-full shrink-0 items-center">
          <div className="w-full overflow-visible whitespace-nowrap scrollbar-hide">
            <div className="relative flex w-full flex-shrink-0 items-center justify-between">
              {/* Left Section - Valuation Name + Save Status */}
              <div className="flex flex-shrink-0 items-center gap-2" style={{ width: '23%' }}>
                <div className="relative flex items-center gap-2 group">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {isGenerating ? (
                      <Loader2 className="w-4 h-4 animate-spin text-foreground" />
                    ) : (
                      <div className="w-4 h-4 rounded bg-secondary/80 animate-pulse shadow-[0_0_8px_hsl(var(--secondary)/0.5)]"></div>
                    )}
                    {isEditingName ? (
                      <input
                        ref={nameInputRef}
                        type="text"
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        onBlur={handleNameSave}
                        onKeyDown={handleKeyDown}
                        className="bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus:border-none text-secondary font-semibold text-sm"
                        style={{ minWidth: '120px' }}
                      />
                    ) : (
                      <button
                        onClick={handleNameEdit}
                        className="hidden md:block font-semibold text-secondary hover:text-secondary/90 transition-all duration-200 cursor-pointer hover:scale-105 truncate max-w-[200px]"
                        title={t('toolbar.tooltips.editName')}
                      >
                        {generatedName}
                      </button>
                    )}
                    <button
                      onClick={handleNameEdit}
                      className="md:hidden text-xs text-secondary font-bold hover:text-secondary/90 transition-colors cursor-pointer"
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
                        className="flex items-center justify-center p-1 rounded hover:bg-foreground/[0.04] transition-colors cursor-pointer"
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
                <Tooltip content={t('navigation.tabs.preview')} position="bottom" className="">
                  <button
                    onClick={() => handleTabClick('preview')}
                    className={`p-2 rounded-lg transition-all duration-200 ${
                      currentActiveTab === 'preview'
                        ? 'bg-foreground/[0.08] text-foreground'
                        : 'text-foreground/50 hover:text-foreground hover:bg-foreground/[0.04]'
                    }`}
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </Tooltip>
                <Tooltip content={t('navigation.tabs.history')} position="bottom" className="">
                  <button
                    onClick={() => handleTabClick('history')}
                    className={`p-2 rounded-lg transition-all duration-200 ${
                      currentActiveTab === 'history'
                        ? 'bg-foreground/[0.08] text-foreground'
                        : 'text-foreground/50 hover:text-foreground hover:bg-foreground/[0.04]'
                    }`}
                  >
                    <History className="w-4 h-4" />
                  </button>
                </Tooltip>
                <div className="mx-2 h-6 w-px bg-foreground/[0.08]"></div>
                {/* Refresh - Hidden on mobile */}
                <div className="hidden lg:block">
                  <Tooltip content={t('toolbar.tooltips.refresh')} position="bottom" className="">
                    <button
                      onClick={handleRefresh}
                      className="p-2 rounded-lg transition-all duration-200 text-foreground/50 hover:text-foreground hover:bg-foreground/[0.04]"
                      disabled={isGenerating}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </Tooltip>
                </div>
                {/* WORLD-CLASS: Download with PDF status indicator */}
                <Tooltip
                  content={
                    pdfState.error
                      ? t('toolbar.tooltips.downloadError')
                      : isPdfReady
                        ? t('toolbar.tooltips.downloadReady')
                        : t('toolbar.tooltips.download')
                  }
                  position="bottom"
                  className=""
                >
                  <button
                    onClick={handleDownload}
                    className={`p-2 rounded-lg transition-all duration-200 relative ${
                      pdfState.error
                        ? 'text-destructive hover:text-destructive/90'
                        : isPdfReady
                          ? 'text-primary hover:text-primary/90'
                          : 'text-foreground/50 hover:text-foreground'
                    } hover:bg-foreground/[0.04]`}
                    disabled={isDownloading}
                  >
                    {isDownloading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : pdfState.error ? (
                      <AlertCircle className="w-4 h-4" />
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        {isPdfReady && (
                          <Check className="w-2 h-2 absolute -top-0.5 -right-0.5 text-primary" />
                        )}
                      </>
                    )}
                  </button>
                </Tooltip>
                {/* Fullscreen - Hidden on mobile */}
                <div className="hidden lg:block">
                  <Tooltip
                    content={t('toolbar.tooltips.fullscreen')}
                    position="bottom"
                    className=""
                  >
                    <button
                      onClick={handleFullScreen}
                      className="p-2 rounded-lg transition-all duration-200 text-foreground/50 hover:text-foreground hover:bg-foreground/[0.04]"
                    >
                      <Maximize className="w-4 h-4" />
                    </button>
                  </Tooltip>
                </div>
                {/* Version Selector (M&A Workflow) - Shows valuation values */}
                {/* Hidden on mobile - shown on lg+ screens */}
                {displayVersions.length > 0 && (
                  <div className="hidden lg:flex items-center">
                    <div className="mx-2 h-6 w-px bg-foreground/[0.08]"></div>
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
                            px-2 py-1.5 pr-6 rounded-lg border border-foreground/[0.08]
                            bg-foreground/[0.04] text-foreground text-xs font-medium
                            focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
                            cursor-pointer hover:bg-foreground/[0.06] transition-colors
                            appearance-none
                          "
                        >
                          {displayVersions
                            .sort((a, b) => b.versionNumber - a.versionNumber)
                            .map((version) => (
                              <option
                                key={version.id}
                                value={version.versionNumber}
                                className="bg-card text-foreground"
                              >
                                {formatVersionLabel(version)}
                              </option>
                            ))}
                        </select>
                        <GitBranch className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-foreground/40 pointer-events-none" />
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
                      content={t('report.toolbar.returnToDashboard')}
                      position="bottom"
                      className=""
                    >
                      <button
                        onClick={handleReturnToMercury}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-200 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium"
                      >
                        <X className="w-4 h-4" />
                        <span className="hidden sm:inline">{t('report.toolbar.close')}</span>
                      </button>
                    </Tooltip>
                    <div className="h-6 w-px bg-foreground/[0.08] mx-1"></div>
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
                              ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover:scale-105 ring-2 ring-primary/20'
                              : 'bg-foreground/[0.08] hover:bg-foreground/[0.12] text-foreground hover:text-foreground'
                          }`}
                        >
                          {hasValuationPrice && <Check className="w-4 h-4 flex-shrink-0" />}
                          {/* ✅ UX: Always show text - this is the primary CTA */}
                          <span className="whitespace-nowrap">
                            {sourceApp?.includes('mercury')
                              ? t('report.toolbar.backToClient')
                              : t('report.toolbar.continueToDashboard')}
                          </span>
                          <ArrowRight
                            className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${hasValuationPrice ? 'group-hover:translate-x-1' : ''}`}
                          />
                        </button>
                      </Tooltip>
                      <div className="h-6 w-px bg-foreground/[0.08] mx-1"></div>
                    </>
                  )
                )}
                <div className="flex items-center gap-3">
                  <UserDropdown user={user ?? null} onLogout={handleLogout} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>
      {/* FlowSwitchWarningModal removed - conversational flow no longer exists */}
    </>
  )
}
