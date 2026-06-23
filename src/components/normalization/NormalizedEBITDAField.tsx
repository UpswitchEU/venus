/**
 * NormalizedEBITDAField Component
 *
 * Premium UX component for displaying normalized EBITDA
 * Matches the company verification pattern with disabled input, checkmark, and details card
 */

import { useLocale, useTranslations } from 'next-intl'
import React from 'react'
import { dateLikeToUnixMs } from '@/utils/date-like'

interface NormalizedEBITDAFieldProps {
  label: string
  originalValue: number
  normalizedValue: number
  totalAdjustments: number
  adjustmentCount: number
  lastUpdated: Date
  onEdit: () => void
  onRemove: () => void
  helpText?: string
}

export const NormalizedEBITDAField: React.FC<NormalizedEBITDAFieldProps> = ({
  label,
  originalValue,
  normalizedValue,
  totalAdjustments,
  adjustmentCount,
  lastUpdated,
  onEdit,
  onRemove,
  helpText,
}) => {
  const t = useTranslations('normalizationHub')
  const tTime = useTranslations('relativeTime')
  const locale = useLocale()
  const currencyLocale = locale === 'fr' ? 'fr-BE' : locale === 'en' ? 'en-BE' : 'nl-BE'
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(currencyLocale, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatRelativeTime = (date: Date) => {
    const updatedMs = dateLikeToUnixMs(date)
    if (updatedMs === null) return tTime('justNow')
    const diffMs = Math.max(0, Date.now() - updatedMs)
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return tTime('justNow')
    if (diffMins < 60) return tTime('minutesAgo', { count: diffMins })
    if (diffHours < 24) return tTime('hoursAgo', { count: diffHours })
    return tTime('daysAgo', { count: diffDays })
  }

  const adjustmentColor =
    totalAdjustments > 0
      ? 'text-success'
      : totalAdjustments < 0
        ? 'text-destructive'
        : 'text-muted-foreground'
  const adjustmentSign = totalAdjustments > 0 ? '+' : ''

  return (
    <div>
      {/* Disabled Input Field (matches company verification style) */}
      <div className="relative">
        <div className="relative custom-input-group border rounded-xl shadow-sm transition-all duration-200 border-foreground/10 bg-muted">
          <input
            placeholder=""
            aria-invalid="false"
            className="
              w-full h-14 px-4 pt-6 pb-2 text-base 
              border-none rounded-xl 
              focus:outline-none focus:ring-0
              transition-all duration-200 ease-in-out
              pr-4
              bg-transparent cursor-not-allowed text-muted-foreground
            "
            type="text"
            value={`${formatCurrency(originalValue)} → ${formatCurrency(normalizedValue)}`}
            disabled
            readOnly
          />

          <label
            className="
            absolute left-4 top-2 text-xs text-muted-foreground font-medium pointer-events-none
          "
          >
            {label}
            <span className="text-rust-500 ml-1">*</span>
          </label>
        </div>
      </div>

      {/* Details Card (matches company verification card style) */}
      <div className="mt-3 p-4 rounded-xl border border-success/20 bg-success/[0.06] animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex-shrink-0 w-8 h-8 bg-success rounded-full flex items-center justify-center transition-all">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  d="M5 13l4 4L19 7"
                ></path>
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold text-success uppercase tracking-wider">
                {t('ebitdaNormalized')}
              </p>
              <p className="text-sm font-medium text-muted-foreground">
                {t('adjustmentsCount', { count: adjustmentCount })} •{' '}
                {formatRelativeTime(lastUpdated)}
              </p>
            </div>
          </div>
        </div>

        {/* Values Breakdown */}
        <div className="space-y-2 mb-4">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">{t('originalEbitdaLabel')}</span>
            <span className="font-mono font-medium text-foreground">
              {formatCurrency(originalValue)}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">{t('netAdjustment')}</span>
            <span className={`font-mono font-semibold ${adjustmentColor}`}>
              {adjustmentSign}
              {formatCurrency(totalAdjustments)}
            </span>
          </div>
          <div className="pt-2 border-t border-foreground/10">
            <div className="flex justify-between items-center text-base">
              <span className="font-semibold text-foreground">{t('normalizedEbitdaLabel')}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-foreground">
                  {formatCurrency(normalizedValue)}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success/15 text-success">
                  {t('usedBadge')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-3 border-t border-foreground/10">
          <button
            type="button"
            onClick={onEdit}
            className="flex-1 px-4 py-2 text-sm font-medium text-foreground/70 hover:text-foreground hover:bg-foreground/[0.06] rounded-lg transition-colors"
          >
            {t('editNormalization')}
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="flex-1 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
          >
            {t('removeNormalization')}
          </button>
        </div>
      </div>
    </div>
  )
}
