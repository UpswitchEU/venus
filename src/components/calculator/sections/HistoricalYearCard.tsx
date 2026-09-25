'use client'

import { AlertCircle, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { cn } from '@/design-system/utils'
import { accountingReconnectProviderName } from '@/features/manual/utils/accountingReconnectHandoff'
import { accountingAPI, parseAccountingApiError } from '@/services/api/accounting'
import type { ImportQualityPerYear } from '@/store/useImportQualityStore'
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
import { AccountingYearEvidence } from './AccountingYearEvidence'
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

/** A year whose figures came from an accounting tool (not typed, not a public filing). */
function isAccountingImportedRow(row: YearlyFinancials): boolean {
  if (row.source_kind === 'manual' || row.source_kind === 'official_filing') return false
  return Boolean(row.source_provider)
}

interface HistoricalYearCardProps {
  baseFilingYearForLabels: number
  fieldValidation: ManualInputFieldValidation
  financialRows: YearlyFinancials[]
  formatCurrency: (amount: number) => string
  importQuality?: ImportQualityPerYear
  /** Figures are locked while a calculation runs, like the rest of the form. */
  isCalculating?: boolean
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
  importQuality,
  isCalculating = false,
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
  const providerName = (() => {
    const provider = yearData.source_provider ?? sourceProvider
    if (provider?.trim()) return accountingReconnectProviderName(provider)
    return locale === 'nl' ? 'de bron' : locale === 'fr' ? 'la source' : 'the source'
  })()
  const reviewCopy =
    locale === 'nl'
      ? {
          title: 'Marge van 90%+ — bevestig de cijfers',
          body: `Controleer omzet en kosten in ${providerName}. Bevestig alleen als dit volledige jaar klopt.`,
          placeholder: 'Waarom klopt deze marge? (min. 12 tekens)',
          confirm: 'Cijfers bevestigen',
          missingClient: 'Clientcontext ontbreekt. Open opnieuw vanuit Mercury.',
        }
      : locale === 'fr'
        ? {
            title: 'Marge de 90 %+ — confirmez les chiffres',
            body: `Vérifiez le chiffre d’affaires et les charges dans ${providerName}. Confirmez seulement si cet exercice complet est correct.`,
            placeholder: 'Pourquoi cette marge est-elle correcte ? (12 caractères min.)',
            confirm: 'Confirmer les chiffres',
            missingClient: 'Le contexte client manque. Rouvrez depuis Mercury.',
          }
        : {
            title: 'Margin of 90%+ — confirm the figures',
            body: `Check revenue and costs in ${providerName}. Confirm only if this full year is right.`,
            placeholder: 'Why is this margin right? (min. 12 characters)',
            confirm: 'Confirm figures',
            missingClient: 'Client context is missing. Reopen from Mercury.',
          }
  const correctionCopy =
    locale === 'nl'
      ? {
          open: 'Broncijfers corrigeren',
          body: 'Een broncorrectie, geen normalisatie. Ze blijft gekoppeld aan deze sync.',
          placeholder: 'Welk bewijs ondersteunt deze cijfers? (min. 12 tekens)',
          confirm: 'Correctie opslaan',
        }
      : locale === 'fr'
        ? {
            open: 'Corriger les chiffres source',
            body: 'Une correction de source, pas une normalisation. Elle reste liée à cette synchronisation.',
            placeholder: 'Quelle preuve justifie ces chiffres ? (12 caractères min.)',
            confirm: 'Enregistrer la correction',
          }
        : {
            open: 'Correct source figures',
            body: 'A source correction, not a normalization. It stays tied to this sync.',
            placeholder: 'Which evidence supports these figures? (min. 12 characters)',
            confirm: 'Save correction',
          }
  const excludedYearCopy =
    locale === 'nl'
      ? {
          title: 'Niet gebruikt in waardering',
          body:
            yearReviewReason === 'incomplete_operating_pair'
              ? 'Vul omzet en EBITDA voor dit jaar aan.'
              : yearReviewReason === 'ebitda_exceeds_revenue'
                ? 'EBITDA is hoger dan de omzet. Corrigeer een van beide.'
                : yearReviewReason === 'fiscal_year_mismatch'
                  ? 'Het bronjaar komt niet overeen met dit jaar. Controleer de cijfers.'
                  : `De broncontrole is onvolledig. Corrigeer de cijfers of synchroniseer ${providerName} opnieuw.`,
        }
      : locale === 'fr'
        ? {
            title: 'Non utilisé dans l’évaluation',
            body:
              yearReviewReason === 'incomplete_operating_pair'
                ? 'Ajoutez le chiffre d’affaires et l’EBITDA de cet exercice.'
                : yearReviewReason === 'ebitda_exceeds_revenue'
                  ? 'L’EBITDA dépasse le chiffre d’affaires. Corrigez l’un des deux.'
                  : yearReviewReason === 'fiscal_year_mismatch'
                    ? 'L’exercice de la source ne correspond pas. Vérifiez les chiffres.'
                    : `La vérification de la source est incomplète. Corrigez les chiffres ou resynchronisez ${providerName}.`,
          }
        : {
            title: 'Not used in valuation',
            body:
              yearReviewReason === 'incomplete_operating_pair'
                ? 'Add revenue and EBITDA for this year.'
                : yearReviewReason === 'ebitda_exceeds_revenue'
                  ? 'EBITDA is higher than revenue. Correct one of them.'
                  : yearReviewReason === 'fiscal_year_mismatch'
                    ? "The source year doesn't match this year. Check the figures."
                    : `The source check is incomplete. Correct the figures or resync ${providerName}.`,
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
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              · {mi('filingYearColumnLatest')}
            </span>
          )}
          {yearData.isForecast && (
            <>
              {' '}
              <span className="text-xs font-normal text-primary/60">({mi('forecastLabel')})</span>
            </>
          )}
        </span>
        {(yearData.isForecast || canRemoveThisHistoricalYear) && (
          <div className="flex items-center gap-2">
            {yearData.isForecast && (
              <button
                type="button"
                onClick={() => onRemoveForecastYear(yearData.year)}
                disabled={isCalculating}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-primary/15 text-primary/60 transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                aria-label={`${t('common.actions.delete')} ${mi('forecastLabel').toLowerCase()} ${yearData.year}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            {canRemoveThisHistoricalYear && (
              <button
                type="button"
                onClick={() => onRemoveHistoricalYear(String(yearData.year))}
                disabled={isCalculating}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-foreground/10 text-foreground/50 transition-colors hover:border-destructive/30 hover:bg-destructive/[0.06] hover:text-destructive disabled:opacity-50"
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

      <AccountingYearEvidence
        attentionExplained={Boolean(yearReviewReason)}
        formatCurrency={formatCurrency}
        importQuality={importQuality}
        yearData={yearData}
      />

      <div className={cn('grid gap-3', 'grid-cols-1 sm:grid-cols-2')}>
        <div>
          <div className="flex items-center gap-1.5">
            <CurrencyInput
              label={mi('fields.revenue')}
              value={yearData.revenue}
              onChange={(value) =>
                updateYearlyFinancials(yearData.year, !!yearData.isForecast, 'revenue', value)
              }
              disabled={isCalculating}
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
              disabled={isCalculating}
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

      {/* Restoring public (NBB) figures only makes sense on a row typed by hand or taken
          from the filing; a ledger-imported year must not offer a one-click overwrite. */}
      {!yearData.isForecast && !isAccountingImportedRow(yearData) && (
        <NbbResetHint
          fiscalYear={yearData.year}
          currentRevenue={yearData.revenue}
          currentEbitda={yearData.ebitda}
          onReset={(field, value) =>
            updateYearlyFinancials(yearData.year, !!yearData.isForecast, field, value)
          }
        />
      )}

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

      {isPartial && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-warning">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{mi('fillBothFields')}</span>
        </div>
      )}

      {(() => {
        // One quiet footer: the normalized figure (click opens the normalizations) and
        // the margin. The margin steps aside when a margin warning already names it.
        const showNormalized = hasNormalizedAdjustment && normalizedYear
        const marginEbitda =
          showNormalized && Number.isFinite(normalizedYear.normalizedEbitda)
            ? normalizedYear.normalizedEbitda
            : yearData.ebitda
        const margin =
          !isPartial &&
          Number.isFinite(yearData.revenue) &&
          Number.isFinite(yearData.ebitda) &&
          yearData.revenue > 0
            ? (marginEbitda / yearData.revenue) * 100
            : Number.NaN
        const marginWarned =
          Boolean(fieldValidation.warnings[`margin-${yearData.year}`]) || requiresHighMarginReview
        const showMargin = Number.isFinite(margin) && !marginWarned
        if (!showNormalized && !showMargin) return null
        const adjustment = normalizedYear?.totalAdjustment ?? 0
        const rentDeduction = normalizedYear?.fictiveRentDeduction ?? 0
        return (
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
            {showNormalized ? (
              <button
                type="button"
                onClick={() => onViewAllNormalizations?.()}
                title={
                  normCount > 0 ? mi('appliedNormalizations', { count: normCount }) : undefined
                }
                className="min-w-0 truncate text-left text-foreground/55 transition-colors hover:text-foreground"
              >
                {mi('fields.normalizedShort')}{' '}
                <span className="font-mono font-semibold tabular-nums text-foreground">
                  {formatCurrency(
                    Number.isFinite(normalizedYear.normalizedEbitda)
                      ? normalizedYear.normalizedEbitda
                      : 0
                  )}
                </span>
                {adjustment !== 0 || rentDeduction > 0 ? (
                  <span
                    className={cn(
                      'ml-1 font-mono tabular-nums',
                      adjustment > 0 ? 'text-success' : 'text-foreground/45'
                    )}
                  >
                    (
                    {adjustment !== 0 && (
                      <>
                        {adjustment > 0 ? '+' : ''}
                        {formatCurrency(adjustment)}
                      </>
                    )}
                    {adjustment !== 0 && rentDeduction > 0 && ' · '}
                    {rentDeduction > 0 && (
                      <>
                        −{formatCurrency(rentDeduction)}{' '}
                        <span className="font-sans">{mi('fields.fictiveRentInlineLabel')}</span>
                      </>
                    )}
                    )
                  </span>
                ) : null}
              </button>
            ) : (
              <span />
            )}
            {showMargin ? (
              <span className="shrink-0 font-mono tabular-nums text-foreground/40">
                {margin.toFixed(1)}% <span className="font-sans">{mi('fields.marginShort')}</span>
              </span>
            ) : null}
          </div>
        )
      })()}
    </div>
  )
}
