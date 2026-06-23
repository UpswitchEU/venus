import { Calculator, FileSpreadsheet } from 'lucide-react'
import { AuroraButton as Button } from '@/design-system/components/Button'
import { cn } from '@/design-system/utils'

export interface NormalisationReviewStepHeaderLabels {
  original: string
  adjustment: string
  normalized: string
  toReviewShort: string
  rejectAll: string
  acceptAll: string
  adjustmentsCount: string
}

interface NormalisationReviewStepHeaderProps {
  companyName: string
  sourceLabel: string
  acceptedCount: number
  rejectedCount: number
  pendingCount: number
  originalEbitda: number
  totalAcceptedAdjustment: number
  normalizedEbitda: number
  labels: NormalisationReviewStepHeaderLabels
  formatCurrency: (amount: number) => string
  onRejectAll: () => void
  onAcceptAll: () => void
  isProcessing?: boolean
}

export function NormalisationReviewStepHeader({
  companyName,
  sourceLabel,
  acceptedCount,
  rejectedCount,
  pendingCount,
  originalEbitda,
  totalAcceptedAdjustment,
  normalizedEbitda,
  labels,
  formatCurrency,
  onRejectAll,
  onAcceptAll,
  isProcessing = false,
}: NormalisationReviewStepHeaderProps) {
  return (
    <>
      <div className="shrink-0 px-4 md:px-6 py-4 md:py-5 border-b border-foreground/[0.06]">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Calculator className="w-4 h-4 md:w-5 md:h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base md:text-lg font-semibold text-foreground truncate">
              Normalisatie Review
            </h2>
            <p className="text-xs md:text-sm text-foreground/50 truncate">{companyName}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3">
          <div className="flex items-center gap-1.5 px-2 py-0.5 md:px-2.5 md:py-1 rounded-full bg-foreground/[0.04] text-[10px] md:text-xs text-foreground/60 border border-foreground/[0.08]">
            <FileSpreadsheet className="w-3 h-3" />
            <span>{sourceLabel}</span>
          </div>
          <span className="text-[10px] md:text-xs text-foreground/40">
            {labels.adjustmentsCount}
          </span>
        </div>
      </div>

      <div className="shrink-0 px-4 md:px-6 py-3 md:py-4 border-b border-foreground/[0.06] bg-foreground/[0.01]">
        <div className="grid grid-cols-3 gap-2 md:gap-4">
          <div className="text-center">
            <p className="text-[8px] md:text-[10px] font-medium text-foreground/40 uppercase tracking-wider mb-0.5 md:mb-1">
              {labels.original}
            </p>
            <p className="text-sm md:text-lg font-mono font-semibold text-foreground/70 line-through">
              {formatCurrency(originalEbitda)}
            </p>
          </div>

          <div className="text-center">
            <p className="text-[8px] md:text-[10px] font-medium text-foreground/40 uppercase tracking-wider mb-0.5 md:mb-1">
              {labels.adjustment}
            </p>
            <p
              className={cn(
                'text-sm md:text-lg font-mono font-semibold',
                totalAcceptedAdjustment > 0
                  ? 'text-success'
                  : totalAcceptedAdjustment < 0
                    ? 'text-secondary'
                    : 'text-foreground/40'
              )}
            >
              {totalAcceptedAdjustment > 0 ? '+' : ''}
              {formatCurrency(totalAcceptedAdjustment)}
            </p>
          </div>

          <div className="text-center">
            <p className="text-[8px] md:text-[10px] font-medium text-primary uppercase tracking-wider mb-0.5 md:mb-1">
              {labels.normalized}
            </p>
            <p className="text-sm md:text-lg font-mono font-bold text-foreground">
              {formatCurrency(normalizedEbitda)}
            </p>
          </div>
        </div>
      </div>

      <div className="shrink-0 px-4 md:px-6 py-2 md:py-3 border-b border-foreground/[0.06] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 md:gap-4 text-[10px] md:text-xs text-foreground/50">
          <span>{acceptedCount} ✓</span>
          <span>{rejectedCount} ✗</span>
          {pendingCount > 0 && (
            <span className="text-primary font-medium">
              {pendingCount} {labels.toReviewShort}
            </span>
          )}
        </div>

        {pendingCount > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onRejectAll}
              disabled={isProcessing}
              className="text-foreground/50 text-xs px-2 md:px-3"
            >
              {labels.rejectAll}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onAcceptAll}
              disabled={isProcessing}
              className="text-xs px-2 md:px-3"
            >
              {labels.acceptAll}
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
