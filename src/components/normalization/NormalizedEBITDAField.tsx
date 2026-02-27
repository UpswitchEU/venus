/**
 * NormalizedEBITDAField Component
 *
 * Premium UX component for displaying normalized EBITDA
 * Matches the company verification pattern with disabled input, checkmark, and details card
 */

import { useTranslations } from 'next-intl'
import React from 'react'

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
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-BE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatRelativeTime = (date: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - new Date(date).getTime()
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
      ? 'text-moss-600'
      : totalAdjustments < 0
        ? 'text-rust-600'
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
              pr-10
              bg-transparent cursor-not-allowed text-muted-foreground
            "
            type="text"
            value={`${formatCurrency(originalValue)} → ${formatCurrency(normalizedValue)}`}
            disabled
            readOnly
          />

          {/* Checkmark Icon with Tooltip */}
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground z-10">
            <div className="relative group">
              <svg
                className="w-5 h-5 text-moss-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  d="M5 13l4 4L19 7"
                ></path>
              </svg>

              {/* Tooltip */}
              <div className="absolute right-0 bottom-full mb-2 w-72 p-4 bg-popover border border-foreground/10 text-foreground text-xs rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-50 transform translate-y-2 group-hover:translate-y-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-moss-400 text-xs uppercase tracking-wider">
                    {t('ebitdaNormalized')}
                  </span>
                </div>
                <div className="space-y-2 text-muted-foreground border-t border-foreground/10 pt-2">
                  <div className="flex justify-between">
                    <span>{t('original')}</span>
                    <span className="font-mono text-foreground">
                      {formatCurrency(originalValue)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('adjustedBy')}</span>
                    <span className={`font-mono ${adjustmentColor}`}>
                      {adjustmentSign}
                      {formatCurrency(totalAdjustments)}
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>{t('usedInValuation')}</span>
                    <span className="font-mono text-white">{formatCurrency(normalizedValue)}</span>
                  </div>
                  <div className="mt-3 pt-2 border-t border-foreground/10 text-xs text-muted-foreground">
                    {t('editToModify')}
                    <br />
                    {t('removeToUseOriginal')}
                  </div>
                </div>
              </div>
            </div>
          </div>

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
      <div className="mt-3 p-4 bg-gradient-to-br from-moss-50 to-canvas border border-moss-200 rounded-xl shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex-shrink-0 w-8 h-8 bg-moss-500 rounded-full flex items-center justify-center transition-all">
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
              <p className="text-xs font-semibold text-moss-700 uppercase tracking-wider">
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
          <div className="pt-2 border-t border-moss-200/50">
            <div className="flex justify-between items-center text-base">
              <span className="font-semibold text-foreground">{t('normalizedEbitdaLabel')}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-foreground">
                  {formatCurrency(normalizedValue)}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-moss-100 text-moss-800">
                  {t('usedBadge')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-3 border-t border-moss-200/50">
          <button
            type="button"
            onClick={onEdit}
            className="flex-1 px-4 py-2 text-sm font-medium text-river-600 hover:text-river-700 hover:bg-river-50 rounded-lg transition-colors"
          >
            {t('editNormalization')}
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="flex-1 px-4 py-2 text-sm font-medium text-rust-600 hover:text-rust-700 hover:bg-rust-50 rounded-lg transition-colors"
          >
            {t('removeNormalization')}
          </button>
        </div>
      </div>
    </div>
  )
}
