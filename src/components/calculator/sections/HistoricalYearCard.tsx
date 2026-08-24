'use client'

import { AlertCircle, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { cn } from '@/design-system/utils'
import { accountingAPI, parseAccountingApiError } from '@/services/api/accounting'
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
  onHighMarginAttested?: (result: {
    year: number
    attestationId: string
    sourceDigest: string
  }) => void
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
  onHighMarginAttested,
  partialYears,
  updateYearlyFinancials,
  yearData,
}: HistoricalYearCardProps) {
  const t = useTranslations()
  const mi = useTranslations('manualInput')
  const locale = useLocale()
  const [attestationRationale, setAttestationRationale] = useState('')
  const [attestationError, setAttestationError] = useState<string | null>(null)
  const [attesting, setAttesting] = useState(false)
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
  const requiresHighMarginReview =
    !yearData.isForecast &&
    yearData.source_provider === 'silverfin' &&
    yearData.eligibility_reason === 'extreme_margin_unattested' &&
    typeof yearData.source_digest === 'string'
  const reviewCopy =
    locale === 'nl'
      ? {
          title: 'Ongebruikelijk hoge marge — controle vereist',
          body: 'Controleer omzet, kosten en het Silverfin-dossier. Bevestig alleen als deze volledige jaarrekening werkelijk een EBITDA-marge van 90% of meer heeft.',
          placeholder: 'Leg uit waarom deze marge correct is (min. 12 tekens)',
          confirm: 'Gecontroleerd bevestigen',
          missingClient: 'Clientcontext ontbreekt. Open dit rapport opnieuw vanuit Mercury.',
        }
      : locale === 'fr'
        ? {
            title: 'Marge inhabituellement élevée — vérification requise',
            body: 'Vérifiez le chiffre d’affaires, les charges et le dossier Silverfin. Confirmez uniquement si cet exercice complet présente réellement une marge d’EBITDA d’au moins 90 %.',
            placeholder: 'Expliquez pourquoi cette marge est correcte (12 caractères minimum)',
            confirm: 'Confirmer les chiffres vérifiés',
            missingClient: 'Le contexte client manque. Rouvrez ce rapport depuis Mercury.',
          }
        : {
            title: 'Unusually high margin — review required',
            body: 'Review revenue, expenses, and the Silverfin dossier. Confirm only when this complete fiscal year genuinely has an EBITDA margin of 90% or more.',
            placeholder: 'Explain why this margin is correct (minimum 12 characters)',
            confirm: 'Confirm reviewed figures',
            missingClient: 'Client context is missing. Reopen this report from Mercury.',
          }

  const attestHighMargin = async () => {
    const searchParams =
      typeof window === 'undefined' ? null : new URLSearchParams(window.location.search)
    const clientId = searchParams?.get('clientId') ?? searchParams?.get('client_id')
    if (!clientId) {
      setAttestationError(reviewCopy.missingClient)
      return
    }
    if (!yearData.source_digest || attestationRationale.trim().length < 12) return
    setAttesting(true)
    setAttestationError(null)
    try {
      const result = await accountingAPI.attestSilverfinExtremeMargin({
        clientId,
        year: Number(yearData.year),
        sourceDigest: yearData.source_digest,
        rationale: attestationRationale.trim(),
      })
      onHighMarginAttested?.({
        year: result.year,
        attestationId: result.attestation_id,
        sourceDigest: result.source_digest,
      })
    } catch (error) {
      setAttestationError(parseAccountingApiError(error))
    } finally {
      setAttesting(false)
    }
  }

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
                updateYearlyFinancials(yearData.year, !!yearData.isForecast, 'revenue', value)
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
                updateYearlyFinancials(yearData.year, !!yearData.isForecast, 'ebitda', value)
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

      {requiresHighMarginReview ? (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
            {reviewCopy.title}
          </p>
          <p className="mt-1 text-[11px] leading-5 text-foreground/65">{reviewCopy.body}</p>
          <textarea
            className="mt-2 min-h-20 w-full rounded-md border bg-background px-2.5 py-2 text-xs"
            value={attestationRationale}
            onChange={(event) => setAttestationRationale(event.target.value)}
            placeholder={reviewCopy.placeholder}
          />
          {attestationError ? (
            <p className="mt-1 text-[11px] text-destructive">{attestationError}</p>
          ) : null}
          <button
            type="button"
            className="mt-2 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            disabled={attesting || attestationRationale.trim().length < 12}
            onClick={() => void attestHighMargin()}
          >
            {attesting ? '…' : reviewCopy.confirm}
          </button>
        </div>
      ) : null}

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
          // When a normalized EBITDA is shown above, the margin sits under THAT
          // figure and must divide the normalized EBITDA (e.g. 57.358 / 177.376 =
          // 32.3%), not the reported EBITDA (which would mislabel it 20.6%).
          const marginEbitda =
            hasNormalizedAdjustment &&
            normalizedYear &&
            Number.isFinite(normalizedYear.normalizedEbitda)
              ? normalizedYear.normalizedEbitda
              : yearData.ebitda
          const margin = (marginEbitda / yearData.revenue) * 100
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
