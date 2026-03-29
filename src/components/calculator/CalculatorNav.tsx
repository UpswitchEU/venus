'use client'

/**
 * Calculator Navigation Bar
 *
 * Aurora by Upswitch — Calculator Nav
 * Minimal navigation with essential actions grouped logically.
 * Integrated with Venus's session store and i18n.
 */

import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  Database,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  GitBranch,
  HelpCircle,
  History,
  Home,
  Loader2,
  LogOut,
  Maximize2,
  MessageCircle,
  MoreVertical,
  Pencil,
  Settings,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useTransitionRouter } from 'next-view-transitions'
import React, { useMemo, useState } from 'react'
import {
  getPreSelectableMethodsForFirm,
  resolveDisplayPreSelectedMethodKey,
} from '@/constants/methodFieldConfig'
import { METHOD_LABEL_KEYS } from '@/constants/methodLabels'
import { MethodSelectorMenu } from '@/components/calculator/method-selector-menu'
import { AuroraButton, Avatar, Tooltip, TooltipProvider } from '@/design-system'
import { cn } from '@/design-system/utils'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export type RightPanelView = 'report' | 'preview' | 'history'

export interface RecentValuation {
  id: string
  companyName: string
  updatedAt: Date
  isDraft?: boolean
  deleteMode?: 'session' | 'report'
}

export interface ValuationVersion {
  id: string
  label: string
  priceRange: { min: number; max: number }
  askPrice: number
  timestamp: Date
  isActive?: boolean
}

// Download history item for the dropdown
export interface DownloadHistoryItem {
  id: string
  fileName: string
  timestamp: Date
  size?: string
  url?: string
}

export interface CalculatorNavProps {
  companyName?: string
  onBack?: () => void
  onDownload?: () => void | Promise<void>
  onFullscreen?: () => void
  onPreview?: () => void
  onShowHistory?: () => void
  hasReport?: boolean
  rightPanelView?: RightPanelView
  userName?: string
  userInitials?: string
  /** User email for dropdown header (Mercury parity) */
  userEmail?: string
  /** Avatar URL from Titan/Mercury auth - when set, shows profile image */
  avatarUrl?: string | null
  onAccountSettings?: () => void
  onSwitchWorkspace?: () => void
  onLogout?: () => void
  /** Accountant mode navigation (Mercury parity) */
  onNavigateToDashboard?: () => void
  onNavigateToBilling?: () => void
  onNavigateToHelp?: () => void
  // Recent valuations support
  recentValuations?: RecentValuation[]
  /** Current report ID for highlighting active valuation in dropdown */
  activeReportId?: string
  onSelectValuation?: (id: string) => void
  onDeleteValuation?: (valuation: RecentValuation) => void
  /** ID of valuation currently being deleted (shows loading state) */
  deletingValuationId?: string | null
  onNewValuation?: () => void
  /** Hide "New Valuation" when calculation is in progress */
  isCalculating?: boolean
  // Chat Co-pilot drawer
  onOpenAssistant?: () => void
  isAssistantOpen?: boolean
  // Normalization Hub - globally accessible
  onOpenNormalization?: () => void
  normalizationCount?: number
  // Open tasks counter
  openTasksCount?: number
  // Valuation summary
  valuationSummary?: {
    priceRange: { min: number; max: number }
    askPrice: number
    confidence: 'high' | 'medium' | 'low'
  }
  valuationVersions?: ValuationVersion[]
  selectedVersionId?: string
  onSelectVersion?: (id: string) => void
  onContinueToListing?: () => void
  // PDF export state
  isExporting?: boolean
  downloadHistory?: DownloadHistoryItem[]
  onRedownload?: (item: DownloadHistoryItem) => void
  // Accountant mode — back button exits client view
  isAccountantMode?: boolean
  onExitClientView?: () => void
  /** STP: import-quality provenance panel (trust but verify) */
  showSourceDataToggle?: boolean
  sourceDataOpen?: boolean
  onToggleSourceData?: () => void
  onOpenValuationEdit?: () => void
  // Upfront method pre-selection
  preSelectedMethod?: string
  onPreSelectMethod?: (method: string) => void
  // Multi-method selection for blended valuation
  preSelectedMethods?: string[]
  onToggleMethod?: (method: string) => void
  /** Accountant firm country — hides BE-only fiscal method for NL */
  firmCountryCode?: string
  /**
   * When provided (e.g. from ManualLayout), the allowed upfront methods — single source of truth.
   * Otherwise derived from country only (templates / legacy callers).
   */
  preSelectableMethodsForNav?: readonly string[]
}

// ─────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────

const formatTimeAgo = (date: Date, t: (key: string, values?: Record<string, number>) => string) => {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (diff < 1000 * 60 * 60) return t('common.time.minutesAgo', { count: minutes })
  if (diff < 1000 * 60 * 60 * 24) return t('common.time.hoursAgo', { count: hours })
  return t('common.time.daysAgo', { count: days })
}

/** Formats EV-style amounts for the nav; safe for any API/method (NaN, ±Inf, missing coerced to 0). */
const formatPrice = (value: number) => {
  if (!Number.isFinite(value)) {
    return '—'
  }
  if (value >= 1000000) {
    return `€${(value / 1000000).toFixed(1)}M`
  }
  return `€${Math.round(value / 1000)}K`
}

const valuationNavAmountClass = 'text-sm font-semibold text-foreground tracking-tight'

function confidenceDotClassName(confidence: 'high' | 'medium' | 'low') {
  const base = 'w-1.5 h-1.5 rounded-full shrink-0'
  switch (confidence) {
    case 'high':
      return cn(base, 'bg-success')
    case 'medium':
      return cn(base, 'bg-warning')
    case 'low':
      return cn(base, 'bg-destructive')
    default:
      return cn(base, 'bg-foreground/40')
  }
}

// ─────────────────────────────────────────
// DROPDOWN MENU (Simple implementation)
// ─────────────────────────────────────────

interface DropdownProps {
  trigger: React.ReactNode
  children: React.ReactNode
  align?: 'start' | 'center' | 'end'
  variant?: 'default' | 'glass'
}

const Dropdown: React.FC<DropdownProps> = ({
  trigger,
  children,
  align = 'start',
  variant = 'default',
}) => {
  const [open, setOpen] = React.useState(false)
  const dropdownRef = React.useRef<HTMLDivElement>(null)
  const menuId = React.useId()

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  React.useEffect(() => {
    if (!open) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open])

  return (
    <div className="relative" ref={dropdownRef}>
      {React.isValidElement(trigger) ? (
        React.cloneElement(trigger as React.ReactElement<any>, {
          onClick: (event: React.MouseEvent) => {
            trigger.props.onClick?.(event)
            if (!event.defaultPrevented) setOpen((current: boolean) => !current)
          },
          'aria-expanded': open,
          'aria-controls': menuId,
        })
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setOpen((current) => !current)
            }
          }}
          aria-expanded={open}
          aria-controls={menuId}
        >
          {trigger}
        </div>
      )}
      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 1 }}
            className={cn(
              'absolute z-50 mt-2 min-w-[200px] rounded-xl border border-foreground/[0.08]',
              'backdrop-blur-xl shadow-xl',
              variant === 'glass' ? 'bg-background/80' : 'bg-background/95',
              align === 'end' && 'right-0',
              align === 'center' && 'left-1/2 -translate-x-1/2',
              align === 'start' && 'left-0'
            )}
            onClick={() => setOpen(false)}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────

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

  const selectedMethodLabel = t(
    METHOD_LABEL_KEYS[displayPreSelectedMethod] ?? 'manualInput.methodSelector.adaptiveRecommended'
  )
  const multiMethodCount = preSelectedMethods?.length ?? 0
  const isMultiMethod = multiMethodCount > 1 && !(preSelectedMethods ?? []).includes('upswitch_adaptive')
  const compactMethodLabel = isMultiMethod
    ? `${multiMethodCount} ${t('manualInput.methodSelector.methods')}`
    : displayPreSelectedMethod === 'upswitch_adaptive'
      ? t('manualInput.methodSelector.adaptive')
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
        {/* Left: Back + New Valuation + Title with Recent Valuations Dropdown */}
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

          {/* Title with Recent Valuations Dropdown */}
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

          {/* Method Pre-Selector — compact pill next to company name */}
          {onPreSelectMethod && (
            <div className="hidden sm:flex min-w-0 items-center">
              <div className="h-5 w-px bg-foreground/[0.08] ml-1.5 mr-4 shrink-0" aria-hidden />
              <Dropdown
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
                />
              </Dropdown>
            </div>
          )}
        </div>

        {/* Center: Valuation Summary */}
        <div className="hidden md:flex min-w-0 items-center justify-center px-2 lg:px-4">
          {/* Valuation Summary Pill */}
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
                  {/* Valuation display */}
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
                        <span className={valuationNavAmountClass}>
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
                <span>{t('assistant.title')}</span>
                <kbd className="hidden lg:inline-flex items-center px-1.5 py-0.5 rounded bg-foreground/[0.06] text-[10px] font-mono text-foreground/40 ml-1">
                  {t('assistant.shortcut')}
                </kbd>
                {openTasksCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold rounded-full bg-secondary text-secondary-foreground shadow-sm">
                    {openTasksCount > 9 ? '9+' : openTasksCount}
                  </span>
                )}
              </AuroraButton>
            </Tooltip>

            {/* Normalization Hub Button - Secondary action (Clarity parity) */}
            {onOpenNormalization && (
              <Tooltip content={t('normalization.title')}>
                <AuroraButton
                  variant="ghost"
                  size="sm"
                  onClick={onOpenNormalization}
                  className={cn(
                    'gap-1.5 mr-1 transition-all duration-200 relative',
                    'text-foreground/60 hover:text-foreground'
                  )}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>{t('normalization.title')}</span>
                  {normalizationCount > 0 && (
                    <span className="ml-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold rounded-full bg-primary/15 text-primary">
                      {normalizationCount}
                    </span>
                  )}
                </AuroraButton>
              </Tooltip>
            )}

            {showSourceDataToggle && onToggleSourceData && (
              <Tooltip
                content={
                  navLocale === 'nl'
                    ? 'Brongegevens — volledige trial balance & AI-uitleg (trust but verify)'
                    : 'Source data — full trial balance & AI rationale (trust but verify)'
                }
              >
                <AuroraButton
                  variant={sourceDataOpen ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={onToggleSourceData}
                  className={cn(
                    'gap-1.5 mr-1 transition-all duration-200',
                    sourceDataOpen ? '' : 'text-foreground/60 hover:text-foreground'
                  )}
                  aria-pressed={sourceDataOpen}
                >
                  <Database className="w-4 h-4" />
                  <span className="hidden lg:inline">
                    {navLocale === 'nl' ? 'Brondata' : 'Source'}
                  </span>
                </AuroraButton>
              </Tooltip>
            )}

            <div className="h-5 w-px bg-foreground/[0.08] mx-1" />

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

            <Tooltip content={hasReport ? t('report.history') : t('report.noReport')}>
              <button
                type="button"
                onClick={onShowHistory}
                disabled={!hasReport}
                className={cn(
                  'p-2 rounded-lg transition-all duration-200',
                  rightPanelView === 'history' && hasReport
                    ? 'text-primary bg-primary/15 ring-1 ring-primary/30 shadow-sm'
                    : hasReport
                      ? 'text-foreground/60 hover:text-foreground hover:bg-foreground/[0.06]'
                      : 'text-foreground/20 cursor-not-allowed'
                )}
                aria-label={t('report.history')}
                aria-pressed={rightPanelView === 'history'}
              >
                <History className="w-4 h-4" aria-hidden />
              </button>
            </Tooltip>

            <div className="h-5 w-px bg-foreground/[0.08] mx-1" />

            {/* PDF Download with Loading State + History Dropdown */}
            <Dropdown
              trigger={
                <button
                  type="button"
                  disabled={!hasReport}
                  className={cn(
                    'flex items-center gap-1 p-2 rounded-lg transition-colors',
                    hasReport
                      ? 'text-foreground/50 hover:text-foreground hover:bg-foreground/[0.04]'
                      : 'text-foreground/20 cursor-not-allowed'
                  )}
                >
                  {isExporting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <ChevronDown className="w-3 h-3 text-foreground/30" />
                </button>
              }
              align="end"
            >
              <div className="p-2 w-64">
                {/* Download Action */}
                <button
                  type="button"
                  onClick={onDownload}
                  disabled={isExporting}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-colors',
                    isExporting ? 'opacity-50 cursor-wait' : 'hover:bg-foreground/[0.04]'
                  )}
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span className="text-sm">{t('report.generatingPDF')}</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 text-foreground/50" />
                      <span className="text-sm">{t('report.downloadPDF')}</span>
                    </>
                  )}
                </button>

                {/* Download History */}
                {downloadHistory.length > 0 && (
                  <>
                    <div className="h-px bg-foreground/[0.06] my-2" />
                    <div className="text-[10px] text-foreground/40 uppercase tracking-wider font-medium px-2 py-1">
                      {t('report.recentDownloads')}
                    </div>
                    {downloadHistory.slice(0, 5).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onRedownload?.(item)}
                        className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-foreground/[0.04] transition-colors"
                      >
                        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-xs font-medium text-foreground truncate">
                            {item.fileName}
                          </p>
                          <p className="text-[10px] text-foreground/40">
                            {formatTimeAgo(item.timestamp, t)}
                            {item.size && ` · ${item.size}`}
                          </p>
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </Dropdown>

            <Tooltip content={hasReport ? t('report.fullscreen') : t('report.noReport')}>
              <button
                type="button"
                onClick={onFullscreen}
                disabled={!hasReport}
                aria-label={t('report.fullscreen')}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  hasReport
                    ? 'text-foreground/50 hover:text-foreground hover:bg-foreground/[0.04]'
                    : 'text-foreground/20 cursor-not-allowed'
                )}
              >
                <Maximize2 className="w-4 h-4" aria-hidden />
              </button>
            </Tooltip>
          </div>

          {/* Mobile actions */}
          <div className="flex min-w-0 sm:hidden items-center gap-1">
            {/* Mobile method selector — compact labeled trigger */}
            {onPreSelectMethod && (
              <Dropdown
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
                  'p-2 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center',
                  isAssistantOpen
                    ? 'text-primary bg-primary/10'
                    : 'text-foreground/50 hover:text-foreground'
                )}
              >
                <MessageCircle className="w-4 h-4" />
              </button>
            </Tooltip>
            {showSourceDataToggle && onToggleSourceData && (
              <Tooltip
                content={
                  navLocale === 'nl'
                    ? 'Brongegevens — volledige trial balance & AI-uitleg (trust but verify)'
                    : 'Source data — full trial balance & AI rationale (trust but verify)'
                }
              >
                <button
                  type="button"
                  onClick={onToggleSourceData}
                  className={cn(
                    'p-2 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center',
                    sourceDataOpen
                      ? 'text-primary bg-primary/10'
                      : 'text-foreground/50 hover:text-foreground'
                  )}
                  aria-pressed={sourceDataOpen}
                >
                  <Database className="w-4 h-4" />
                </button>
              </Tooltip>
            )}
            <Tooltip
              content={
                isExporting
                  ? t('common.exporting')
                  : hasReport
                    ? t('report.download')
                    : t('report.noReport')
              }
            >
              <button
                type="button"
                onClick={onDownload}
                disabled={!hasReport || isExporting}
                className={cn(
                  'p-2 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center',
                  isExporting
                    ? 'text-primary'
                    : hasReport
                      ? 'text-foreground/50 hover:text-foreground'
                      : 'text-foreground/20 cursor-not-allowed'
                )}
              >
                {isExporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
              </button>
            </Tooltip>
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
