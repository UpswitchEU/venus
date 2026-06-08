/**
 * Normalization Preview Component
 *
 * Displays live preview of normalization calculation in modal
 * Shows reported EBITDA → total adjustments → normalized EBITDA
 */

import { useLocale, useTranslations } from 'next-intl'
import React from 'react'
import { LEDGER_LABEL_TEXT_CLASSES } from '@/constants/ledgerLabelTypography'
import { cn } from '@/design-system/utils'
import { NORMALIZATION_CATEGORIES } from '../../config/normalizationCategories'
import { CustomAdjustment, NormalizationAdjustment } from '../../types/ebitdaNormalization'

interface NormalizationPreviewProps {
  reportedEbitda: number
  totalAdjustments: number
  normalizedEbitda: number
  year: number
  adjustments?: NormalizationAdjustment[]
  customAdjustments?: CustomAdjustment[]
  onRemoveAdjustment?: (categoryId: string) => void
  onRemoveCustomAdjustment?: (id: string) => void
}

export const NormalizationPreview: React.FC<NormalizationPreviewProps> = ({
  reportedEbitda,
  totalAdjustments,
  normalizedEbitda,
  year,
  adjustments = [],
  customAdjustments = [],
  onRemoveAdjustment,
  onRemoveCustomAdjustment,
}) => {
  const t = useTranslations('normalizationHub')
  const locale = useLocale()
  const currencyLocale = locale === 'fr' ? 'fr-BE' : locale === 'en' ? 'en-BE' : 'nl-BE'
  const _adjustmentPercentage =
    reportedEbitda !== 0 ? ((totalAdjustments / reportedEbitda) * 100).toFixed(1) : '0.0'

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(currencyLocale, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  // Calculate totals by type
  const allAdjustments = [
    ...adjustments.map((a) => a.amount),
    ...customAdjustments.map((c) => c.amount),
  ]

  const _positiveTotal = allAdjustments.filter((a) => a > 0).reduce((sum, a) => sum + a, 0)
  const _negativeTotal = allAdjustments.filter((a) => a < 0).reduce((sum, a) => sum + a, 0)
  const adjustmentCount = allAdjustments.filter((a) => a !== 0).length

  return (
    <div className="sticky top-0 bg-canvas rounded-lg border border-foreground/10 p-6 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-ink">{t('livePreview')}</h3>
        <p className="text-sm text-muted-foreground mt-1">{t('normalizationFor', { year })}</p>
      </div>

      {/* Reported EBITDA */}
      <div className="mb-4 pb-4 border-b border-foreground/10">
        <div className="text-sm text-muted-foreground mb-1">Reported EBITDA</div>
        <div className="text-2xl font-bold text-slate-ink">{formatCurrency(reportedEbitda)}</div>
        <div className="text-xs text-muted-foreground mt-1">
          {t('asShownInFinancialStatements')}
        </div>
      </div>

      {/* Active Adjustments List */}
      {adjustmentCount > 0 && (
        <div className="mb-4 pb-4 border-b border-foreground/10">
          <div className="text-sm font-medium text-foreground mb-3">{t('activeAdjustments')}</div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {/* Standard adjustments */}
            {adjustments
              .filter((adj) => adj.amount !== 0)
              .map((adj) => {
                const category = NORMALIZATION_CATEGORIES.find((c) => c.id === adj.category)
                return (
                  <div
                    key={adj.category}
                    className="flex items-start justify-between gap-2 p-2 bg-card rounded-lg border border-foreground/10"
                  >
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          'text-sm font-medium text-slate-ink',
                          LEDGER_LABEL_TEXT_CLASSES
                        )}
                        title={category?.label || adj.category}
                      >
                        {category?.label || adj.category}
                      </p>
                      {adj.note && (
                        <p
                          className={cn(
                            'text-xs text-muted-foreground mt-0.5',
                            LEDGER_LABEL_TEXT_CLASSES
                          )}
                          title={adj.note}
                        >
                          {adj.note}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-semibold whitespace-nowrap ${
                          adj.amount > 0 ? 'text-moss-600' : 'text-rust-600'
                        }`}
                      >
                        {adj.amount > 0 ? '+' : ''}
                        {formatCurrency(adj.amount)}
                      </span>
                      {onRemoveAdjustment && (
                        <button
                          type="button"
                          onClick={() => onRemoveAdjustment(adj.category)}
                          className="p-1 text-muted-foreground hover:text-rust-600 transition-colors"
                          title={t('actions.removeAdjustment')}
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}

            {/* Custom adjustments */}
            {customAdjustments
              .filter((adj) => adj.amount !== 0 && adj.id)
              .map((adj) => (
                <div
                  key={adj.id}
                  className="flex items-start justify-between gap-2 p-2 bg-card rounded-lg border border-foreground/10"
                >
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        'text-sm font-medium text-slate-ink',
                        LEDGER_LABEL_TEXT_CLASSES
                      )}
                      title={adj.description}
                    >
                      {adj.description}
                    </p>
                    {adj.note && (
                      <p
                        className={cn(
                          'text-xs text-muted-foreground mt-0.5',
                          LEDGER_LABEL_TEXT_CLASSES
                        )}
                        title={adj.note}
                      >
                        {adj.note}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-semibold whitespace-nowrap ${
                        adj.amount > 0 ? 'text-moss-600' : 'text-rust-600'
                      }`}
                    >
                      {adj.amount > 0 ? '+' : ''}
                      {formatCurrency(adj.amount)}
                    </span>
                    {onRemoveCustomAdjustment && adj.id && (
                      <button
                        type="button"
                        onClick={() => {
                          if (adj.id) onRemoveCustomAdjustment(adj.id)
                        }}
                        className="p-1 text-muted-foreground hover:text-rust-600 transition-colors"
                        title={t('actions.removeAdjustment')}
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>

          {/* Summary */}
          <div className="mt-3 pt-3 border-t border-foreground/10">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-foreground">Net Adjustment:</span>
              <span
                className={`text-base font-bold ${
                  totalAdjustments > 0
                    ? 'text-moss-600'
                    : totalAdjustments < 0
                      ? 'text-rust-600'
                      : 'text-slate-ink'
                }`}
              >
                {totalAdjustments > 0 ? '+' : ''}
                {formatCurrency(totalAdjustments)}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {adjustmentCount} active adjustment{adjustmentCount !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      )}

      {/* Total Adjustments (if no breakdown) */}
      {adjustmentCount === 0 && (
        <div className="mb-4 pb-4 border-b border-foreground/10">
          <div className="text-sm text-muted-foreground mb-1">Total Adjustments</div>
          <div
            className={`text-2xl font-bold ${
              totalAdjustments > 0
                ? 'text-moss-600'
                : totalAdjustments < 0
                  ? 'text-rust-600'
                  : 'text-slate-ink'
            }`}
          >
            {totalAdjustments > 0 ? '+' : ''}
            {formatCurrency(totalAdjustments)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">{t('noAdjustmentsYet')}</div>
        </div>
      )}

      {/* Normalized EBITDA */}
      <div className="mb-4 pb-4 border-b border-foreground/10">
        <div className="text-sm text-muted-foreground mb-1">Normalized EBITDA</div>
        <div className="text-3xl font-bold text-primary">{formatCurrency(normalizedEbitda)}</div>
        <div className="text-xs text-muted-foreground mt-1">{t('trueEarningPower')}</div>
      </div>

      {/* Info box */}
      <div className="mt-6 p-4 bg-river-50 rounded-lg border border-river-200">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-river-600" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm text-river-800">
              Positive adjustments increase EBITDA. Negative adjustments decrease it. All changes
              are reflected in real-time.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
