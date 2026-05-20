'use client'

import { LayoutGrid, LayoutList, Table2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type React from 'react'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/design-system/components/Tooltip'
import { cn } from '@/design-system/utils'

export type NormalizationViewMode = 'bento' | 'compact' | 'financial'

interface UnifiedNormalizationEditorToolbarProps {
  availableYears: number[]
  yearFilter: number | null
  viewMode: NormalizationViewMode
  onYearFilterChange: (year: number | null) => void
  onViewModeChange: (mode: NormalizationViewMode) => void
}

export function UnifiedNormalizationEditorToolbar({
  availableYears,
  yearFilter,
  viewMode,
  onYearFilterChange,
  onViewModeChange,
}: UnifiedNormalizationEditorToolbarProps) {
  const nh = useTranslations('normalizationHub')

  return (
    <div className="px-6 py-3 border-t border-foreground/[0.06] bg-muted/30 shrink-0">
      <div className="flex items-center justify-end gap-4">
        <div className="flex items-center gap-3">
          {availableYears.length > 1 && (
            <div className="flex items-center gap-1 p-1 rounded-xl bg-background/80 border border-foreground/[0.06]">
              <button
                onClick={() => onYearFilterChange(null)}
                className={cn(
                  'px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all',
                  yearFilter === null
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-foreground/60 hover:text-foreground hover:bg-foreground/[0.05]'
                )}
              >
                {nh('all')}
              </button>
              {availableYears.slice(0, 4).map((year) => (
                <button
                  key={year}
                  onClick={() => onYearFilterChange(yearFilter === year ? null : year)}
                  className={cn(
                    'px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all tabular-nums',
                    yearFilter === year
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-foreground/60 hover:text-foreground hover:bg-foreground/[0.05]'
                  )}
                >
                  {year}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-0.5 p-1 rounded-xl bg-background/80 border border-foreground/[0.06]">
            <ViewModeButton
              active={viewMode === 'compact'}
              label={nh('viewCompact')}
              onClick={() => onViewModeChange('compact')}
            >
              <LayoutList className="w-3.5 h-3.5" />
            </ViewModeButton>
            <ViewModeButton
              active={viewMode === 'financial'}
              label={nh('viewFinancial')}
              onClick={() => onViewModeChange('financial')}
            >
              <Table2 className="w-3.5 h-3.5" />
            </ViewModeButton>
            <ViewModeButton
              active={viewMode === 'bento'}
              label={nh('viewBento')}
              onClick={() => onViewModeChange('bento')}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </ViewModeButton>
          </div>
        </div>
      </div>
    </div>
  )
}

interface ViewModeButtonProps {
  active: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
}

function ViewModeButton({ active, label, onClick, children }: ViewModeButtonProps) {
  return (
    <TooltipProvider>
      <TooltipRoot>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={cn(
              'p-1.5 rounded-lg transition-all',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-foreground/50 hover:text-foreground/70 hover:bg-foreground/[0.05]'
            )}
          >
            {children}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-[10px]">
          {label}
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  )
}
