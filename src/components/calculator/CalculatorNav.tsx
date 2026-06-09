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
  Plus,
  Settings,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Link, useTransitionRouter } from 'next-view-transitions'
import { useMemo, useState } from 'react'
import { MethodSelectorMenu } from '@/components/calculator/method-selector-menu'
import {
  getPreSelectableMethodsForFirm,
  resolveDisplayPreSelectedMethodKey,
} from '@/constants/methodFieldConfig'
import { AuroraButton, Tooltip, TooltipProvider } from '@/design-system'
import { cn } from '@/design-system/utils'
import { useAdvisorControlsModalStore } from '@/store/useAdvisorControlsModalStore'
import type { CalculatorNavProps } from './CalculatorNav.types'
import {
  confidenceDotClassName,
  formatPrice,
  formatTimeAgo,
  resolveCalculatorNavMethodLabels,
  resolvePdfDownloadTooltip,
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
  const [avatarError, setAvatarError] = useState(false)
  const showAvatar = avatarUrl && !avatarError
  const openAdvisorControlsModal = useAdvisorControlsModalStore((s) => s.setOpen)

  const activeVersion =
    valuationVersions.find((v) => v.id === selectedVersionId) ||
    valuationVersions.find((v) => v.isActive) ||
    valuationVersions[0]
  const activeVersionId = activeVersion?.id
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

          <Dropdown
            className="min-w-0 flex-1 md:flex-none"
            avoidViewportOverflow="mobile"
            trigger={
              <button
                type="button"
                className="group flex min-h-[44px] w-full min-w-0 items-center gap-1 rounded-lg font-medium text-foreground transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 md:flex-1 md:gap-1.5 md:max-w-[260px] lg:max-w-[320px]"
              >
                <span className="truncate text-sm md:text-base">
                  {companyName || t('toast.newEstimation')}
                </span>
                <ChevronDown className="w-3 md:w-3.5 h-3 md:h-3.5 text-foreground/40 group-hover:text-primary shrink-0" />
              </button>
            }
          >
            <div className="w-[min(20rem,calc(100vw-1.5rem))] p-2">
              <div className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold text-foreground/45">
                {t('valuation.recentValuations')}
              </div>
              {recentValuations.length > 0 ? (
                recentValuations.slice(0, 5).map((val) => {
                  const isActive = !!activeReportId && val.id === activeReportId
                  return (
                    <div
                      key={val.id}
                      className={cn(
                        'group flex items-center gap-1 rounded-lg border transition-all',
                        isActive
                          ? 'border-primary/20 bg-primary/[0.07] shadow-[inset_0_1px_0_hsl(var(--primary)/0.08)]'
                          : 'border-transparent hover:bg-foreground/[0.04]'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectValuation?.(val.id)}
                        aria-current={isActive ? 'page' : undefined}
                        className="grid min-w-0 flex-1 grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-3 px-2.5 py-2.5 text-left"
                      >
                        <div
                          className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-lg border',
                            isActive
                              ? 'border-primary/15 bg-primary/[0.08] text-primary'
                              : 'border-foreground/[0.06] bg-foreground/[0.035] text-foreground/45'
                          )}
                        >
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-5 text-foreground">
                              {val.companyName}
                            </p>
                            {val.isDraft && (
                              <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-warning/20 bg-warning/[0.08] px-1.5 text-[10px] font-semibold leading-none text-warning">
                                {t('valuation.draft')}
                              </span>
                            )}
                          </div>
                          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] leading-none text-foreground/45">
                            <Clock className="h-3 w-3 shrink-0" />
                            <span className="truncate">{formatTimeAgo(val.updatedAt, t)}</span>
                          </div>
                        </div>
                      </button>
                      {onDeleteValuation && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="shrink-0 pr-1"
                        >
                          {deletingValuationId === val.id ? (
                            <div
                              className="flex items-center justify-center rounded-lg p-1.5 text-foreground/40"
                              aria-label={t('common.states.processing')}
                            >
                              <Loader2 className="h-4 w-4 animate-spin" />
                            </div>
                          ) : (
                            <Dropdown
                              trigger={
                                <button
                                  type="button"
                                  className="rounded-lg p-1.5 text-foreground/45 opacity-70 transition-all hover:bg-foreground/[0.08] hover:text-foreground hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                                  aria-label={navLocale === 'nl' ? 'Meer acties' : 'More actions'}
                                >
                                  <MoreVertical className="h-4 w-4" />
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
                                    className="w-full flex items-center justify-start gap-2 px-2 py-2 rounded-lg text-left text-foreground/70 hover:text-foreground hover:bg-foreground/[0.04] transition-colors text-sm"
                                  >
                                    <Pencil className="w-4 h-4 shrink-0" />
                                    {t('valuationEditModal.editValuation')}
                                  </button>
                                )}
                                {/*
                                 * Advanced advisor controls — only on the
                                 * active valuation, because the modal binds
                                 * to the form-store currently in scope.
                                 * Adding it to non-active rows would open a
                                 * modal that silently mutates a different
                                 * valuation's draft.
                                 */}
                                {val.id === activeReportId && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      openAdvisorControlsModal(true)
                                    }}
                                    className="w-full flex items-center justify-start gap-2 px-2 py-2 rounded-lg text-left text-foreground/70 hover:text-foreground hover:bg-foreground/[0.04] transition-colors text-sm"
                                  >
                                    <SlidersHorizontal className="w-4 h-4 shrink-0" />
                                    {t(
                                      'manualInput.methodSelector.advancedAdvisorControls.kebabMenuItem'
                                    )}
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
                                  className="w-full flex items-center justify-start gap-2 px-2 py-2 rounded-lg text-left text-destructive hover:bg-destructive/10 transition-colors text-sm"
                                >
                                  <Trash2 className="w-4 h-4 shrink-0" />
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
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-primary transition-colors hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  {t('valuation.new')}
                </button>
              )}
            </div>
          </Dropdown>

          {onPreSelectMethod && (
            <div className="hidden md:flex min-w-0 items-center">
              <div className="h-5 w-px bg-foreground/[0.08] ml-1.5 mr-4 shrink-0" aria-hidden />
              <Dropdown
                keepOpen
                trigger={
                  <button
                    type="button"
                    aria-haspopup="listbox"
                    title={methodTriggerLabel}
                    aria-label={methodTriggerLabel}
                    className="group flex min-w-0 max-w-[140px] lg:max-w-[160px] items-center gap-2 rounded-full min-h-[40px] border border-foreground/[0.06] bg-foreground/[0.03] px-2.5 py-1.5 text-sm font-medium text-foreground/80 hover:bg-foreground/[0.06] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
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
                    'flex items-stretch rounded-full',
                    'border border-foreground/[0.07] bg-foreground/[0.03]',
                    'gap-0.5 p-0.5 shadow-[0_1px_0_hsl(var(--foreground)/0.04)]'
                  )}
                >
                  <Dropdown
                    trigger={
                      <button
                        type="button"
                        title={t('valuation.versionHistoryTooltip')}
                        aria-label={t('valuation.versionHistoryTooltip')}
                        className={cn(
                          'group flex items-center gap-2 rounded-full py-1.5 pl-2.5 pr-2',
                          'hover:bg-foreground/[0.04] transition-colors',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                          'cursor-pointer'
                        )}
                      >
                        <span
                          className={confidenceDotClassName(displaySummary.confidence)}
                          aria-hidden
                        />
                        <span className="font-mono text-sm font-semibold leading-none tracking-normal text-foreground tabular-nums">
                          {formatPrice(displaySummary.askPrice)}
                        </span>
                        <span
                          className={cn(
                            'hidden h-5 items-center rounded-full border border-foreground/[0.07] bg-background/45 px-2 font-mono text-[11px] font-semibold leading-none tracking-normal text-foreground/55 tabular-nums',
                            // The full range fits at lg+ now that secondary
                            // actions live in the overflow menu; below lg the
                            // dropdown still surfaces the full range on click.
                            'lg:inline-flex'
                          )}
                        >
                          {formatPrice(displaySummary.priceRange.min)}–
                          {formatPrice(displaySummary.priceRange.max)}
                        </span>
                        <ChevronDown className="h-3 w-3 text-foreground/30 transition-colors group-hover:text-foreground/50" />
                      </button>
                    }
                    align="center"
                  >
                    <div className="w-80 p-2">
                      <div className="px-2.5 pb-2 pt-1">
                        <div className="text-[11px] font-semibold text-foreground/45">
                          {t('valuation.versions')}
                        </div>
                        <div className="mt-0.5 text-[11px] leading-none text-foreground/35">
                          {t('historyPanel.versionsCount', {
                            count: Math.max(valuationVersions.length, 1),
                          })}
                        </div>
                      </div>
                      <div className="relative rounded-lg">
                        <div
                          className={cn(
                            versionControlFeatureLocked &&
                              'blur-[1.5px] opacity-[0.88] saturate-75 pointer-events-none'
                          )}
                        >
                          {valuationVersions.length > 0 ? (
                            valuationVersions.map((version) => {
                              const isSelectedVersion = version.id === activeVersionId

                              return (
                                <button
                                  key={version.id}
                                  type="button"
                                  onClick={() => onSelectVersion?.(version.id)}
                                  aria-current={isSelectedVersion ? 'true' : undefined}
                                  className={cn(
                                    'group/version mb-1 grid w-full grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-3 rounded-lg border px-2.5 py-2.5 transition-all last:mb-0',
                                    isSelectedVersion
                                      ? 'border-primary/20 bg-primary/[0.07]'
                                      : 'border-transparent hover:bg-foreground/[0.04]'
                                  )}
                                >
                                  {isSelectedVersion ? (
                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/15 bg-primary/[0.08] text-primary">
                                      <Check className="h-4 w-4" />
                                    </div>
                                  ) : (
                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-foreground/[0.06] bg-foreground/[0.035] text-foreground/40">
                                      <GitBranch className="h-4 w-4" />
                                    </div>
                                  )}
                                  <div className="min-w-0 text-left">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <p
                                        className={cn(
                                          'min-w-0 flex-1 truncate text-sm font-semibold leading-5',
                                          isSelectedVersion
                                            ? 'text-foreground'
                                            : 'text-foreground/80'
                                        )}
                                      >
                                        {version.label}
                                      </p>
                                      {isSelectedVersion && (
                                        <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-primary/20 bg-primary/10 px-1.5 text-[9px] font-semibold leading-none text-primary">
                                          {t('historyPanel.current')}
                                        </span>
                                      )}
                                    </div>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                      <span className="font-mono text-xs font-semibold leading-none tracking-normal text-foreground/80 tabular-nums">
                                        {formatPrice(version.askPrice)}
                                      </span>
                                      <span className="inline-flex h-5 items-center rounded-full border border-foreground/[0.07] bg-background/40 px-2 font-mono text-[11px] font-semibold leading-none tracking-normal text-foreground/50 tabular-nums">
                                        {formatPrice(version.priceRange.min)}–
                                        {formatPrice(version.priceRange.max)}
                                      </span>
                                    </div>
                                  </div>
                                </button>
                              )
                            })
                          ) : (
                            <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-3 rounded-lg border border-primary/20 bg-primary/[0.07] px-2.5 py-2.5">
                              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/15 bg-primary/[0.08] text-primary">
                                <Check className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 text-left">
                                <div className="flex min-w-0 items-center gap-2">
                                  <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-5 text-foreground">
                                    {t('valuation.currentVersion')}
                                  </p>
                                  <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-primary/20 bg-primary/10 px-1.5 text-[9px] font-semibold leading-none text-primary">
                                    {t('historyPanel.current')}
                                  </span>
                                </div>
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  <span className="font-mono text-xs font-semibold leading-none tracking-normal text-foreground/80 tabular-nums">
                                    {formatPrice(displaySummary.askPrice)}
                                  </span>
                                  <span className="inline-flex h-5 items-center rounded-full border border-foreground/[0.07] bg-background/40 px-2 font-mono text-[11px] font-semibold leading-none tracking-normal text-foreground/50 tabular-nums">
                                    {formatPrice(displaySummary.priceRange.min)}–
                                    {formatPrice(displaySummary.priceRange.max)}
                                  </span>
                                </div>
                              </div>
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
                            className="w-full flex items-center justify-start gap-2 px-2 py-2 rounded-lg text-left text-foreground/60 hover:text-foreground hover:bg-foreground/[0.04] transition-colors text-sm"
                          >
                            <Pencil className="w-3.5 h-3.5 shrink-0" />
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
                        'flex items-center gap-1.5 rounded-full py-1.5 pl-3 pr-2.5',
                        'bg-primary text-primary-foreground',
                        'hover:bg-primary/90 active:bg-primary/95',
                        'text-sm font-semibold transition-colors',
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
            {onPreSelectMethod && (
              <div className="min-w-0">
                <Dropdown
                  keepOpen
                  avoidViewportOverflow="mobile"
                  trigger={
                    <button
                      type="button"
                      aria-haspopup="listbox"
                      title={methodTriggerLabel}
                      aria-label={methodTriggerLabel}
                      className="flex h-11 w-full min-w-0 items-center gap-1.5 rounded-lg border border-foreground/[0.06] bg-foreground/[0.03] px-2 text-xs font-medium text-foreground transition-colors hover:bg-foreground/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-foreground/55" />
                      <span className="min-w-0 flex-1 truncate text-left text-foreground/70">
                        {compactMethodLabel}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-foreground/40" />
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

          <Dropdown
            variant="glass"
            avoidViewportOverflow="mobile"
            className="col-start-2 row-start-1 justify-self-end md:col-auto md:row-auto md:justify-self-auto"
            trigger={
              <button
                type="button"
                data-testid="user-menu"
                aria-haspopup="menu"
                aria-label={userName ? t('account.accountMenu') : t('account.guestMenu')}
                className={cn(
                  'relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full md:h-8 md:w-8',
                  'bg-primary/20 border-2 border-foreground/10',
                  'text-foreground/70 font-medium text-xs',
                  'hover:ring-2 hover:ring-primary/30 transition-all',
                  'focus:outline-none focus:ring-2 focus:ring-primary/50',
                  'p-1.5 md:p-0.5'
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
