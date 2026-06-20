import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Check, ChevronDown, GitBranch, Pencil } from 'lucide-react'
import type { useTranslations } from 'next-intl'
import { cn } from '@/design-system/utils'
import type { ValuationVersion } from './CalculatorNav.types'
import {
  type CalculatorNavDisplaySummary,
  confidenceDotClassName,
  formatPrice,
} from './CalculatorNav.utils'
import { Dropdown } from './CalculatorNavDropdown'

interface CalculatorNavValuationSummaryProps {
  activeVersionId?: string
  displaySummary: CalculatorNavDisplaySummary | null
  hasReport: boolean
  navLocale: string
  onContinueToListing?: () => void
  onOpenValuationEdit?: () => void
  onSelectVersion?: (id: string) => void
  onVersionControlFeatureLocked?: () => void
  t: ReturnType<typeof useTranslations>
  valuationVersions: ValuationVersion[]
  versionControlFeatureLocked: boolean
}

export function CalculatorNavValuationSummary({
  activeVersionId,
  displaySummary,
  hasReport,
  navLocale,
  onContinueToListing,
  onOpenValuationEdit,
  onSelectVersion,
  onVersionControlFeatureLocked,
  t,
  valuationVersions,
  versionControlFeatureLocked,
}: CalculatorNavValuationSummaryProps) {
  return (
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
                                      isSelectedVersion ? 'text-foreground' : 'text-foreground/80'
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
  )
}
