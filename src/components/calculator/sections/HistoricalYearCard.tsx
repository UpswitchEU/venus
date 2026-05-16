'use client'

import { AlertCircle, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/design-system/utils'
import type { YearlyFinancials } from '../../../types/valuation'
import { getFilingYearHistoricalOffset } from '../../../utils/fiscalYear'
import { canRemoveHistoricalYear } from '../../../utils/forecastYears'
import { hasExplicitNumericValue as hasExplicitFinancialValue } from '../../../utils/yearlyFinancials'
import { CurrencyInput } from '../CurrencyInput'
import type { FieldHelpContext } from '../FieldHelpTrigger'
import { FieldHelpTrigger } from '../FieldHelpTrigger'
import type { ManualInputFieldValidation } from '../utils/manualInputFieldValidation'
import type { ManualInputNormalizedYear } from '../utils/manualInputNormalizedData'
import type { UpdateManualYearlyFinancials } from '../utils/manualYearlyFinancialUpdates'
import { NbbResetHint } from './NbbResetHint'

interface HistoricalYearCardProps {
  baseFilingYearForLabels: number
  fieldValidation: ManualInputFieldValidation
  financialRows: YearlyFinancials[]
  formatCurrency: (amount: number) => string
  normalizedYear?: ManualInputNormalizedYear
  onFieldHelpRequest?: (context: FieldHelpContext) => void
  onRemoveForecastYear: (year: string) => void
  onRemoveHistoricalYear: (year: string) => void
  onViewAllNormalizations?: () => void
  partialYears: string[]
  updateYearlyFinancials: UpdateManualYearlyFinancials
  yearData: YearlyFinancials
}

export function HistoricalYearCard({
  baseFilingYearForLabels,
  fieldValidation,
  financialRows,
  formatCurrency,
  normalizedYear,
  onFieldHelpRequest,
  onRemoveForecastYear,
  onRemoveHistoricalYear,
  onViewAllNormalizations,
  partialYears,
  updateYearlyFinancials,
  yearData,
}: HistoricalYearCardProps) {
  const t = useTranslations()
  const mi = useTranslations('manualInput')
  const normCount = Number(normalizedYear?.normalizationCount ?? 0)
  const histOffset = getFilingYearHistoricalOffset(yearData.year, baseFilingYearForLabels)
  const isPartial = partialYears.includes(yearData.year)
  const canRemoveThisHistoricalYear = !yearData.isForecast && canRemoveHistoricalYear(financialRows)
  const yearLabelForHelp =
    yearData.isForecast || histOffset === null
      ? String(yearData.year)
      : histOffset === 0
        ? `${yearData.year} (${mi('filingYearColumnBase')})`
        : `${yearData.year} (${mi('filingYearColumnBaseMinus', { n: histOffset })})`
  const hasNormalizedAdjustment = normalizedYear
    ? hasExplicitFinancialValue(yearData.ebitda) &&
      (normalizedYear.totalAdjustment !== 0 || (normalizedYear.fictiveRentDeduction ?? 0) > 0)
    : false

  return (
    <div
      className={cn(
        'p-3 rounded-xl border transition-colors',
        yearData.isForecast
          ? 'border-dashed border-primary/20 bg-primary/[0.02]'
          : isPartial
            ? 'border-warning/40 bg-warning/[0.03]'
            : Number.isFinite(yearData.revenue) && Number.isFinite(yearData.ebitda)
              ? 'border-foreground/[0.08] bg-foreground/[0.02]'
              : 'border-dashed border-foreground/[0.06]'
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-foreground">
          {yearData.year}
          {!yearData.isForecast && histOffset === 0 && (
            <>
              {' '}
              <span className="text-xs font-normal text-muted-foreground">
                ({mi('filingYearColumnBase')})
              </span>
            </>
          )}
          {!yearData.isForecast && histOffset !== null && histOffset > 0 && (
            <>
              {' '}
              <span className="text-xs font-normal text-muted-foreground">
                ({mi('filingYearColumnBaseMinus', { n: histOffset })})
              </span>
            </>
          )}
          {yearData.isForecast && (
            <>
              {' '}
              <span className="text-xs font-normal text-primary/60">({mi('forecastLabel')})</span>
            </>
          )}
        </span>
        {(normCount > 0 || yearData.isForecast || canRemoveThisHistoricalYear) && (
          <div className="flex items-center gap-2">
            {normCount > 0 && (
              <button
                type="button"
                onClick={() => onViewAllNormalizations?.()}
                className="text-[10px] font-medium text-primary bg-primary/10 hover:bg-primary/15 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
              >
                {normCount} {mi('normalizations', { count: normCount })}
              </button>
            )}
            {yearData.isForecast && (
              <button
                type="button"
                onClick={() => onRemoveForecastYear(yearData.year)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-primary/15 text-primary/60 transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                aria-label={`${t('common.actions.delete')} ${mi('forecastLabel').toLowerCase()} ${yearData.year}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            {canRemoveThisHistoricalYear && (
              <button
                type="button"
                onClick={() => onRemoveHistoricalYear(String(yearData.year))}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-foreground/10 text-foreground/50 transition-colors hover:border-destructive/30 hover:bg-destructive/[0.06] hover:text-destructive"
                aria-label={mi('removeHistoricalYearAria', {
                  year: String(yearData.year),
                })}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className={cn('grid gap-3', 'grid-cols-1 sm:grid-cols-2')}>
        <div>
          <div className="flex items-center gap-1.5">
            <CurrencyInput
              label={mi('fields.revenue')}
              value={yearData.revenue}
              onChange={(value) =>
                updateYearlyFinancials(yearData.year, !!yearData.isForecast, 'revenue', value ?? 0)
              }
              size="sm"
              placeholder="1.500.000"
              truncateLabel={false}
            />
          </div>
          {(fieldValidation.warnings[`revenue-${yearData.year}`] ||
            fieldValidation.errors[`revenue-${yearData.year}`]) && (
            <p
              className={`text-[10px] mt-0.5 ${fieldValidation.errors[`revenue-${yearData.year}`] ? 'text-destructive' : 'text-warning'}`}
            >
              {fieldValidation.errors[`revenue-${yearData.year}`] ||
                fieldValidation.warnings[`revenue-${yearData.year}`]}
            </p>
          )}
        </div>
        <div className="relative">
          <div className="flex items-center gap-1.5">
            <CurrencyInput
              label={mi('fields.ebitda')}
              value={yearData.ebitda}
              onChange={(value) =>
                updateYearlyFinancials(yearData.year, !!yearData.isForecast, 'ebitda', value ?? 0)
              }
              size="sm"
              placeholder="250.000"
              truncateLabel={false}
              rightIcon={
                <FieldHelpTrigger
                  context={{
                    field: 'ebitda',
                    label: `EBITDA ${yearLabelForHelp}`,
                    value: yearData.ebitda,
                    hint: mi('ebitdaRelevantHint'),
                    normalizationType: 'other',
                  }}
                  onTrigger={onFieldHelpRequest}
                />
              }
            />
          </div>
          {(fieldValidation.warnings[`ebitda-${yearData.year}`] ||
            fieldValidation.errors[`ebitda-${yearData.year}`] ||
            fieldValidation.warnings[`margin-${yearData.year}`]) && (
            <p
              className={`text-[10px] mt-0.5 ${fieldValidation.errors[`ebitda-${yearData.year}`] ? 'text-destructive' : 'text-warning'}`}
            >
              {fieldValidation.errors[`ebitda-${yearData.year}`] ||
                fieldValidation.warnings[`ebitda-${yearData.year}`] ||
                fieldValidation.warnings[`margin-${yearData.year}`]}
            </p>
          )}
        </div>
      </div>

      <NbbResetHint
        fiscalYear={yearData.year}
        currentRevenue={yearData.revenue}
        currentEbitda={yearData.ebitda}
        onReset={(field, value) =>
          updateYearlyFinancials(yearData.year, !!yearData.isForecast, field, value)
        }
      />

      {hasNormalizedAdjustment && normalizedYear && (
        <div className="mt-2 flex items-center justify-between text-xs gap-2">
          <span className="text-foreground/50 shrink-0">{mi('fields.normalizedEbitdaLabel')}</span>
          <span
            className={cn(
              'font-mono font-semibold text-right min-w-0',
              normalizedYear.totalAdjustment > 0
                ? 'text-success'
                : normalizedYear.totalAdjustment < 0
                  ? 'text-secondary'
                  : 'text-foreground'
            )}
          >
            {formatCurrency(
              Number.isFinite(normalizedYear.normalizedEbitda) ? normalizedYear.normalizedEbitda : 0
            )}
            <span className="text-foreground/40 ml-1.5 font-normal">
              {' '}
              (
              {normalizedYear.totalAdjustment !== 0 && (
                <>
                  {normalizedYear.totalAdjustment > 0 ? '+' : ''}
                  {formatCurrency(normalizedYear.totalAdjustment)} {mi('fields.adjustmentSuffix')}
                </>
              )}
              {normalizedYear.totalAdjustment !== 0 &&
                (normalizedYear.fictiveRentDeduction ?? 0) > 0 &&
                ' / '}
              {(normalizedYear.fictiveRentDeduction ?? 0) > 0 && (
                <>
                  -{formatCurrency(normalizedYear.fictiveRentDeduction)}{' '}
                  {mi('fields.fictiveRentInlineLabel')}
                </>
              )}
              )
            </span>
          </span>
        </div>
      )}

      {isPartial && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-warning">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{mi('fillBothFields')}</span>
        </div>
      )}

      {!isPartial &&
        Number.isFinite(yearData.revenue) &&
        Number.isFinite(yearData.ebitda) &&
        yearData.revenue > 0 &&
        (() => {
          const margin = (yearData.ebitda / yearData.revenue) * 100
          if (!Number.isFinite(margin)) return null
          return (
            <p className="mt-2 text-[11px] text-foreground/40 font-mono tabular-nums">
              {margin.toFixed(1)}%{' '}
              <span className="font-sans">{mi('fields.ebitdaMarginInlineLabel')}</span>
            </p>
          )
        })()}
    </div>
  )
}
