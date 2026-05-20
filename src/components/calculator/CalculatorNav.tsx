'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  Clock,
  CreditCard,
  Eye,
  FileSpreadsheet,
  FileText,
  GitBranch,
  HelpCircle,
  Home,
  Loader2,
  LogOut,
  MessageCircle,
  MoreVertical,
  Pencil,
  Settings,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useTransitionRouter } from 'next-view-transitions'
import { useMemo, useState } from 'react'
import { MethodSelectorMenu } from '@/components/calculator/method-selector-menu'
import {
  getPreSelectableMethodsForFirm,
  resolveDisplayPreSelectedMethodKey,
} from '@/constants/methodFieldConfig'
import { METHOD_LABEL_KEYS } from '@/constants/methodLabels'
import { AuroraButton, Tooltip, TooltipProvider } from '@/design-system'
import { cn } from '@/design-system/utils'
import type { CalculatorNavProps } from './CalculatorNav.types'
import {
  confidenceDotClassName,
  formatPrice,
  formatTimeAgo,
  valuationNavAmountClass,
} from './CalculatorNav.utils'
import { Dropdown } from './CalculatorNavDropdown'
import { ToolbarOverflowMenu } from './CalculatorNavToolbarOverflowMenu'

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
}: CalculatorNavProps) {
  const t = useTranslations()
  const navLocale = useLocale()
  const router = useTransitionRouter()
  const [avatarError, setAvatarError] = useState(false)
  const showAvatar = avatarUrl && !avatarError

  const activeVersion =
    valuationVersions.find((v) => v.id === selectedVersionId) || valuationVersions[0]
  const displaySummary =
    valuationSummary ||
    (activeVersion
      ? {
          priceRange: activeVersion.priceRange,
          askPrice: activeVersion.askPrice,
          confidence: 'high' as const,
        }
      : null)

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
  // Neutral tooltip — the actual upsell copy (Starter for advisors vs. invite-
  // your-advisor for business owners) is rendered by the audience-aware
  // paywall modal that opens on click. Keeping the tooltip neutral avoids
  // showing advisor SaaS pricing to sellers in a hover state.
  const pdfDownloadTooltip = pdfPlanLocked
    ? navLocale === 'nl'
      ? 'Read-only met watermerk — klik voor opties om de PDF zonder watermerk te ontgrendelen'
      : 'Read-only with watermark — click for options to unlock the watermark-free PDF'
    : null

  const selectedMethodLabel = t(
    METHOD_LABEL_KEYS[displayPreSelectedMethod] ?? 'manualInput.methodSelector.adaptiveRecommended'
  )
  const multiMethodCount = preSelectedMethods?.length ?? 0
  const isMultiMethod =
    multiMethodCount > 1 && !(preSelectedMethods ?? []).includes('upswitch_adaptive')
  const compactMethodLabel = isMultiMethod
    ? `${multiMethodCount} ${t('manualInput.methodSelector.methods')}`
    : displayPreSelectedMethod === 'upswitch_adaptive'
      ? t('manualInput.methodSelector.adaptiveShort')
      : selectedMethodLabel
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
          'relative h-14 w-full shrink-0 grid items-center gap-x-2 sm:gap-x-4 px-3 sm:px-4',
          'grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]',
          'border-b border-foreground/[0.06] bg-background',
          'pt-[env(safe-area-inset-top)]'
        )}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Tooltip
            content={
              isAccountantMode ? t('clientContext.exitClientView') : t('common.actions.back')
            }
          >
            <button
              type="button"
              onClick={handleBack}
              className="p-2 -ml-1 sm:-ml-2 rounded-lg text-foreground/50 hover:text-foreground hover:bg-foreground/[0.04] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Tooltip>

          <Dropdown
            trigger={
              <button
                type="button"
                className="flex items-center gap-1 sm:gap-1.5 font-medium text-foreground hover:text-primary transition-colors group min-w-0 flex-1 max-w-[180px] sm:max-w-[260px] lg:max-w-[320px] min-h-[44px] rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <span className="truncate text-sm sm:text-base">
                  {companyName || t('toast.newEstimation')}
                </span>
                <ChevronDown className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-foreground/40 group-hover:text-primary shrink-0" />
              </button>
            }
          >
            <div className="p-2">
              <div className="text-xs text-foreground/50 uppercase tracking-wider px-2 py-1.5">
                {t('valuation.recentValuations')}
              </div>
              {recentValuations.length > 0 ? (
                recentValuations.slice(0, 5).map((val) => {
                  const isActive = !!activeReportId && val.id === activeReportId
                  return (
                    <div
                      key={val.id}
                      className={cn(
                        'flex items-center gap-2 group rounded-lg transition-colors',
                        isActive
                          ? 'bg-primary/10 ring-1 ring-primary/20'
                          : 'hover:bg-foreground/[0.04]'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectValuation?.(val.id)}
                        className="flex-1 flex items-center gap-3 px-2 py-2 min-w-0 text-left"
                      >
                        <div className="w-8 h-8 rounded-lg bg-foreground/[0.04] flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4 text-foreground/50" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {val.companyName}
                          </p>
                          <div className="flex items-center gap-1.5 text-xs text-foreground/40">
                            <Clock className="w-3 h-3" />
                            <span>{formatTimeAgo(val.updatedAt, t)}</span>
                            {val.isDraft && (
                              <span className="px-1.5 py-0.5 rounded bg-warning/10 text-warning text-[10px] font-medium">
                                {t('valuation.draft')}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                      {onDeleteValuation && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="shrink-0"
                        >
                          {deletingValuationId === val.id ? (
                            <div
                              className="p-1.5 rounded-lg text-foreground/40 flex items-center justify-center"
                              aria-label={t('common.states.processing')}
                            >
                              <Loader2 className="w-4 h-4 animate-spin" />
                            </div>
                          ) : (
                            <Dropdown
                              trigger={
                                <button
                                  type="button"
                                  className="p-1.5 rounded-lg opacity-60 hover:opacity-100 hover:bg-foreground/[0.08] text-foreground/50 hover:text-foreground transition-all"
                                  aria-label="More actions"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                              }
                              align="end"
                            >
                              <div className="p-1">
                                {onOpenValuationEdit && val.id === activeReportId && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onOpenValuationEdit()
                                    }}
                                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-foreground/70 hover:text-foreground hover:bg-foreground/[0.04] transition-colors text-sm"
                                  >
                                    <Pencil className="w-4 h-4" />
                                    {t('valuationEditModal.editValuation')}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        t('valuation.deleteReportConfirm', {
                                          name: val.companyName || t('valuation.untitledValuation'),
                                        })
                                      )
                                    ) {
                                      onDeleteValuation(val)
                                    }
                                  }}
                                  className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-destructive hover:bg-destructive/10 transition-colors text-sm"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  {t('common.actions.delete')}
                                </button>
                              </div>
                            </Dropdown>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              ) : (
                <div className="px-3 py-4 text-center">
                  <p className="text-sm text-foreground/40">{t('valuation.noRecent')}</p>
                </div>
              )}
              <div className="h-px bg-foreground/[0.06] my-2" />
              {!isCalculating && onNewValuation && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onNewValuation()
                  }}
                  className="w-full px-2 py-2 rounded-lg text-primary font-medium hover:bg-primary/10 transition-colors text-left"
                >
                  + {t('valuation.new')}
                </button>
              )}
            </div>
          </Dropdown>

          {onPreSelectMethod && (
            <div className="hidden sm:flex min-w-0 items-center">
              <div className="h-5 w-px bg-foreground/[0.08] ml-1.5 mr-4 shrink-0" aria-hidden />
              <Dropdown
                keepOpen
                trigger={
                  <button
                    type="button"
                    aria-haspopup="listbox"
                    title={methodTriggerLabel}
                    aria-label={methodTriggerLabel}
                    className="group flex min-w-0 max-w-[126px] lg:max-w-[160px] items-center gap-2 rounded-full min-h-[40px] border border-foreground/[0.06] bg-foreground/[0.03] px-2.5 py-1.5 text-sm font-medium text-foreground/80 hover:bg-foreground/[0.06] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-foreground/55 group-hover:text-foreground/70 shrink-0" />
                    <span className="truncate min-w-0 flex-1 text-left">{compactMethodLabel}</span>
                    <ChevronDown className="w-3 h-3 text-foreground/40 group-hover:text-foreground/60 shrink-0" />
                  </button>
                }
              >
                <MethodSelectorMenu
                  preSelectedMethod={displayPreSelectedMethod}
                  preSelectedMethods={preSelectedMethods}
                  onPreSelectMethod={onPreSelectMethod}
                  onToggleMethod={onToggleMethod}
                  methods={preSelectableMethods}
                  t={t}
                  lockedMethodKeys={planLockedMethodKeys}
                  onLockedMethodClick={onPlanLockedMethodAction}
                />
              </Dropdown>
            </div>
          )}
        </div>

        <div className="hidden md:flex min-w-0 items-center justify-center px-2 lg:px-4">
          <AnimatePresence mode="wait">
            {displaySummary && hasReport && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 1 }}
                className="flex items-center shrink-0"
              >
                <div
                  className={cn(
                    'flex items-center rounded-full',
                    'bg-foreground/[0.03] border border-foreground/[0.06]',
                    'p-0.5 gap-0.5'
                  )}
                >
                  <Dropdown
                    trigger={
                      <button
                        type="button"
                        title={t('valuation.listingPriceTooltip')}
                        className={cn(
                          'flex items-center gap-2.5 pl-3 pr-2.5 py-1.5 rounded-full',
                          'hover:bg-foreground/[0.04] transition-colors',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                          'group cursor-pointer'
                        )}
                      >
                        <span
                          className={confidenceDotClassName(displaySummary.confidence)}
                          aria-hidden
                        />
                        <span className={valuationNavAmountClass}>
                          {formatPrice(displaySummary.askPrice)}
                        </span>
                        <span
                          className={cn(
                            valuationNavAmountClass,
                            // The full range fits at lg+ now that secondary
                            // actions live in the overflow menu; below lg the
                            // dropdown still surfaces the full range on click.
                            'hidden lg:inline'
                          )}
                        >
                          {formatPrice(displaySummary.priceRange.min)}–
                          {formatPrice(displaySummary.priceRange.max)}
                        </span>
                        <ChevronDown className="w-3 h-3 text-foreground/30 group-hover:text-foreground/50 transition-colors" />
                      </button>
                    }
                    align="center"
                  >
                    <div className="p-2 w-72">
                      <div className="text-[11px] text-foreground/40 uppercase tracking-wider font-medium px-2 py-1">
                        {t('valuation.versions')}
                      </div>
                      <div className="relative rounded-lg">
                        <div
                          className={cn(
                            versionControlFeatureLocked &&
                              'blur-[1.5px] opacity-[0.88] saturate-75 pointer-events-none'
                          )}
                        >
                          {valuationVersions.length > 0 ? (
                            valuationVersions.map((version) => (
                              <button
                                key={version.id}
                                type="button"
                                onClick={() => onSelectVersion?.(version.id)}
                                className={cn(
                                  'w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors',
                                  version.id === selectedVersionId
                                    ? 'bg-primary/[0.08]'
                                    : 'hover:bg-foreground/[0.04]'
                                )}
                              >
                                {version.id === selectedVersionId ? (
                                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                                    <Check className="w-3 h-3 text-primary" />
                                  </div>
                                ) : (
                                  <div className="w-5 h-5 rounded-full bg-foreground/[0.06] flex items-center justify-center">
                                    <GitBranch className="w-3 h-3 text-foreground/30" />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0 text-left">
                                  <p
                                    className={cn(
                                      'text-sm font-medium',
                                      version.id === selectedVersionId
                                        ? 'text-foreground'
                                        : 'text-foreground/80'
                                    )}
                                  >
                                    {version.label}
                                  </p>
                                  <p className={valuationNavAmountClass}>
                                    {formatPrice(version.priceRange.min)}–
                                    {formatPrice(version.priceRange.max)} ·{' '}
                                    {formatPrice(version.askPrice)}
                                  </p>
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="px-3 py-3 text-center">
                              <p className="text-sm text-foreground/40">
                                {t('valuation.currentVersion')}
                              </p>
                            </div>
                          )}
                          {versionControlFeatureLocked && (
                            <div className="mx-2 mb-1 rounded-lg border border-dashed border-amber-500/25 bg-amber-500/[0.04] px-2 py-2">
                              <p className="text-[11px] font-medium text-foreground/45 blur-[1px]">
                                {navLocale === 'nl'
                                  ? 'Overschrijven & verfijnen + volledig auditspoor'
                                  : 'Overwrite & refine + full audit trail'}
                              </p>
                              <p className="text-[10px] text-amber-800/80 dark:text-amber-200/80 font-semibold mt-0.5">
                                Starter+
                              </p>
                            </div>
                          )}
                        </div>
                        {versionControlFeatureLocked && (
                          <button
                            type="button"
                            className="absolute inset-0 z-[1] flex items-end justify-center pb-2 rounded-lg bg-background/25"
                            onClick={onVersionControlFeatureLocked}
                            aria-label={
                              navLocale === 'nl'
                                ? 'Upgrade om te overschrijven & verfijnen'
                                : 'Upgrade for overwrite & refine'
                            }
                          />
                        )}
                      </div>
                      {onOpenValuationEdit && (
                        <>
                          <div className="mx-2 my-1 border-t border-foreground/[0.06]" />
                          <button
                            type="button"
                            onClick={() => onOpenValuationEdit()}
                            className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-foreground/60 hover:text-foreground hover:bg-foreground/[0.04] transition-colors text-sm"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            {t('valuationEditModal.editValuation')}
                          </button>
                        </>
                      )}
                    </div>
                  </Dropdown>

                  {onContinueToListing && (
                    <button
                      type="button"
                      onClick={onContinueToListing}
                      className={cn(
                        'flex items-center gap-1.5 pl-3 pr-2.5 py-1.5 rounded-full',
                        'bg-primary text-primary-foreground',
                        'hover:bg-primary/90 active:bg-primary/95',
                        'transition-colors font-medium text-sm',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2'
                      )}
                    >
                      <span>{t('common.continue')}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right: Assistant Button + Report Actions + User Avatar */}
        <div className="flex min-w-0 items-center justify-self-end">
          {/* Action buttons - grouped with Assistant */}
          <div className="hidden sm:flex items-center gap-0.5">
            {/* Assistant Button - Primary action (Clarity parity) */}
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

            {/* Normalization Hub Button - Secondary action (Clarity parity) */}
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

            {/* Divider separates the primary action cluster from the secondary
                container — the overflow menu — and the user identity */}
            <div className="h-5 w-px bg-foreground/[0.08] mx-1" />

            {/* Overflow menu: Brondata, Versiegeschiedenis, Download (+ recent), Fullscreen */}
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
            />
          </div>

          {/* Mobile actions */}
          <div className="flex min-w-0 sm:hidden items-center gap-1">
            {/* Mobile method selector — compact labeled trigger */}
            {onPreSelectMethod && (
              <Dropdown
                keepOpen
                trigger={
                  <button
                    type="button"
                    aria-haspopup="listbox"
                    title={methodTriggerLabel}
                    aria-label={methodTriggerLabel}
                    className="flex shrink-0 items-center gap-1.5 px-2 py-1.5 rounded-lg min-h-[44px] border border-foreground/[0.06] bg-foreground/[0.03] text-xs font-medium text-foreground hover:bg-foreground/[0.05] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-foreground/55 shrink-0" />
                    <span className="text-foreground/60">
                      {t('manualInput.methodSelector.label')}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-foreground/40 shrink-0" />
                  </button>
                }
              >
                <MethodSelectorMenu
                  preSelectedMethod={displayPreSelectedMethod}
                  preSelectedMethods={preSelectedMethods}
                  onPreSelectMethod={onPreSelectMethod}
                  onToggleMethod={onToggleMethod}
                  methods={preSelectableMethods}
                  t={t}
                  lockedMethodKeys={planLockedMethodKeys}
                  onLockedMethodClick={onPlanLockedMethodAction}
                />
              </Dropdown>
            )}
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
                    'flex min-w-0 items-center gap-1.5 px-2 py-1.5 rounded-lg',
                    'bg-primary/15 border border-primary/25',
                    'text-primary text-xs font-medium',
                    'min-h-[44px]'
                  )}
                >
                  <span className={confidenceDotClassName(displaySummary.confidence)} aria-hidden />
                  <span className="truncate max-w-[72px]">
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
                  'relative p-2 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center',
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

            {/* Normalisaties — promoted to mobile so the pending-count badge is never hidden */}
            {onOpenNormalization && (
              <Tooltip
                content={
                  normalizationFeatureLocked
                    ? navLocale === 'nl'
                      ? 'EBITDA-normalisatie — Starter+'
                      : 'EBITDA normalization — Starter+'
                    : t('normalization.title')
                }
              >
                <button
                  type="button"
                  onClick={
                    normalizationFeatureLocked
                      ? (onNormalizationFeatureLocked ?? onOpenNormalization)
                      : onOpenNormalization
                  }
                  className={cn(
                    'relative p-2 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center',
                    'text-foreground/50 hover:text-foreground',
                    normalizationFeatureLocked &&
                      'blur-[1px] opacity-90 saturate-75 ring-1 ring-amber-500/15'
                  )}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  {normalizationCount > 0 && (
                    <span
                      className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center px-1 text-[10px] font-bold rounded-full bg-primary/15 text-primary shadow-sm"
                      aria-label={
                        navLocale === 'nl'
                          ? `${normalizationCount} normalisatie${normalizationCount === 1 ? '' : 's'} ter beoordeling`
                          : `${normalizationCount} pending normalization${normalizationCount === 1 ? '' : 's'}`
                      }
                    >
                      {normalizationCount > 9 ? '9+' : normalizationCount}
                    </span>
                  )}
                </button>
              </Tooltip>
            )}

            {/* Mobile overflow — same surface as desktop, with 44px tap target */}
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
              compactTouchTarget
            />
          </div>

          {/* Separator before avatar */}
          <div className="h-5 w-px bg-foreground/[0.08] mx-1 sm:mx-2" />

          {/* User Avatar with Dropdown — Mercury parity */}
          <Dropdown
            variant="glass"
            trigger={
              <button
                type="button"
                data-testid="user-menu"
                aria-haspopup="menu"
                aria-label={userName ? t('account.accountMenu') : t('account.guestMenu')}
                className={cn(
                  'relative flex items-center justify-center w-8 h-8 rounded-full overflow-hidden',
                  'bg-primary/20 border-2 border-foreground/10',
                  'text-foreground/70 font-medium text-xs',
                  'hover:ring-2 hover:ring-primary/30 transition-all',
                  'focus:outline-none focus:ring-2 focus:ring-primary/50',
                  'p-0.5 flex items-center justify-center'
                )}
              >
                {showAvatar ? (
                  <img
                    src={avatarUrl}
                    alt={userName || t('account.accountMenu')}
                    className="w-full h-full object-cover rounded-full"
                    onError={() => setAvatarError(true)}
                  />
                ) : (
                  <span className="text-foreground/70 font-medium">
                    {userInitials?.charAt(0)?.toUpperCase() || '?'}
                  </span>
                )}
              </button>
            }
            align="end"
          >
            <div className="p-1.5 w-56 min-w-[220px]" role="menu">
              {/* Header — Mercury AvatarMenuHeader parity */}
              <div className="px-3 py-3 border-b border-foreground/10 mb-1.5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden border border-foreground/10 flex-shrink-0">
                    {showAvatar ? (
                      <img
                        src={avatarUrl}
                        alt={userName || t('account.accountMenu')}
                        className="w-full h-full object-cover"
                        onError={() => setAvatarError(true)}
                      />
                    ) : (
                      <span className="text-foreground/70 font-medium text-sm">
                        {userInitials?.charAt(0)?.toUpperCase() || '?'}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {userName || t('historyPanel.guest')}
                    </p>
                    {userEmail && (
                      <p className="text-xs text-foreground/50 truncate">{userEmail}</p>
                    )}
                    {isAccountantMode && (
                      <p className="text-xs text-primary/80 mt-0.5">
                        {t('account.roleAccountantPro')}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Menu items — isAccountantMode: full Mercury menu; else: simple menu */}
              {isAccountantMode ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => onNavigateToDashboard?.()}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground/80 hover:text-foreground hover:bg-foreground/5 transition-colors"
                  >
                    <Home className="w-4 h-4 text-foreground/50" />
                    <span>{t('account.returnToDashboard')}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => onAccountSettings?.()}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground/80 hover:text-foreground hover:bg-foreground/5 transition-colors"
                  >
                    <Settings className="w-4 h-4 text-foreground/50" />
                    <span>{t('account.settings')}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => onNavigateToBilling?.()}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground/80 hover:text-foreground hover:bg-foreground/5 transition-colors"
                  >
                    <CreditCard className="w-4 h-4 text-foreground/50" />
                    <span>{t('account.billing')}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => onNavigateToHelp?.()}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground/80 hover:text-foreground hover:bg-foreground/5 transition-colors"
                  >
                    <HelpCircle className="w-4 h-4 text-foreground/50" />
                    <span>{t('account.helpCenter')}</span>
                  </button>
                  <div className="h-px bg-foreground/10 -mx-1 my-1.5" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => onLogout?.()}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>{t('auth.logout')}</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => onAccountSettings?.()}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground/80 hover:text-foreground hover:bg-foreground/5 transition-colors"
                  >
                    <Settings className="w-4 h-4 text-foreground/50" />
                    <span>{t('account.settings')}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => onSwitchWorkspace?.()}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground/80 hover:text-foreground hover:bg-foreground/5 transition-colors"
                  >
                    <Building2 className="w-4 h-4 text-foreground/50" />
                    <span>{t('account.switchWorkspace')}</span>
                  </button>
                  <div className="h-px bg-foreground/10 -mx-1 my-1.5" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => onLogout?.()}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>{t('auth.logout')}</span>
                  </button>
                </>
              )}
            </div>
          </Dropdown>
        </div>
      </nav>
    </TooltipProvider>
  )
}

export default CalculatorNav
