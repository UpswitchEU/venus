import {
  ChevronDown,
  Clock,
  FileText,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import type { useTranslations } from 'next-intl'
import { cn } from '@/design-system/utils'
import { useAdvisorControlsModalStore } from '@/store/useAdvisorControlsModalStore'
import type { RecentValuation } from './CalculatorNav.types'
import { formatTimeAgo } from './CalculatorNav.utils'
import { Dropdown } from './CalculatorNavDropdown'

interface CalculatorNavRecentValuationsMenuProps {
  activeReportId?: string
  companyName?: string
  deletingValuationId?: string | null
  isCalculating: boolean
  navLocale: string
  onDeleteValuation?: (valuation: RecentValuation) => void
  onNewValuation?: () => void
  onOpenValuationEdit?: () => void
  onSelectValuation?: (id: string) => void
  recentValuations: RecentValuation[]
  t: ReturnType<typeof useTranslations>
}

export function CalculatorNavRecentValuationsMenu({
  activeReportId,
  companyName,
  deletingValuationId,
  isCalculating,
  navLocale,
  onDeleteValuation,
  onNewValuation,
  onOpenValuationEdit,
  onSelectValuation,
  recentValuations,
  t,
}: CalculatorNavRecentValuationsMenuProps) {
  const openAdvisorControlsModal = useAdvisorControlsModalStore((s) => s.setOpen)

  return (
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
  )
}
