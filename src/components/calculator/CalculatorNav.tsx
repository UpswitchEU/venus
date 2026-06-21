'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Eye, FileSpreadsheet, MessageCircle } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Link, useTransitionRouter } from 'next-view-transitions'
import { useMemo } from 'react'
import {
  getPreSelectableMethodsForFirm,
  resolveDisplayPreSelectedMethodKey,
} from '@/constants/methodFieldConfig'
import { AuroraButton, Tooltip, TooltipProvider } from '@/design-system'
import { cn } from '@/design-system/utils'
import type { CalculatorNavProps } from './CalculatorNav.types'
import {
  confidenceDotClassName,
  formatPrice,
  normalizeCalculatorNavDisplaySummary,
  resolveCalculatorNavMethodLabels,
  resolvePdfDownloadTooltip,
} from './CalculatorNav.utils'
import { CalculatorNavMethodSelector } from './CalculatorNavMethodSelector'
import { CalculatorNavRecentValuationsMenu } from './CalculatorNavRecentValuationsMenu'
import { ToolbarOverflowMenu } from './CalculatorNavToolbarOverflowMenu'
import { CalculatorNavUserMenu } from './CalculatorNavUserMenu'
import { CalculatorNavValuationSummary } from './CalculatorNavValuationSummary'

export type {
  CalculatorNavProps,
  DownloadHistoryItem,
  RecentValuation,
  RightPanelView,
  ValuationVersion,
} from './CalculatorNav.types'

export function CalculatorNav({
  companyName,
  onBack,
  onDownload,
  onFullscreen,
  onPreview,
  onShowHistory,
  hasReport = false,
  rightPanelView = 'report',
  userName,
  userInitials = 'GL',
  userEmail,
  avatarUrl,
  onAccountSettings,
  onSwitchWorkspace,
  onLogout,
  onNavigateToDashboard,
  onNavigateToBilling,
  onNavigateToHelp,
  recentValuations = [],
  activeReportId,
  onSelectValuation,
  onDeleteValuation,
  deletingValuationId,
  onNewValuation,
  isCalculating = false,
  onOpenAssistant,
  isAssistantOpen = false,
  onOpenNormalization,
  normalizationCount = 0,
  openTasksCount = 0,
  valuationSummary,
  valuationVersions = [],
  selectedVersionId,
  onSelectVersion,
  onContinueToListing,
  isExporting = false,
  downloadHistory = [],
  onRedownload,
  canDownloadPdf = true,
  isAccountantMode = false,
  onExitClientView,
  showSourceDataToggle = false,
  sourceDataOpen = false,
  onToggleSourceData,
  onOpenValuationEdit,
  preSelectedMethod,
  onPreSelectMethod,
  preSelectedMethods,
  onToggleMethod,
  firmCountryCode,
  preSelectableMethodsForNav: preSelectableMethodsForNavProp,
  planLockedMethodKeys,
  onPlanLockedMethodAction,
  normalizationFeatureLocked = false,
  onNormalizationFeatureLocked,
  versionControlFeatureLocked = false,
  onVersionControlFeatureLocked,
  showSignAttest = false,
  onSignAttest,
  isAttesting = false,
  showApproveValuation = false,
  onApproveValuation,
  isApprovingValuation = false,
  approveValuationLabel,
  signAttestLabel,
}: CalculatorNavProps) {
  const t = useTranslations()
  const navLocale = useLocale()
  const router = useTransitionRouter()

  const activeVersion =
    valuationVersions.find((v) => v.id === selectedVersionId) ||
    valuationVersions.find((v) => v.isActive) ||
    valuationVersions[0]
  const activeVersionId = activeVersion?.id
  const rawDisplaySummary =
    valuationSummary ||
    (activeVersion
      ? {
          priceRange: activeVersion.priceRange,
          askPrice: activeVersion.askPrice,
          confidence: 'high' as const,
        }
      : null)
  const displaySummary = normalizeCalculatorNavDisplaySummary(rawDisplaySummary)

  const preSelectableMethods = useMemo(() => {
    if (preSelectableMethodsForNavProp != null) {
      return preSelectableMethodsForNavProp
    }
    return getPreSelectableMethodsForFirm(firmCountryCode)
  }, [preSelectableMethodsForNavProp, firmCountryCode])

  const displayPreSelectedMethod = useMemo(
    () => resolveDisplayPreSelectedMethodKey(preSelectedMethod, preSelectableMethods),
    [preSelectedMethod, preSelectableMethods]
  )

  const pdfPlanLocked = hasReport && !canDownloadPdf
  const pdfDownloadTooltip = resolvePdfDownloadTooltip(pdfPlanLocked, navLocale)
  const { compactMethodLabel, selectedMethodLabel } = resolveCalculatorNavMethodLabels({
    displayPreSelectedMethod,
    preSelectedMethods,
    t,
  })
  const methodTriggerLabel = `${t('manualInput.methodSelector.label')} — ${selectedMethodLabel}`

  const handleBack = () => {
    if (isAccountantMode && onExitClientView) {
      onExitClientView()
    } else if (onBack) {
      onBack()
    } else {
      router.back()
    }
  }

  return (
    <TooltipProvider>
      <nav
        className={cn(
          'relative w-full shrink-0 grid items-center',
          'grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto] gap-y-1 px-3 pb-2',
          'md:h-14 md:grid-rows-none md:gap-x-4 md:gap-y-0 md:px-4 md:pb-0',
          'md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]',
          'border-b border-foreground/[0.06] bg-background',
          'pt-[env(safe-area-inset-top)]'
        )}
      >
        <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-1 pr-2 md:col-auto md:row-auto md:gap-3 md:pr-0">
          {/* Persistent Upswitch brand mark — mobile-only home affordance.
              On mobile the only other way out is the (history-dependent) back
              arrow or a buried avatar-menu item, so the mark earns its place.
              On desktop (md+) the always-present back arrow is the home/exit
              affordance, so the mark is redundant chrome and is hidden.
              Mirrors MinimalHeader's `<Link href="/">` home affordance. */}
          <Link
            href="/"
            aria-label={navLocale === 'nl' ? 'Upswitch — startpagina' : 'Upswitch — home'}
            className="-ml-1 mr-0.5 inline-flex min-h-[44px] min-w-[36px] shrink-0 items-center justify-center rounded-lg transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 md:hidden"
          >
            <img
              src="/logos/upswitch-mark.svg"
              alt="Upswitch"
              className="h-6 w-6"
              draggable={false}
            />
          </Link>
          <Tooltip
            content={
              isAccountantMode ? t('clientContext.exitClientView') : t('common.actions.back')
            }
          >
            <button
              type="button"
              onClick={handleBack}
              className="p-2 -ml-1 md:-ml-2 rounded-lg text-foreground/50 hover:text-foreground hover:bg-foreground/[0.04] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Tooltip>

          <CalculatorNavRecentValuationsMenu
            activeReportId={activeReportId}
            companyName={companyName}
            deletingValuationId={deletingValuationId}
            isCalculating={isCalculating}
            navLocale={navLocale}
            onDeleteValuation={onDeleteValuation}
            onNewValuation={onNewValuation}
            onOpenValuationEdit={onOpenValuationEdit}
            onSelectValuation={onSelectValuation}
            recentValuations={recentValuations}
            t={t}
          />

          <CalculatorNavMethodSelector
            compactMethodLabel={compactMethodLabel}
            displayPreSelectedMethod={displayPreSelectedMethod}
            methodTriggerLabel={methodTriggerLabel}
            onPlanLockedMethodAction={onPlanLockedMethodAction}
            onPreSelectMethod={onPreSelectMethod}
            onToggleMethod={onToggleMethod}
            planLockedMethodKeys={planLockedMethodKeys}
            preSelectableMethods={preSelectableMethods}
            preSelectedMethods={preSelectedMethods}
            t={t}
            variant="desktop"
          />
        </div>

        <CalculatorNavValuationSummary
          activeVersionId={activeVersionId}
          displaySummary={displaySummary}
          hasReport={hasReport}
          navLocale={navLocale}
          onContinueToListing={onContinueToListing}
          onOpenValuationEdit={onOpenValuationEdit}
          onSelectVersion={onSelectVersion}
          onVersionControlFeatureLocked={onVersionControlFeatureLocked}
          t={t}
          valuationVersions={valuationVersions}
          versionControlFeatureLocked={versionControlFeatureLocked}
        />

        <div className="contents md:flex md:min-w-0 md:items-center md:justify-self-end">
          <div className="hidden md:flex items-center gap-0.5">
            <Tooltip content={t('assistant.title')}>
              <AuroraButton
                variant={isAssistantOpen ? 'primary' : 'ghost'}
                size="sm"
                onClick={onOpenAssistant}
                className={cn(
                  'gap-1.5 transition-all duration-200 relative',
                  isAssistantOpen
                    ? 'ring-2 ring-primary/20'
                    : 'text-foreground/60 hover:text-foreground'
                )}
              >
                <MessageCircle className="w-4 h-4" />
                <span className="hidden xl:inline">{t('assistant.title')}</span>
                <kbd className="hidden xl:inline-flex items-center px-1.5 py-0.5 rounded bg-foreground/[0.06] text-[10px] font-mono text-foreground/40 ml-1">
                  {t('assistant.shortcut')}
                </kbd>
                {openTasksCount > 0 && (
                  <span
                    className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold rounded-full bg-secondary text-secondary-foreground shadow-sm"
                    aria-label={
                      navLocale === 'nl'
                        ? `${openTasksCount} openstaande taak${openTasksCount === 1 ? '' : 'en'} in de assistent`
                        : `${openTasksCount} pending task${openTasksCount === 1 ? '' : 's'} in assistant`
                    }
                  >
                    {openTasksCount > 9 ? '9+' : openTasksCount}
                  </span>
                )}
              </AuroraButton>
            </Tooltip>

            {onOpenNormalization && (
              <Tooltip
                content={
                  normalizationFeatureLocked
                    ? navLocale === 'nl'
                      ? 'EBITDA-normalisatie & belastinglatenties — Starter+'
                      : 'EBITDA normalization & tax latencies — Starter+'
                    : t('normalization.title')
                }
              >
                <AuroraButton
                  variant="ghost"
                  size="sm"
                  onClick={
                    normalizationFeatureLocked
                      ? (onNormalizationFeatureLocked ?? onOpenNormalization)
                      : onOpenNormalization
                  }
                  className={cn(
                    'gap-1.5 mr-1 transition-all duration-200 relative',
                    'text-foreground/60 hover:text-foreground',
                    normalizationFeatureLocked &&
                      'blur-[1.5px] opacity-[0.88] saturate-75 ring-1 ring-amber-500/15 rounded-lg'
                  )}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span className="hidden xl:inline">{t('normalization.title')}</span>
                  {normalizationFeatureLocked && (
                    <span className="hidden xl:inline ml-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700/90 dark:text-amber-300/90">
                      Starter+
                    </span>
                  )}
                  {normalizationCount > 0 && (
                    <span
                      className="ml-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold rounded-full bg-primary/15 text-primary"
                      aria-label={
                        navLocale === 'nl'
                          ? `${normalizationCount} normalisatie${normalizationCount === 1 ? '' : 's'} ter beoordeling`
                          : `${normalizationCount} pending normalization${normalizationCount === 1 ? '' : 's'}`
                      }
                    >
                      {normalizationCount > 9 ? '9+' : normalizationCount}
                    </span>
                  )}
                </AuroraButton>
              </Tooltip>
            )}

            {/* Preview toggle — grouped with Assistent + Normalisaties as the
                primary "actions you take while reviewing" cluster */}
            <Tooltip content={hasReport ? t('report.preview') : t('report.noReport')}>
              <button
                type="button"
                onClick={onPreview}
                disabled={!hasReport}
                className={cn(
                  'p-2 rounded-lg transition-all duration-200',
                  rightPanelView === 'preview' && hasReport
                    ? 'text-primary bg-primary/15 ring-1 ring-primary/30 shadow-sm'
                    : hasReport
                      ? 'text-foreground/60 hover:text-foreground hover:bg-foreground/[0.06]'
                      : 'text-foreground/20 cursor-not-allowed'
                )}
                aria-label={t('report.preview')}
                aria-pressed={rightPanelView === 'preview'}
              >
                <Eye className="w-4 h-4" aria-hidden />
              </button>
            </Tooltip>

            <div className="h-5 w-px bg-foreground/[0.08] mx-1" />

            <ToolbarOverflowMenu
              navLocale={navLocale}
              t={t}
              hasReport={hasReport}
              rightPanelView={rightPanelView}
              showSourceDataToggle={showSourceDataToggle}
              sourceDataOpen={sourceDataOpen}
              onToggleSourceData={onToggleSourceData}
              onShowHistory={onShowHistory}
              onDownload={onDownload}
              onRedownload={onRedownload}
              onFullscreen={onFullscreen}
              isExporting={isExporting}
              pdfPlanLocked={pdfPlanLocked}
              pdfDownloadTooltip={pdfDownloadTooltip}
              downloadHistory={downloadHistory}
              showSignAttest={showSignAttest}
              onSignAttest={onSignAttest}
              isAttesting={isAttesting}
              showApproveValuation={showApproveValuation}
              onApproveValuation={onApproveValuation}
              isApprovingValuation={isApprovingValuation}
              approveValuationLabel={approveValuationLabel}
              signAttestLabel={signAttestLabel}
            />
          </div>

          <div className="col-span-2 row-start-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-1 pb-0.5 md:hidden">
            <CalculatorNavMethodSelector
              compactMethodLabel={compactMethodLabel}
              displayPreSelectedMethod={displayPreSelectedMethod}
              methodTriggerLabel={methodTriggerLabel}
              onPlanLockedMethodAction={onPlanLockedMethodAction}
              onPreSelectMethod={onPreSelectMethod}
              onToggleMethod={onToggleMethod}
              planLockedMethodKeys={planLockedMethodKeys}
              preSelectableMethods={preSelectableMethods}
              preSelectedMethods={preSelectedMethods}
              t={t}
              variant="mobile"
            />
            <AnimatePresence>
              {displaySummary && hasReport && onContinueToListing && (
                <motion.button
                  type="button"
                  title={t('valuation.listingPriceTooltip')}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={onContinueToListing}
                  className={cn(
                    'flex h-11 min-w-[5.25rem] max-w-[6.75rem] shrink-0 items-center gap-1.5 rounded-lg px-2',
                    'bg-primary/15 border border-primary/25',
                    'text-primary text-xs font-medium',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
                  )}
                >
                  <span className={confidenceDotClassName(displaySummary.confidence)} aria-hidden />
                  <span className="min-w-0 truncate font-mono text-[11px] font-semibold tracking-normal">
                    {formatPrice(displaySummary.askPrice)}
                  </span>
                  <ArrowRight className="w-3 h-3 shrink-0" />
                </motion.button>
              )}
            </AnimatePresence>

            <Tooltip content={t('assistant.title')}>
              <button
                type="button"
                onClick={onOpenAssistant}
                className={cn(
                  'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors',
                  isAssistantOpen
                    ? 'text-primary bg-primary/10'
                    : 'text-foreground/50 hover:text-foreground'
                )}
              >
                <MessageCircle className="w-4 h-4" />
                {openTasksCount > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center px-1 text-[10px] font-bold rounded-full bg-secondary text-secondary-foreground shadow-sm"
                    aria-label={
                      navLocale === 'nl'
                        ? `${openTasksCount} openstaande taak${openTasksCount === 1 ? '' : 'en'} in de assistent`
                        : `${openTasksCount} pending task${openTasksCount === 1 ? '' : 's'} in assistant`
                    }
                  >
                    {openTasksCount > 9 ? '9+' : openTasksCount}
                  </span>
                )}
              </button>
            </Tooltip>

            <ToolbarOverflowMenu
              navLocale={navLocale}
              t={t}
              hasReport={hasReport}
              rightPanelView={rightPanelView}
              showSourceDataToggle={showSourceDataToggle}
              sourceDataOpen={sourceDataOpen}
              onToggleSourceData={onToggleSourceData}
              onShowHistory={onShowHistory}
              onDownload={onDownload}
              onRedownload={onRedownload}
              onFullscreen={onFullscreen}
              onPreview={onPreview}
              onOpenNormalization={onOpenNormalization}
              normalizationCount={normalizationCount}
              normalizationFeatureLocked={normalizationFeatureLocked}
              onNormalizationFeatureLocked={onNormalizationFeatureLocked}
              isExporting={isExporting}
              pdfPlanLocked={pdfPlanLocked}
              pdfDownloadTooltip={pdfDownloadTooltip}
              downloadHistory={downloadHistory}
              compactTouchTarget
              showSignAttest={showSignAttest}
              onSignAttest={onSignAttest}
              isAttesting={isAttesting}
              showApproveValuation={showApproveValuation}
              onApproveValuation={onApproveValuation}
              isApprovingValuation={isApprovingValuation}
              approveValuationLabel={approveValuationLabel}
              signAttestLabel={signAttestLabel}
            />
          </div>

          <div className="hidden h-5 w-px bg-foreground/[0.08] mx-2 md:block" />

          <CalculatorNavUserMenu
            avatarUrl={avatarUrl}
            isAccountantMode={isAccountantMode}
            onAccountSettings={onAccountSettings}
            onLogout={onLogout}
            onNavigateToBilling={onNavigateToBilling}
            onNavigateToDashboard={onNavigateToDashboard}
            onNavigateToHelp={onNavigateToHelp}
            onSwitchWorkspace={onSwitchWorkspace}
            userEmail={userEmail}
            userInitials={userInitials}
            userName={userName}
          />
        </div>
      </nav>
    </TooltipProvider>
  )
}

export default CalculatorNav
