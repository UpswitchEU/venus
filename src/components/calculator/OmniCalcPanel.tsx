'use client'

import { Check, Download } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/design-system/utils'
import { AuroraButton } from '@/design-system/components/Button'
import type { ValuationMethodResult } from '../../types/valuation'
import { getOmniMethodEquityRange } from '../../utils/omniCalcRange'
import { buildZeroDraftCsv, downloadZeroDraftCsv } from '@/utils/zeroDraftCsv'

interface OmniCalcPanelProps {
  valuationResults: Record<string, ValuationMethodResult>
  selectedMethod: string
  onSelectMethod: (method: string) => void
  fiscalAnchor?: number | null
  compact?: boolean
  /** Accountant-only: export all methods to CSV (Zero Draft package) */
  showZeroDraftExport?: boolean
  zeroDraftReportId?: string
  zeroDraftBusinessName?: string | null
  zeroDraftCreatedAt?: string | null
}

const formatCurrency = (amount: number) =>
  amount >= 1_000_000
    ? `€${(amount / 1_000_000).toFixed(1)}M`
    : amount >= 1_000
      ? `€${(amount / 1_000).toFixed(0)}K`
      : `€${Math.round(amount)}`

export function OmniCalcPanel({
  valuationResults,
  selectedMethod,
  onSelectMethod,
  fiscalAnchor,
  compact = false,
  showZeroDraftExport = false,
  zeroDraftReportId,
  zeroDraftBusinessName,
  zeroDraftCreatedAt,
}: OmniCalcPanelProps) {
  const t = useTranslations('omniCalc')

  const entries = Object.entries(valuationResults)

  if (entries.length === 0) return null

  return (
    <div className={cn('space-y-2', compact ? 'px-3 py-2' : 'px-4 py-3')}>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">
          {t('title')}
        </h4>
        <span className="text-[10px] text-foreground/40">
          {entries.filter(([, m]) => m.available).length}/{entries.length} {t('available')}
        </span>
      </div>

      <div className="grid gap-1.5 grid-cols-1">
        {entries.map(([key, method]) => {
          const isSelected = key === selectedMethod
          const isAvailable = method.available
          const value = method.value != null ? Number(method.value) : null
          const range =
            isAvailable && value != null
              ? getOmniMethodEquityRange({
                  value: method.value,
                  available: method.available,
                  details: method.details ?? undefined,
                })
              : null

          return (
            <button
              key={key}
              type="button"
              disabled={!isAvailable}
              onClick={() => isAvailable && onSelectMethod(key)}
              className={cn(
                'w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-all',
                'border',
                isSelected
                  ? 'border-primary/50 bg-primary/5'
                  : isAvailable
                    ? 'border-border/50 hover:border-primary/30 hover:bg-primary/[0.02]'
                    : 'border-border/30 opacity-50 cursor-not-allowed',
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'text-sm font-medium truncate',
                    isSelected ? 'text-primary' : 'text-foreground',
                  )}>
                    {method.label}
                  </span>
                  {isSelected && (
                    <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                      <Check className="w-2.5 h-2.5" />
                      {t('selected')}
                    </span>
                  )}
                </div>
                {!isAvailable && method.unavailable_reason && (
                  <p className="text-[10px] text-foreground/40 mt-0.5 truncate">
                    {method.unavailable_reason}
                  </p>
                )}
              </div>

              <div className="text-right shrink-0">
                {isAvailable && value != null ? (
                  <>
                    <span className={cn(
                      'text-sm font-mono font-semibold tabular-nums',
                      isSelected ? 'text-primary' : 'text-foreground',
                    )}>
                      {formatCurrency(value)}
                    </span>
                    {range && (
                      <>
                        <span className="block text-[10px] text-foreground/30 tabular-nums">
                          {formatCurrency(range.low)} – {formatCurrency(range.high)}
                        </span>
                        <span className="block text-[9px] text-foreground/25 uppercase tracking-wide">
                          {range.source === 'model' ? t('rangeModel') : t('rangeIllustrative')}
                        </span>
                      </>
                    )}
                    {method.multiple_used != null && (
                      <span className="block text-[10px] text-foreground/40 tabular-nums">
                        {Number(method.multiple_used).toFixed(1)}x
                      </span>
                    )}
                    {method.wacc != null && (
                      <span className="block text-[10px] text-foreground/40 tabular-nums">
                        WACC {(Number(method.wacc) * 100).toFixed(1)}%
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-foreground/30">&mdash;</span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {fiscalAnchor != null && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-foreground/[0.02] border border-dashed border-border/50">
          <span className="text-[10px] font-medium text-foreground/50 uppercase tracking-wider">
            {t('fiscalAnchor')}
          </span>
          <span className="text-xs font-mono font-medium text-foreground/60 tabular-nums">
            {formatCurrency(Number(fiscalAnchor))}
          </span>
        </div>
      )}

      {showZeroDraftExport && zeroDraftReportId && entries.length > 0 && (
        <div className="pt-1 border-t border-border/40 space-y-1">
          <p className="text-[10px] text-foreground/45 leading-snug px-0.5">{t('zeroDraftBlurb')}</p>
          <AuroraButton
            type="button"
            variant="outline"
            size="sm"
            className="w-full text-xs gap-2"
            onClick={() => {
              const csv = buildZeroDraftCsv({
                reportId: zeroDraftReportId,
                businessName: zeroDraftBusinessName,
                createdAt: zeroDraftCreatedAt ?? undefined,
                fiscalAnchor: fiscalAnchor ?? undefined,
                selectedMethod,
                methods: valuationResults,
              })
              const rawName = t('zeroDraftFilename', { reportId: zeroDraftReportId })
              const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_')
              downloadZeroDraftCsv(safeName, csv)
            }}
          >
            <Download className="w-3.5 h-3.5" />
            {t('exportZeroDraft')}
          </AuroraButton>
        </div>
      )}
    </div>
  )
}
