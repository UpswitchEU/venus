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
import { canOfferSourceBoundHighMarginAttestation } from './highMarginAttestationEligibility'
import { NbbResetHint } from './NbbResetHint'

const CORRECTABLE_PROVIDERS: ReadonlySet<string> = new Set([
  'yuki',
  'exact',
  'silverfin',
  'winbooks',
  'octopus',
  'horus',
  'bizzcontrol',
  'generic',
  'expertm',
  'wings',
] as const)

type CorrectableProvider = Parameters<typeof accountingAPI.createFinancialCorrection>[0]['provider']

function isCorrectableProvider(value: string | null | undefined): value is CorrectableProvider {
  return !!value && CORRECTABLE_PROVIDERS.has(value.toLowerCase())
}

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
  onFinancialCorrectionRecorded?: (result: {
    year: number
    correctionId: string
    sourceDigest: string
  }) => void
  partialYears: string[]
  updateYearlyFinancials: UpdateManualYearlyFinancials
  yearData: YearlyFinancials
  readinessIssue?: {
    reason_code?: string
    source_digest?: string
    supports_attestation?: boolean
  }
  sourceProvider?: string | null
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
  onFinancialCorrectionRecorded,
  partialYears,
  updateYearlyFinancials,
  yearData,
  readinessIssue,
  sourceProvider,
}: HistoricalYearCardProps) {
  const t = useTranslations()
  const mi = useTranslations('manualInput')
  const locale = useLocale()
  const [attestationRationale, setAttestationRationale] = useState('')
  const [attestationError, setAttestationError] = useState<string | null>(null)
  const [attesting, setAttesting] = useState(false)
  const [showCorrection, setShowCorrection] = useState(false)
  const [correctionReason, setCorrectionReason] = useState('')
  const [correctionError, setCorrectionError] = useState<string | null>(null)
  const [correcting, setCorrecting] = useState(false)
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
  const yearReviewReason =
    yearData.eligibility_reason ??
    (yearData.source_kind === 'manual' ? undefined : readinessIssue?.reason_code)
  const requiresHighMarginReview =
    !yearData.isForecast && yearReviewReason === 'extreme_margin_unattested'
  const canAttestHighMargin = canOfferSourceBoundHighMarginAttestation({
    requiresReview: requiresHighMarginReview,
    sourceProvider: yearData.source_provider,
    sourceDigest: yearData.source_digest,
    titanSupportsAttestation: readinessIssue?.supports_attestation,
  })
  const correctionProviderCandidate = yearData.source_provider ?? sourceProvider
  const correctionProvider = isCorrectableProvider(correctionProviderCandidate)
    ? (correctionProviderCandidate.toLowerCase() as CorrectableProvider)
    : null
  const correctionMatchesReadinessSource =
    !readinessIssue?.source_digest || readinessIssue.source_digest === yearData.source_digest
  const canRecordFinancialCorrection = Boolean(
    !yearData.isForecast &&
      readinessIssue &&
      correctionProvider &&
      yearData.source_digest &&
      correctionMatchesReadinessSource &&
      Number.isFinite(yearData.revenue) &&
      Number.isFinite(yearData.ebitda)
  )
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
  const correctionCopy =
    locale === 'nl'
      ? {
          open: 'Broncijfers dossierbreed corrigeren',
          body: 'Dit is een broncorrectie, geen EBITDA-normalisatie. Ze blijft gebonden aan deze provider-sync en wordt bij nieuwe brondata opnieuw te beoordelen.',
          placeholder:
            'Beschrijf welk bronbewijs de gecorrigeerde omzet en EBITDA ondersteunt (min. 12 tekens)',
          confirm: 'Correctie duurzaam opslaan',
        }
      : locale === 'fr'
        ? {
            open: 'Corriger les chiffres source du dossier',
            body: 'Il s’agit d’une correction de source, pas d’une normalisation EBITDA. Elle reste liée à cette synchronisation et devra être réexaminée si la source change.',
            placeholder:
              'Décrivez la preuve qui justifie le chiffre d’affaires et l’EBITDA corrigés (12 caractères minimum)',
            confirm: 'Enregistrer durablement la correction',
          }
        : {
            open: 'Correct dossier-wide source figures',
            body: 'This is a source correction, not an EBITDA normalization. It remains bound to this provider sync and returns to review when the source changes.',
            placeholder:
              'Describe the evidence supporting corrected revenue and EBITDA (minimum 12 characters)',
            confirm: 'Save durable correction',
          }
  const excludedYearCopy =
    locale === 'nl'
      ? {
          title: 'Dit boekjaar telt nog niet mee',
          body:
            yearReviewReason === 'incomplete_operating_pair'
              ? 'Vul omzet en EBITDA voor ditzelfde boekjaar aan om het opnieuw toe te laten.'
              : yearReviewReason === 'ebitda_exceeds_revenue'
                ? 'De EBITDA is hoger dan de omzet. Controleer en corrigeer één van beide cijfers.'
                : yearReviewReason === 'fiscal_year_mismatch'
                  ? 'Het bronjaar en dit boekjaar komen niet overeen. Controleer de cijfers voor dit jaar.'
                  : 'De broncontrole voor dit boekjaar is niet volledig. Corrigeer de cijfers hier of synchroniseer Silverfin opnieuw.',
        }
      : locale === 'fr'
        ? {
            title: "Cet exercice n'est pas encore pris en compte",
            body:
              yearReviewReason === 'incomplete_operating_pair'
                ? 'Complétez le chiffre d’affaires et l’EBITDA du même exercice pour le réadmettre.'
                : yearReviewReason === 'ebitda_exceeds_revenue'
                  ? 'L’EBITDA dépasse le chiffre d’affaires. Vérifiez et corrigez l’un des deux montants.'
                  : yearReviewReason === 'fiscal_year_mismatch'
                    ? 'L’exercice de la source ne correspond pas à cette année. Vérifiez les chiffres de cet exercice.'
                    : 'La vérification de la source est incomplète. Corrigez les chiffres ici ou resynchronisez Silverfin.',
          }
        : {
            title: 'This fiscal year is not included yet',
            body:
              yearReviewReason === 'incomplete_operating_pair'
                ? 'Enter revenue and EBITDA for the same year to admit it again.'
                : yearReviewReason === 'ebitda_exceeds_revenue'
                  ? 'EBITDA is higher than revenue. Review and correct either figure.'
                  : yearReviewReason === 'fiscal_year_mismatch'
                    ? 'The source year does not match this fiscal year. Review the figures for this year.'
                    : 'Source verification for this year is incomplete. Correct the figures here or resync Silverfin.',
          }

  const attestHighMargin = async () => {
    const searchParams =
      typeof window === 'undefined' ? null : new URLSearchParams(window.location.search)
    const clientId = searchParams?.get('clientId') ?? searchParams?.get('client_id')
    if (!clientId) {
      setAttestationError(reviewCopy.missingClient)
      return
    }
    if (!canAttestHighMargin || !yearData.source_digest || attestationRationale.trim().length < 12)
      return
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

  const recordFinancialCorrection = async () => {
    const searchParams =
      typeof window === 'undefined' ? null : new URLSearchParams(window.location.search)
    const clientId = searchParams?.get('clientId') ?? searchParams?.get('client_id')
    if (!clientId) {
      setCorrectionError(reviewCopy.missingClient)
      return
    }
    if (
      !canRecordFinancialCorrection ||
      !correctionProvider ||
      !yearData.source_digest ||
      correctionReason.trim().length < 12
    ) {
      return
    }
    setCorrecting(true)
    setCorrectionError(null)
    try {
      const correction = await accountingAPI.createFinancialCorrection({
        clientId,
        provider: correctionProvider,
        fiscalYear: Number(yearData.year),
        sourceDigest: yearData.source_digest,
        revenue: String(yearData.revenue),
        ebitda: String(yearData.ebitda),
        reason: correctionReason.trim(),
      })
      onFinancialCorrectionRecorded?.({
        year: correction.fiscal_year,
        correctionId: correction.id,
        sourceDigest: correction.source_digest,
      })
      setShowCorrection(false)
      setCorrectionReason('')
    } catch (error) {
      setCorrectionError(parseAccountingApiError(error))
    } finally {
      setCorrecting(false)
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
                {locale === 'nl'
                  ? `${normCount} normalisaties te beoordelen`
                  : locale === 'fr'
                    ? `${normCount} normalisations à examiner`
                    : `${normCount} normalizations to review`}
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

      {yearReviewReason && !requiresHighMarginReview ? (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
            {excludedYearCopy.title}
          </p>
          <p className="mt-1 text-[11px] leading-5 text-foreground/65">{excludedYearCopy.body}</p>
        </div>
      ) : null}

      {requiresHighMarginReview ? (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
            {reviewCopy.title}
          </p>
          <p className="mt-1 text-[11px] leading-5 text-foreground/65">{reviewCopy.body}</p>
          {canAttestHighMargin ? (
            <>
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
            </>
          ) : null}
        </div>
      ) : null}

      {canRecordFinancialCorrection ? (
        <div className="mt-3 rounded-lg border border-foreground/10 bg-background p-3">
          <button
            type="button"
            className="text-xs font-semibold text-primary underline decoration-primary/30 underline-offset-2"
            onClick={() => setShowCorrection((visible) => !visible)}
            aria-expanded={showCorrection}
          >
            {correctionCopy.open}
          </button>
          {showCorrection ? (
            <div className="mt-2">
              <p className="text-[11px] leading-5 text-foreground/65">{correctionCopy.body}</p>
              <textarea
                className="mt-2 min-h-20 w-full rounded-md border bg-background px-2.5 py-2 text-xs"
                value={correctionReason}
                onChange={(event) => setCorrectionReason(event.target.value)}
                placeholder={correctionCopy.placeholder}
                aria-label={correctionCopy.placeholder}
              />
              {correctionError ? (
                <p className="mt-1 text-[11px] text-destructive" role="alert">
                  {correctionError}
                </p>
              ) : null}
              <button
                type="button"
                className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                disabled={correcting || correctionReason.trim().length < 12}
                onClick={() => void recordFinancialCorrection()}
              >
                {correcting ? '…' : correctionCopy.confirm}
              </button>
            </div>
          ) : null}
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
