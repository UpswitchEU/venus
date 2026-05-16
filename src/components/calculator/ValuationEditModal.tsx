'use client'

import {
  AlertTriangle,
  Calculator,
  Download,
  Loader2,
  Pencil,
  Percent,
  Scale,
  TrendingUp,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { METHOD_LABEL_KEYS } from '@/constants/methodLabels'
import { AuroraButton } from '@/design-system/components/Button'
import { Modal, ModalContent, ModalHeader, ModalTitle } from '@/design-system/components/Modal'
import { SegmentedControl } from '@/design-system/components/SegmentedControl'
import { AuroraSelect } from '@/design-system/components/Select'
import { cn } from '@/design-system/utils'
import {
  getValuationMethodResultForKey,
  isRevenueMethodologyKey,
} from '@/utils/extractValuationResultsMap'
import { mergePlanGatedOmniPanoramaResults } from '@/utils/omniPlanPanorama'
import { buildZeroDraftCsv, downloadZeroDraftCsv } from '@/utils/zeroDraftCsv'
import {
  detectDossierSignal,
  projectSuggestedMultiple,
  SCENARIO_PRESETS,
  SUGGESTED_DELTA_BAND,
} from '../../store/manual/preparerCalibrationSuggestions'
import {
  clientShouldWarnExtremeMultiple,
  PREPARER_EBITDA_REASON_KEYS,
  usePreparerMultipleStore,
} from '../../store/manual/usePreparerMultipleStore'
import type {
  HistoricalFcfReadiness,
  MultiplePipelineStage,
  ValuationMethodResult,
  ValuationResponse,
  WaterfallStep,
} from '../../types/valuation'
import { OmniMethodPanorama } from './omni/OmniMethodPanorama'
import { PercentileBandGauge } from './PercentileBandGauge'
import { DcfSensitivityMatrix } from './sections/DcfSensitivityMatrix'

const METHOD_OVERRIDE_REASON_KEYS = [
  'fiscal_compliance',
  'asset_heavy_business',
  'internal_transfer',
  'conservative_anchor',
  'client_preference',
  'regulatory_requirement',
  'other',
] as const

const formatCurrency = (amount: number) => {
  const sign = amount < 0 ? '-' : ''
  const abs = Math.abs(amount)
  const rounded = Math.round(abs)
  return abs >= 1_000_000
    ? `${sign}€${(abs / 1_000_000).toFixed(1)}M`
    : rounded >= 1_000
      ? `${sign}€${Math.round(abs / 1_000)}K`
      : `${sign}€${rounded}`
}

const formatMultiple = (value: number | null) => (value == null ? null : `${value.toFixed(2)}×`)

const formatPercent = (value: number | null, scale = 1) =>
  value == null ? null : `${(value * scale).toFixed(1)}%`

const toNumberOrNull = (value: unknown): number | null => {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isHistoricalFcfReadiness(value: unknown): value is HistoricalFcfReadiness {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.status === 'string' &&
    typeof candidate.historical_years_count === 'number' &&
    typeof candidate.actual_capex_years === 'number' &&
    typeof candidate.actual_tax_years === 'number' &&
    typeof candidate.actual_nwc_years === 'number'
  )
}

const sumAdjustmentValues = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value

  if (Array.isArray(value)) {
    const total = value.reduce((sum, item) => {
      if (!item || typeof item !== 'object') return sum
      const record = item as Record<string, unknown>
      const amount =
        toNumberOrNull(record.amount) ??
        toNumberOrNull(record.value) ??
        toNumberOrNull(record.adjustment) ??
        toNumberOrNull(record.delta) ??
        0
      return sum + amount
    }, 0)
    return Number.isFinite(total) ? total : null
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return (
      toNumberOrNull(record.total_adjustment_amount) ??
      toNumberOrNull(record.total_adjustment) ??
      toNumberOrNull(record.amount) ??
      toNumberOrNull(record.value) ??
      null
    )
  }

  return null
}

/** API may send `moderate` or legacy spellings — map to i18n keys under comparablesQualityValues */
function normalizeComparablesQualityKey(raw: string): string {
  const k = raw.toLowerCase().trim()
  if (k === 'moderate') return 'medium'
  return k
}

function getComparablesQualityLabel(tBreakdown: (key: string) => string, raw: string): string {
  const nestedKey = `comparablesQualityValues.${normalizeComparablesQualityKey(raw)}`
  const translated = tBreakdown(nestedKey as never)
  if (
    translated &&
    translated !== nestedKey &&
    !translated.startsWith('comparablesQualityValues.') &&
    !translated.includes('methodBreakdown.')
  ) {
    return translated
  }
  return raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function BreakdownMetricCard({
  label,
  value,
  accent = false,
  muted = false,
}: {
  label: string
  value: string
  accent?: boolean
  /** Visual de-emphasis when the value is `—` (unavailable). Keeps the grid stable. */
  muted?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2',
        muted ? 'border-border/40 bg-background/40' : 'border-border/60 bg-background/60'
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-foreground/45">{label}</p>
      <p
        className={cn(
          'mt-1 text-sm font-mono font-semibold tabular-nums',
          muted ? 'text-foreground/35' : accent ? 'text-primary' : 'text-foreground/80'
        )}
      >
        {value}
      </p>
    </div>
  )
}

/** Render a metric card stably: value when present, `—` placeholder when null
 *  so the grid shape stays the same across runs. */
function StableMetricCard({
  label,
  value,
  formatter,
  accent = false,
}: {
  label: string
  value: number | null
  formatter: (n: number) => string
  accent?: boolean
}) {
  return (
    <BreakdownMetricCard
      label={label}
      value={value != null ? formatter(value) : '—'}
      accent={accent && value != null}
      muted={value == null}
    />
  )
}

function MethodBreakdownSection({
  methodKey,
  method,
  result,
  fiscalAnchor,
  benchmarkMultiple,
  appliedMultiple,
  previewEquity,
}: {
  methodKey: string
  method: ValuationMethodResult | null
  result: ValuationResponse | null
  fiscalAnchor?: number | null
  benchmarkMultiple: number | null
  appliedMultiple: number | null
  previewEquity: number | null
}) {
  const tBreakdown = useTranslations('methodBreakdown')
  const tFcfReadiness = useTranslations('calculator.fcfReadiness')

  if (!method?.available) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 bg-background/60 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/55">
          {tBreakdown('title')}
        </p>
        <p className="mt-1 text-[11px] leading-snug text-foreground/50">
          {tBreakdown('notAvailable')}
        </p>
      </div>
    )
  }

  const resultAny = (result ?? null) as Record<string, any> | null
  const resultDetails =
    resultAny?.details && typeof resultAny.details === 'object'
      ? (resultAny.details as Record<string, unknown>)
      : {}
  const details =
    method.details && typeof method.details === 'object'
      ? (method.details as Record<string, unknown>)
      : {}

  const normalizedEbitda =
    toNumberOrNull(resultDetails.sustainable_ebitda) ??
    toNumberOrNull(resultDetails.weighted_ebitda_total) ??
    toNumberOrNull(resultAny?.ebitda)
  const revenueValue =
    toNumberOrNull(details.revenue) ??
    toNumberOrNull(resultDetails.revenue) ??
    toNumberOrNull(resultAny?.revenue)
  const arrValue =
    toNumberOrNull(details.arr) ??
    toNumberOrNull((details.saas_metrics as Record<string, unknown> | undefined)?.arr)
  const netDebt =
    toNumberOrNull(resultDetails.net_debt) ??
    toNumberOrNull(resultAny?.net_debt) ??
    toNumberOrNull((resultAny?.valuation_result as Record<string, unknown> | undefined)?.netDebt)
  const balanceSheetAdjustments =
    sumAdjustmentValues(resultDetails.balance_sheet_adjustments) ??
    sumAdjustmentValues(resultAny?.balance_sheet_adjustments)
  const enterpriseValue =
    toNumberOrNull(details.enterprise_value) ??
    toNumberOrNull(result?.multiples_valuation?.enterprise_value) ??
    toNumberOrNull(
      (resultAny?.valuation_result as Record<string, unknown> | undefined)?.enterpriseValueMid
    )
  const equityValue = toNumberOrNull(method.value)
  const wacc = toNumberOrNull(method.wacc ?? details.wacc)
  const terminalValue = toNumberOrNull(details.terminal_value)
  const terminalValueMethodology =
    typeof details.terminal_value_methodology === 'string'
      ? details.terminal_value_methodology
      : null
  const terminalExitMultiple = toNumberOrNull(details.terminal_exit_multiple)
  const dcfReadiness = isHistoricalFcfReadiness(details.historical_fcf_readiness)
    ? details.historical_fcf_readiness
    : isHistoricalFcfReadiness(result?.dcf_valuation?.historical_fcf_readiness)
      ? result.dcf_valuation.historical_fcf_readiness
      : null
  const sensitivityMatrix =
    details.sensitivity_matrix_2d &&
    typeof details.sensitivity_matrix_2d === 'object' &&
    Array.isArray((details.sensitivity_matrix_2d as Record<string, unknown>).wacc_values) &&
    Array.isArray((details.sensitivity_matrix_2d as Record<string, unknown>).ev_matrix)
      ? (details.sensitivity_matrix_2d as {
          wacc_values: number[]
          growth_values?: number[]
          secondary_values?: number[]
          secondary_axis_key?: 'terminal_growth' | 'exit_multiple' | string
          secondary_axis_format?: 'percent' | 'multiple' | string
          ev_matrix: number[][]
        })
      : null
  const ownerSalaryEstimate = toNumberOrNull(details.owner_salary_estimate)
  const sdeValue = toNumberOrNull(details.sde)
  const bookEquity =
    toNumberOrNull(details.book_equity) ??
    toNumberOrNull((details as Record<string, unknown>).fiscal_book_equity)
  const methodologyJustification =
    typeof details.methodology_justification === 'string'
      ? details.methodology_justification
      : typeof details.description === 'string'
        ? details.description
        : null
  const saasMetrics =
    details.saas_metrics && typeof details.saas_metrics === 'object'
      ? (details.saas_metrics as Record<string, unknown>)
      : null
  const saasRuleOf40 = toNumberOrNull(saasMetrics?.rule_of_40)
  const saasNrr = toNumberOrNull(saasMetrics?.nrr_pct)
  const comparablesCount = toNumberOrNull(result?.multiples_valuation?.comparables_count)
  const comparablesQuality = result?.multiples_valuation?.comparables_quality ?? null
  const pipelineRows = (result?.multiple_pipeline?.discount_waterfall?.slice(0, 4) ?? []).map(
    (row: WaterfallStep) => ({
      label: row.step_name,
      before: toNumberOrNull(row.multiple_before_mid) ?? toNumberOrNull(row.multiple_before_low),
      after: toNumberOrNull(row.multiple_after_mid) ?? toNumberOrNull(row.multiple_after_low),
      discount: toNumberOrNull(row.discount_percentage),
    })
  )

  const fallbackPipelineRows =
    pipelineRows.length > 0
      ? pipelineRows
      : (result?.multiple_pipeline?.stages?.slice(0, 4) ?? []).map(
          (stage: MultiplePipelineStage) => ({
            label: stage.step_name,
            before: toNumberOrNull(stage.multiple_before_mid ?? stage.multiple_before),
            after: toNumberOrNull(stage.multiple_after_mid ?? stage.multiple_after),
            discount: toNumberOrNull(stage.discount_percentage),
          })
        )

  const effectiveAppliedMultiple =
    appliedMultiple ??
    toNumberOrNull(method.multiple_used) ??
    toNumberOrNull(result?.multiple_pipeline?.final_multiple_mid) ??
    toNumberOrNull(result?.multiple_pipeline?.final_multiple)

  const missingReadinessFields =
    dcfReadiness == null
      ? []
      : [
          ...(dcfReadiness.actual_capex_years < dcfReadiness.historical_years_count
            ? [tFcfReadiness('fields.capex')]
            : []),
          ...(dcfReadiness.actual_tax_years < dcfReadiness.historical_years_count
            ? [tFcfReadiness('fields.taxes')]
            : []),
          ...(dcfReadiness.actual_nwc_years < Math.max(0, dcfReadiness.historical_years_count - 1)
            ? [tFcfReadiness('fields.working_capital')]
            : []),
        ]

  return (
    <div className="rounded-lg border border-primary/15 bg-primary/[0.03] px-4 py-4 space-y-3">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-primary/75">
        <Calculator className="w-3.5 h-3.5" />
        {tBreakdown('title')}
      </div>
      <p className="text-[11px] leading-snug text-foreground/55">
        {tBreakdown('subtitle', { method: method.label })}
      </p>
      {methodologyJustification && (
        <div className="rounded-lg border border-primary/15 bg-background/70 px-3 py-3">
          <p className="text-[11px] leading-snug text-foreground/65">{methodologyJustification}</p>
        </div>
      )}

      {methodKey === 'dcf' ? (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {wacc != null && (
              <BreakdownMetricCard
                label={tBreakdown('wacc')}
                value={formatPercent(wacc, 100) || '—'}
              />
            )}
            {terminalValue != null && (
              <BreakdownMetricCard
                label={tBreakdown('terminalValue')}
                value={formatCurrency(terminalValue)}
              />
            )}
            {terminalValueMethodology === 'exit_multiple' && terminalExitMultiple != null && (
              <BreakdownMetricCard
                label={tBreakdown('exitMultiple')}
                value={formatMultiple(terminalExitMultiple) || '—'}
              />
            )}
            {enterpriseValue != null && (
              <BreakdownMetricCard
                label={tBreakdown('enterpriseValue')}
                value={formatCurrency(enterpriseValue)}
              />
            )}
            {equityValue != null && (
              <BreakdownMetricCard
                label={tBreakdown('equityValue')}
                value={formatCurrency(equityValue)}
                accent
              />
            )}
          </div>
          {dcfReadiness && (
            <div className="rounded-lg border border-primary/15 bg-background/70 px-3 py-3 space-y-2">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-primary/75">
                <Calculator className="w-3.5 h-3.5" />
                {tBreakdown('historicalFcfReadiness')}
              </div>
              <p className="text-[11px] font-medium leading-snug text-foreground/80">
                {tFcfReadiness(`${dcfReadiness.status}.title`)}
              </p>
              <p className="text-[11px] leading-snug text-foreground/55">
                {tFcfReadiness(`${dcfReadiness.status}.description`, {
                  years: dcfReadiness.historical_years_count,
                  capex: dcfReadiness.actual_capex_years,
                  taxes: dcfReadiness.actual_tax_years,
                  workingCapital: dcfReadiness.actual_nwc_years,
                })}
              </p>
              {missingReadinessFields.length > 0 && (
                <p className="text-[11px] leading-snug text-foreground/50">
                  {tFcfReadiness('missing', {
                    fields: missingReadinessFields.join(', '),
                  })}
                </p>
              )}
            </div>
          )}
          <DcfSensitivityMatrix sensitivityData={sensitivityMatrix} />
        </div>
      ) : methodKey === 'sde_multiple' ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {ownerSalaryEstimate != null && (
            <BreakdownMetricCard
              label={tBreakdown('ownerSalaryEstimate')}
              value={formatCurrency(ownerSalaryEstimate)}
            />
          )}
          {sdeValue != null && (
            <BreakdownMetricCard
              label={tBreakdown('estimatedSde')}
              value={formatCurrency(sdeValue)}
            />
          )}
          {effectiveAppliedMultiple != null && (
            <BreakdownMetricCard
              label={tBreakdown('appliedMultiple')}
              value={formatMultiple(effectiveAppliedMultiple) || '—'}
            />
          )}
          {enterpriseValue != null && (
            <BreakdownMetricCard
              label={tBreakdown('enterpriseValue')}
              value={formatCurrency(enterpriseValue)}
            />
          )}
          {netDebt != null && (
            <BreakdownMetricCard label={tBreakdown('netDebt')} value={formatCurrency(netDebt)} />
          )}
          {equityValue != null && (
            <BreakdownMetricCard
              label={tBreakdown('equityValue')}
              value={formatCurrency(equityValue)}
              accent
            />
          )}
        </div>
      ) : methodKey === 'fiscal_4x' ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {bookEquity != null && (
            <BreakdownMetricCard
              label={tBreakdown('bookEquity')}
              value={formatCurrency(bookEquity)}
            />
          )}
          {normalizedEbitda != null && (
            <BreakdownMetricCard
              label={tBreakdown('normalizedEbitda')}
              value={formatCurrency(normalizedEbitda)}
            />
          )}
          <BreakdownMetricCard label={tBreakdown('fixedMultiple')} value="4.00x" />
          {fiscalAnchor != null && (
            <BreakdownMetricCard
              label={tBreakdown('fiscalAnchor')}
              value={formatCurrency(fiscalAnchor)}
            />
          )}
          {equityValue != null && (
            <BreakdownMetricCard
              label={tBreakdown('equityValue')}
              value={formatCurrency(equityValue)}
              accent
            />
          )}
        </div>
      ) : methodKey === 'adjusted_nav' ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {enterpriseValue != null && (
            <BreakdownMetricCard
              label={tBreakdown('adjustedNav')}
              value={formatCurrency(enterpriseValue)}
            />
          )}
          {netDebt != null && (
            <BreakdownMetricCard label={tBreakdown('netDebt')} value={formatCurrency(netDebt)} />
          )}
          {equityValue != null && (
            <BreakdownMetricCard
              label={tBreakdown('equityValue')}
              value={formatCurrency(equityValue)}
              accent
            />
          )}
        </div>
      ) : methodKey === 'arr_multiple' ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {arrValue != null && (
            <BreakdownMetricCard label={tBreakdown('arr')} value={formatCurrency(arrValue)} />
          )}
          {effectiveAppliedMultiple != null && (
            <BreakdownMetricCard
              label={tBreakdown('appliedMultiple')}
              value={formatMultiple(effectiveAppliedMultiple) || '—'}
            />
          )}
          {saasRuleOf40 != null && (
            <BreakdownMetricCard
              label={tBreakdown('ruleOf40')}
              value={formatPercent(saasRuleOf40, 1) || '—'}
            />
          )}
          {saasNrr != null && (
            <BreakdownMetricCard
              label={tBreakdown('netRevenueRetention')}
              value={formatPercent(saasNrr, 1) || '—'}
            />
          )}
          {enterpriseValue != null && (
            <BreakdownMetricCard
              label={tBreakdown('enterpriseValue')}
              value={formatCurrency(enterpriseValue)}
            />
          )}
          {netDebt != null && (
            <BreakdownMetricCard label={tBreakdown('netDebt')} value={formatCurrency(netDebt)} />
          )}
          {equityValue != null && (
            <BreakdownMetricCard
              label={tBreakdown('equityValue')}
              value={formatCurrency(equityValue)}
              accent
            />
          )}
        </div>
      ) : (
        <>
          {/* Stable grid: always render the same six slots so the layout
              doesn't reflow between runs. Missing values render as `—`. */}
          <div className="grid gap-2 sm:grid-cols-2">
            {isRevenueMethodologyKey(methodKey) ? (
              <StableMetricCard
                label={tBreakdown('revenue')}
                value={revenueValue}
                formatter={formatCurrency}
              />
            ) : (
              <StableMetricCard
                label={tBreakdown('normalizedEbitda')}
                value={normalizedEbitda}
                formatter={formatCurrency}
              />
            )}
            <StableMetricCard
              label={tBreakdown('benchmarkMultiple')}
              value={benchmarkMultiple}
              formatter={(n) => formatMultiple(n) ?? '—'}
            />
            <StableMetricCard
              label={tBreakdown('appliedMultiple')}
              value={effectiveAppliedMultiple}
              formatter={(n) => formatMultiple(n) ?? '—'}
            />
            <StableMetricCard
              label={tBreakdown('enterpriseValue')}
              value={enterpriseValue}
              formatter={formatCurrency}
            />
            <StableMetricCard
              label={tBreakdown('netDebt')}
              value={netDebt}
              formatter={formatCurrency}
            />
            <StableMetricCard
              label={tBreakdown('balanceSheetAdjustments')}
              value={
                balanceSheetAdjustments != null && balanceSheetAdjustments !== 0
                  ? balanceSheetAdjustments
                  : null
              }
              formatter={formatCurrency}
            />
            <StableMetricCard
              label={tBreakdown('equityValue')}
              value={equityValue}
              formatter={formatCurrency}
              accent
            />
            {previewEquity != null && (
              <BreakdownMetricCard
                label={tBreakdown('previewEquity')}
                value={formatCurrency(previewEquity)}
                accent
              />
            )}
          </div>

          {(comparablesCount != null || comparablesQuality || fallbackPipelineRows.length > 0) && (
            <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-3 space-y-2">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-foreground/55">
                <TrendingUp className="w-3.5 h-3.5" />
                {tBreakdown('multiplePipeline')}
              </div>
              {(comparablesCount != null || comparablesQuality) && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {comparablesCount != null && (
                    <BreakdownMetricCard
                      label={tBreakdown('comparablesCount')}
                      value={String(Math.round(comparablesCount))}
                    />
                  )}
                  {comparablesQuality && (
                    <BreakdownMetricCard
                      label={tBreakdown('comparablesQuality')}
                      value={getComparablesQualityLabel(tBreakdown, String(comparablesQuality))}
                    />
                  )}
                </div>
              )}
              {fallbackPipelineRows.length > 0 && (
                <div className="space-y-2">
                  {fallbackPipelineRows.map((row, index) => (
                    <div
                      key={`${row.label}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-md border border-border/50 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-foreground/75 truncate">
                          {row.label}
                        </p>
                        <p className="text-[10px] text-foreground/45">
                          {row.before != null && row.after != null
                            ? `${formatMultiple(row.before)} -> ${formatMultiple(row.after)}`
                            : tBreakdown('pipelineApplied')}
                        </p>
                      </div>
                      {row.discount != null && (
                        <span className="text-[11px] font-mono tabular-nums text-foreground/65">
                          {row.discount > 0 ? '+' : ''}
                          {row.discount.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div className="rounded-lg border border-dashed border-border/60 bg-background/60 px-3 py-2.5 space-y-1.5">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-foreground/55">
          <Scale className="w-3.5 h-3.5" />
          {tBreakdown('formulaHeading')}
        </div>
        <p className="text-[11px] leading-snug text-foreground/55">
          {methodKey === 'dcf'
            ? tBreakdown('formulaDcf')
            : methodKey === 'fiscal_4x'
              ? tBreakdown('formulaFiscal')
              : methodKey === 'adjusted_nav'
                ? tBreakdown('formulaNav')
                : methodKey === 'sde_multiple'
                  ? tBreakdown('formulaSde')
                  : methodKey === 'arr_multiple'
                    ? tBreakdown('formulaArr')
                    : isRevenueMethodologyKey(methodKey)
                      ? tBreakdown('formulaRevenue')
                      : tBreakdown('formulaMultiple')}
        </p>
        {/* Concrete numeric example built from this run's actual values when
            we have what we need. Renders in mono with proper × and → for M&A polish. */}
        {(() => {
          const isMultiple =
            methodKey === 'sde_multiple' ||
            methodKey === 'arr_multiple' ||
            isRevenueMethodologyKey(methodKey) ||
            (methodKey !== 'dcf' && methodKey !== 'fiscal_4x' && methodKey !== 'adjusted_nav')
          if (!isMultiple) return null
          const metric =
            methodKey === 'sde_multiple'
              ? sdeValue
              : methodKey === 'arr_multiple'
                ? arrValue
                : isRevenueMethodologyKey(methodKey)
                  ? revenueValue
                  : normalizedEbitda
          const mult = effectiveAppliedMultiple
          if (metric == null || mult == null || enterpriseValue == null) return null
          const eqVal = equityValue ?? enterpriseValue
          return (
            <p className="text-[11px] font-mono tabular-nums text-foreground/70 leading-relaxed pt-1 border-t border-border/40 break-words">
              {formatCurrency(metric)} <span className="text-foreground/40">×</span>{' '}
              {mult.toFixed(2)}× <span className="text-foreground/40">=</span>{' '}
              <span className="text-foreground/85">{formatCurrency(enterpriseValue)}</span>
              {netDebt != null && netDebt !== 0 && (
                <>
                  {' '}
                  <span className="text-foreground/40">{netDebt > 0 ? '−' : '+'}</span>{' '}
                  {formatCurrency(Math.abs(netDebt))}
                </>
              )}
              {balanceSheetAdjustments != null && balanceSheetAdjustments !== 0 && (
                <>
                  {' '}
                  <span className="text-foreground/40">
                    {balanceSheetAdjustments > 0 ? '+' : '−'}
                  </span>{' '}
                  {formatCurrency(Math.abs(balanceSheetAdjustments))}
                </>
              )}{' '}
              <span className="text-foreground/40">→</span>{' '}
              <span className="text-primary font-semibold">{formatCurrency(eqVal)}</span>
            </p>
          )
        })()}
      </div>
    </div>
  )
}

function StakeCalculatorSection({ equityValue }: { equityValue: number | null }) {
  const tModal = useTranslations('valuationEditModal')
  const [stakePercent, setStakePercent] = useState(100)

  if (equityValue == null) return null

  const proRataValue = equityValue * (stakePercent / 100)
  const isPartial = stakePercent < 100 && stakePercent > 0

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-foreground/55">
        <Percent className="w-3.5 h-3.5" aria-hidden />
        {tModal('stakeSection')}
      </div>
      <p className="text-[11px] leading-snug text-foreground/50">{tModal('stakeDescription')}</p>

      <div className="grid gap-1">
        <label
          className="text-[10px] font-medium text-foreground/45 uppercase"
          htmlFor="modal-stake-percent"
        >
          {tModal('stakeLabel')}
        </label>
        <input
          id="modal-stake-percent"
          type="number"
          step={0.01}
          min={1}
          max={100}
          value={stakePercent}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (Number.isFinite(v)) setStakePercent(Math.min(100, Math.max(1, v)))
          }}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono tabular-nums"
        />
        <input
          type="range"
          aria-label={tModal('stakeLabel')}
          min={1}
          max={100}
          step={1}
          value={Math.max(1, Math.round(stakePercent))}
          onChange={(e) => setStakePercent(parseFloat(e.target.value))}
          className="w-full h-2 mt-1 accent-primary"
        />
      </div>

      {isPartial && (
        <div className="rounded-md border border-amber-300/30 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle
              className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0"
              aria-hidden
            />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              {tModal('stakeIndicative')}
            </span>
          </div>
          <p className="text-lg font-mono font-semibold tabular-nums text-amber-800 dark:text-amber-300">
            {formatCurrency(proRataValue)}
          </p>
          <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 leading-snug">
            {tModal('stakeFormula', {
              equity: formatCurrency(equityValue),
              percent: stakePercent.toFixed(2),
            })}
          </p>
          <p className="text-[10px] text-amber-600/70 dark:text-amber-500/70 leading-snug">
            {tModal('stakeDisclaimer')}
          </p>
        </div>
      )}
    </div>
  )
}

export interface ValuationEditModalProps {
  open: boolean
  onClose: () => void
  valuationResults: Record<string, ValuationMethodResult>
  isHydratingMethods?: boolean
  /** Set when report hydration failed after retries (e.g. 429) — distinct from missing payloads */
  methodDataLoadError?: 'transient' | 'report_pending' | null
  /** Re-fetch report method data (parent bumps hydration nonce); shown for transient errors */
  onRetryMethodDataLoad?: () => void
  /** Accountant recovery path: return to Mercury and open "Controleer & vul aan". */
  onContinueImportReview?: () => void
  selectedMethod: string
  onSelectMethod: (method: string, reason?: string, note?: string) => void
  fiscalAnchor?: number | null
  showFiscalAnchorRow?: boolean
  result: ValuationResponse | null
  preparerDisabled?: boolean
  onRecalculate?: () => void
  industryLabel?: string
  businessTypeLabel?: string
  countryCode?: string
  showZeroDraftExport?: boolean
  canExportZeroDraft?: boolean
  zeroDraftReportId?: string
  zeroDraftBusinessName?: string | null
  zeroDraftCreatedAt?: string | null
  showPreparerMultiple?: boolean
  /** True while PATCH + getReport merge runs after a method change (parent drives) */
  isMethodPersisting?: boolean
  /** Accountant firm country — hides BE-only fiscal method in method panorama */
  firmCountryCode?: string
  /** Null = all methods; list = plan restriction (shows locked rows as teasers) */
  planAllowedMethodKeys?: string[] | null
  onPlanLockedMethodClick?: () => void
}

export function ValuationEditModal({
  open,
  onClose,
  valuationResults,
  isHydratingMethods = false,
  methodDataLoadError = null,
  onRetryMethodDataLoad,
  onContinueImportReview,
  selectedMethod,
  onSelectMethod,
  fiscalAnchor,
  showFiscalAnchorRow = false,
  result,
  preparerDisabled,
  onRecalculate,
  industryLabel,
  businessTypeLabel,
  countryCode,
  showZeroDraftExport = false,
  canExportZeroDraft = true,
  zeroDraftReportId,
  zeroDraftBusinessName,
  zeroDraftCreatedAt,
  showPreparerMultiple = false,
  isMethodPersisting = false,
  firmCountryCode,
  planAllowedMethodKeys = null,
  onPlanLockedMethodClick,
}: ValuationEditModalProps) {
  const t = useTranslations('omniCalc')
  const tPrep = useTranslations('preparerMultiple')
  const tModal = useTranslations('valuationEditModal')
  const tBreakdown = useTranslations('methodBreakdown')
  const tMethodSelector = useTranslations('manualInput.methodSelector')
  const locale = useLocale()

  const getMethodLabel = useCallback(
    (key: string) => {
      const path = METHOD_LABEL_KEYS[key]
      if (!path) return key
      const short = path.replace('manualInput.methodSelector.', '') as Parameters<
        typeof tMethodSelector
      >[0]
      return tMethodSelector(short)
    },
    [tMethodSelector]
  )

  const panoramaValuationResults = useMemo(
    () =>
      mergePlanGatedOmniPanoramaResults(valuationResults, planAllowedMethodKeys ?? null, {
        hideFiscalForNl: firmCountryCode?.trim().toUpperCase().substring(0, 2) === 'NL',
        getLabel: getMethodLabel,
      }),
    [valuationResults, planAllowedMethodKeys, firmCountryCode, getMethodLabel]
  )

  const adaptiveLabel = t('currentMethodAdaptive')
  const [mode, setMode] = useState<'ai' | 'manual'>(
    selectedMethod !== 'upswitch_adaptive' ? 'manual' : 'ai'
  )
  const [pendingMethod, setPendingMethod] = useState<string | null>(null)
  const [overrideReasonKey, setOverrideReasonKey] = useState('')
  const [overrideNote, setOverrideNote] = useState('')
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  // Per-modal-open "I dismissed the auto-suggestion" — keeps the suggestion
  // panel from re-appearing every render once the preparer made an
  // explicit decision (apply / dismiss). Reset on result change so a new
  // calculation can re-surface a fresh signal.
  const [suggestionDismissed, setSuggestionDismissed] = useState(false)

  useEffect(() => {
    const newMode = selectedMethod === 'upswitch_adaptive' ? 'ai' : 'manual'
    setMode(newMode)
    setPendingMethod(null)
    setOverrideReasonKey('')
    setOverrideNote('')
  }, [selectedMethod])

  useEffect(() => {
    if (open) {
      setPendingMethod(null)
      setOverrideReasonKey('')
      setOverrideNote('')
    }
  }, [open])

  // Preparer store
  const benchmarkMedian = usePreparerMultipleStore((s) => s.benchmarkMedian)
  const appliedMedian = usePreparerMultipleStore((s) => s.appliedMedian)
  const reasonKey = usePreparerMultipleStore((s) => s.reasonKey)
  const note = usePreparerMultipleStore((s) => s.note)
  const acknowledgedExtreme = usePreparerMultipleStore((s) => s.acknowledgedExtreme)
  const syncFromValuationResult = usePreparerMultipleStore((s) => s.syncFromValuationResult)
  const setAppliedMedian = usePreparerMultipleStore((s) => s.setAppliedMedian)
  const setReasonKey = usePreparerMultipleStore((s) => s.setReasonKey)
  const setNote = usePreparerMultipleStore((s) => s.setNote)
  const setAcknowledgedExtreme = usePreparerMultipleStore((s) => s.setAcknowledgedExtreme)
  const resetToBenchmark = usePreparerMultipleStore((s) => s.resetToBenchmark)

  useEffect(() => {
    if (result) syncFromValuationResult(result)
    // Re-arm the suggestion panel each time a fresh result arrives — the
    // dossier signals can change between recalculations (e.g. owner role
    // changed → owner-dependency risk re-evaluated).
    setSuggestionDismissed(false)
  }, [result, syncFromValuationResult])

  const entries = Object.entries(valuationResults)
  const panoramaEntries = Object.entries(panoramaValuationResults)
  const activeMethodKey = pendingMethod ?? selectedMethod
  const activeMethod = getValuationMethodResultForKey(valuationResults, activeMethodKey) ?? null
  const pendingOverrideRow =
    pendingMethod && pendingMethod !== 'upswitch_adaptive'
      ? getValuationMethodResultForKey(valuationResults, pendingMethod)
      : null

  // Method selection helpers
  const getSelectedMethodLabel = (method: string) =>
    method === 'upswitch_adaptive'
      ? adaptiveLabel
      : getValuationMethodResultForKey(valuationResults, method)?.label || adaptiveLabel

  const currentMethodLabel = getSelectedMethodLabel(selectedMethod)

  const methodSelectionLocked = isMethodPersisting

  const handleModeChange = (newMode: 'ai' | 'manual') => {
    if (methodSelectionLocked) return
    setMode(newMode)
    if (newMode === 'ai') {
      setPendingMethod(null)
      setOverrideReasonKey('')
      setOverrideNote('')
      onSelectMethod('upswitch_adaptive')
    }
  }

  const handleMethodClick = (key: string) => {
    if (methodSelectionLocked) return
    if (key === 'upswitch_adaptive') {
      handleModeChange('ai')
      return
    }
    setPendingMethod(key)
    setOverrideReasonKey('')
    setOverrideNote('')
  }

  const handleConfirmOverride = () => {
    if (methodSelectionLocked) return
    if (!pendingMethod || !overrideReasonKey) return
    onSelectMethod(pendingMethod, overrideReasonKey, overrideNote || undefined)
    setPendingMethod(null)
    setOverrideReasonKey('')
    setOverrideNote('')
  }

  const showMethodList = mode === 'manual'
  const guidanceTone = pendingMethod
    ? 'border-primary/20 bg-primary/[0.04] text-primary/80'
    : mode === 'manual'
      ? 'border-amber-300/30 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400'
      : 'border-border/60 bg-background/60 text-foreground/60'
  const guidanceText = pendingMethod
    ? t('stepExplainReason')
    : mode === 'manual'
      ? t('stepChooseMethod')
      : t('stepAiActive')

  const availableCount = panoramaEntries.filter(([, m]) => m.available).length

  // Preparer helpers
  const mv = result?.multiples_valuation
  const appliedNum = appliedMedian != null ? Number(appliedMedian) : null
  const benchmarkNum =
    benchmarkMedian ?? (mv?.ebitda_multiple != null ? Number(mv.ebitda_multiple) : null)
  const prepDeltaNum =
    appliedNum != null && benchmarkNum != null
      ? Math.round((appliedNum - benchmarkNum) * 100) / 100
      : null
  const showExtreme =
    appliedNum != null &&
    clientShouldWarnExtremeMultiple(
      appliedNum,
      mv?.p10_ebitda_multiple,
      mv?.p90_ebitda_multiple,
      benchmarkMedian,
      mv?.p25_ebitda_multiple,
      mv?.p75_ebitda_multiple
    )
  const bench = benchmarkNum ?? 5

  // Slider clamps anchored on benchmark (replaces legacy hard-coded 0.1–20×):
  // – wide enough to cover strategic-buyer premia (up to ~2.2× benchmark)
  //   and distress / asset-heavy discounts (down to ~0.45× benchmark);
  // – capped at 30× absolute ceiling so SaaS-flavoured peers stay reachable
  //   without unlocking joke values; floor at 0.5× absolute.
  const sliderMin = Math.max(0.5, Math.round(bench * 0.45 * 20) / 20)
  const sliderMax = Math.min(30, Math.round(bench * 2.2 * 20) / 20)

  // Extreme-band info for descriptive warning copy.
  const extremeBoundInfo = (() => {
    if (!showExtreme || appliedNum == null) return null
    const p90 = mv?.p90_ebitda_multiple
    const p75 = mv?.p75_ebitda_multiple
    const p10 = mv?.p10_ebitda_multiple
    const p25 = mv?.p25_ebitda_multiple
    const hi = p90 != null && p90 > 0 ? p90 : p75
    const lo = p10 != null && p10 > 0 ? p10 : p25
    if (hi != null && appliedNum > hi) {
      return {
        direction: tPrep('extremeWarningAbove'),
        directionLabel: tPrep('extremeWarningDirAboveLabel'),
        bound: 'p90',
        boundValue: hi.toFixed(2),
      }
    }
    if (lo != null && appliedNum < lo) {
      return {
        direction: tPrep('extremeWarningBelow'),
        directionLabel: tPrep('extremeWarningDirBelowLabel'),
        bound: 'p10',
        boundValue: lo.toFixed(2),
      }
    }
    return null
  })()

  // ── "Already in the benchmark" — surface the engine's own discount cascade
  //    so the preparer can see what's already priced in BEFORE adding their
  //    own override. The waterfall stages carry both the step label and the
  //    discount percentage; we filter trivial (<0.1pt) noise so the card
  //    stays actionable. Falls back to `stages` when `discount_waterfall`
  //    isn't present (legacy payloads). #}
  const engineDiscountSteps = useMemo(() => {
    const pipeline = (result as ValuationResponse | null)?.multiple_pipeline
    const raw = pipeline?.discount_waterfall ?? pipeline?.stages ?? []
    const TRIVIAL = 0.1
    return raw
      .map((row) => {
        const name = (row as { step_name?: string }).step_name ?? ''
        const pct =
          'discount_percentage' in row && typeof row.discount_percentage === 'number'
            ? row.discount_percentage
            : null
        return name && pct != null && Math.abs(pct) >= TRIVIAL ? { name: name.trim(), pct } : null
      })
      .filter((row): row is { name: string; pct: number } => row !== null)
      .slice(0, 6) // keep the card scannable on a narrow modal column
  }, [result])

  // ── Dossier-signal-driven calibration suggestion. Fed from the response
  //    root (recurring-revenue %, owner-concentration risk) and de-duped
  //    against the engine's discount waterfall so we never propose a
  //    discount the engine has already applied. See
  //    `preparerCalibrationSuggestions.detectDossierSignal` for the rules. #}
  const dossierSignal = useMemo(() => {
    const resultRecord = (result ?? null) as Record<string, unknown> | null
    const recurringRevenuePercentage = toNumberOrNull(resultRecord?.recurring_revenue_percentage)
    const ownerConcRisk =
      typeof mv?.owner_concentration?.risk_level === 'string'
        ? mv.owner_concentration.risk_level
        : null
    return detectDossierSignal({
      recurringRevenuePercentage,
      ownerConcentrationRisk: ownerConcRisk,
      appliedWaterfallStepNames: engineDiscountSteps.map((s) => s.name),
    })
  }, [result, mv, engineDiscountSteps])

  // ── Restored-from-save signal. The store has already hydrated the picker
  //    from `multiple_adjustment_summary`; we surface a small badge so the
  //    preparer knows these aren't fresh defaults but their last save. #}
  const wasRestoredFromSave = useMemo(() => {
    const savedKey = result?.multiple_adjustment_summary?.reason_key
    return Boolean(savedKey && savedKey === reasonKey)
  }, [result, reasonKey])

  // ── Currently-selected reason's typical band (for the inline caption
  //    under the Justification picker). Hidden for `other` (no anchor) and
  //    when no reason is picked. We narrow the empty-string case via a
  //    truthy check so the SUGGESTED_DELTA_BAND lookup is type-safe.
  const selectedReasonBand = reasonKey ? SUGGESTED_DELTA_BAND[reasonKey] : null

  let regionName: string | null = null
  if (countryCode && countryCode.length === 2) {
    try {
      const loc = locale === 'nl' ? 'nl-BE' : 'en-GB'
      regionName =
        new Intl.DisplayNames([loc], { type: 'region' }).of(countryCode.toUpperCase()) ?? null
    } catch {
      regionName = countryCode.toUpperCase()
    }
  }
  const contextSegments = [businessTypeLabel, industryLabel, regionName].filter(
    (s): s is string => typeof s === 'string' && s.trim().length > 0
  )
  const benchmarkContext =
    contextSegments.length > 0 ? contextSegments.join(tPrep('contextSeparator')) : null

  const qualityRaw = `${mv?.comparables_quality ?? ''} ${mv?.confidence ?? ''}`.toUpperCase()
  let confidenceKey: 'confidenceHigh' | 'confidenceMedium' | 'confidenceLow' | 'confidenceDefault' =
    'confidenceDefault'
  if (qualityRaw.includes('HIGH')) confidenceKey = 'confidenceHigh'
  else if (qualityRaw.includes('MEDIUM') || qualityRaw.includes('MODERATE'))
    confidenceKey = 'confidenceMedium'
  else if (qualityRaw.includes('LOW')) confidenceKey = 'confidenceLow'

  const hasPrepData = !!(result?.multiples_valuation?.ebitda_multiple || benchmarkMedian != null)
  const nonEbitdaMethodSelected =
    selectedMethod !== 'upswitch_adaptive' && selectedMethod !== 'ebitda_multiple'
  const effectiveDisabled = preparerDisabled || nonEbitdaMethodSelected || isMethodPersisting

  const savedSummary = result?.multiple_adjustment_summary
  const livePreview =
    benchmarkNum != null &&
    appliedNum != null &&
    reasonKey &&
    Math.abs(appliedNum - benchmarkNum) >= 0.005
      ? tPrep('previewTemplate', {
          benchmark: benchmarkNum.toFixed(2),
          applied: appliedNum.toFixed(2),
          delta: Math.abs(appliedNum - benchmarkNum).toFixed(2),
          adjustmentLabel:
            appliedNum >= benchmarkNum ? tPrep('adjustmentPremium') : tPrep('adjustmentDiscount'),
          reason: tPrep(`reasons.${reasonKey}`),
        }) + (note.trim() ? ` ${tPrep('previewNote', { note: note.trim() })}` : '')
      : null
  const savedPreview =
    locale === 'nl'
      ? (savedSummary?.generated_footnote_nl ?? savedSummary?.generated_footnote ?? null)
      : (savedSummary?.generated_footnote_en ?? savedSummary?.generated_footnote ?? null)
  const previewText = livePreview ?? savedPreview
  const resultDetails =
    result &&
    (result as Record<string, any>).details &&
    typeof (result as Record<string, any>).details === 'object'
      ? (((result as Record<string, any>).details as Record<string, unknown>) ?? {})
      : {}
  const previewNetDebt =
    toNumberOrNull(resultDetails.net_debt) ??
    toNumberOrNull((result as Record<string, any> | null)?.net_debt) ??
    0
  const previewBalanceSheetAdjustments =
    sumAdjustmentValues(resultDetails.balance_sheet_adjustments) ??
    sumAdjustmentValues((result as Record<string, any> | null)?.balance_sheet_adjustments) ??
    0
  const sustainableEbitda =
    toNumberOrNull(resultDetails.sustainable_ebitda) ??
    toNumberOrNull(resultDetails.weighted_ebitda_total) ??
    toNumberOrNull((result as Record<string, any> | null)?.ebitda)
  // Always render the live preview when EBITDA + multiple are known so the
  // reader gets immediate "what will the headline be after Recalculate?" signal.
  // Benchmark fallback: when the user hasn't moved the slider, preview the
  // benchmark median itself (delta = 0 against headline by construction).
  const previewMultiple =
    appliedNum != null && Number.isFinite(appliedNum)
      ? appliedNum
      : benchmarkNum != null && Number.isFinite(benchmarkNum)
        ? benchmarkNum
        : null
  const liveEquityPreview =
    sustainableEbitda != null && previewMultiple != null && previewMultiple > 0
      ? Math.round(
          sustainableEbitda * previewMultiple - previewNetDebt + previewBalanceSheetAdjustments
        )
      : null
  const activeMetricValue = toNumberOrNull(activeMethod?.value)

  if (panoramaEntries.length === 0) {
    const title = isHydratingMethods
      ? tModal('loadingTitle')
      : methodDataLoadError === 'transient'
        ? t('transientLoadTitle')
        : methodDataLoadError === 'report_pending'
          ? t('unavailableTitleReportPending')
          : t('unavailableTitleLegacy')
    const blurb = isHydratingMethods
      ? tModal('loadingBlurb')
      : methodDataLoadError === 'transient'
        ? t('transientLoadBlurb')
        : methodDataLoadError === 'report_pending'
          ? t('unavailableBlurbReportPending')
          : t('unavailableBlurbLegacy')
    return (
      <Modal open={open} onOpenChange={(v) => !v && onClose()}>
        <ModalContent
          size="2xl"
          description={tModal('description')}
          className="max-h-[92vh] flex flex-col overflow-hidden"
        >
          <ModalHeader className="shrink-0">
            <ModalTitle>{tModal('title')}</ModalTitle>
          </ModalHeader>
          <div className="rounded-lg border border-dashed border-border/60 bg-background/60 px-4 py-5 text-center space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
              {title}
            </p>
            <p className="text-[11px] leading-snug text-foreground/50">{blurb}</p>
            {methodDataLoadError === 'report_pending' && onContinueImportReview ? (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                <AuroraButton
                  type="button"
                  variant="primary"
                  size="sm"
                  className="text-xs"
                  disabled={isHydratingMethods}
                  onClick={onContinueImportReview}
                >
                  {tModal('continueImportReview')}
                </AuroraButton>
                {onRetryMethodDataLoad ? (
                  <AuroraButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="text-xs"
                    disabled={isHydratingMethods}
                    onClick={onRetryMethodDataLoad}
                  >
                    {tModal('retryMethodDataLoad')}
                  </AuroraButton>
                ) : null}
              </div>
            ) : (methodDataLoadError === 'transient' || methodDataLoadError === 'report_pending') &&
              onRetryMethodDataLoad ? (
              <AuroraButton
                type="button"
                variant="primary"
                size="sm"
                className="text-xs"
                disabled={isHydratingMethods}
                onClick={onRetryMethodDataLoad}
              >
                {tModal('retryMethodDataLoad')}
              </AuroraButton>
            ) : null}
          </div>
        </ModalContent>
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) return
        if (isMethodPersisting) return
        onClose()
      }}
    >
      <ModalContent
        size="2xl"
        description={tModal('description')}
        className="max-h-[92vh] flex flex-col overflow-hidden"
        aria-busy={isMethodPersisting}
        closeDisabled={isMethodPersisting}
        onPointerDownOutside={(e) => {
          if (isMethodPersisting) e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          if (isMethodPersisting) e.preventDefault()
        }}
      >
        <ModalHeader className="shrink-0">
          <ModalTitle>{tModal('title')}</ModalTitle>
        </ModalHeader>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:items-stretch lg:gap-8">
          {/* Left: method mode, panorama selection, override */}
          <div className="space-y-3 min-h-0 min-w-0 flex-1 lg:max-h-[min(82vh,880px)] lg:overflow-y-auto lg:pr-2">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <h4 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                  {tModal('methodSection')}
                </h4>
                <p className="text-[11px] leading-snug text-foreground/50">{t('subtitle')}</p>
              </div>
              <div className="shrink-0 text-right max-w-[55%]">
                <span className="text-[10px] text-foreground/40 leading-tight block">
                  {t('methodsReadyBadge', {
                    available: availableCount,
                    total: panoramaEntries.length,
                  })}
                </span>
                <div className="mt-1 inline-flex items-center rounded-full border border-primary/15 bg-primary/[0.05] px-2 py-1 text-[10px] font-medium text-primary/80 max-w-full">
                  <span className="truncate">
                    {t('currentMethodLabel', { method: currentMethodLabel })}
                  </span>
                </div>
              </div>
            </div>

            <SegmentedControl
              options={[
                {
                  value: 'ai' as const,
                  label: t('modeAi'),
                },
                {
                  value: 'manual' as const,
                  label: t('modeManual'),
                  icon: <Pencil className="w-3 h-3" />,
                },
              ]}
              value={mode}
              onChange={handleModeChange}
              size="sm"
              fullWidth
              disabled={methodSelectionLocked}
              aria-label={t('modeLabel')}
            />

            <div
              role="status"
              aria-live="polite"
              className={cn('rounded-md border px-3 py-2 text-[11px] leading-snug', guidanceTone)}
            >
              {guidanceText}
            </div>

            {isMethodPersisting && (
              <p
                className="text-[11px] text-foreground/50 mt-2 flex items-center gap-2"
                role="status"
                aria-live="polite"
              >
                <Loader2
                  className="w-3.5 h-3.5 animate-spin shrink-0 text-primary/70"
                  aria-hidden
                />
                {tModal('persistingMethod')}
              </p>
            )}

            {showMethodList && (
              <OmniMethodPanorama
                valuationResults={panoramaValuationResults}
                selectedMethod={selectedMethod}
                pendingMethod={pendingMethod}
                methodSelectionLocked={methodSelectionLocked}
                onMethodClick={handleMethodClick}
                firmCountryCode={firmCountryCode}
                onPlanLockedMethodClick={onPlanLockedMethodClick}
                comparablesCount={
                  mv?.comparables_count != null ? Number(mv.comparables_count) : null
                }
                comparablesQuality={mv?.comparables_quality ?? null}
              />
            )}

            {pendingMethod && pendingMethod !== 'upswitch_adaptive' && (
              <div className="rounded-lg border border-primary/20 bg-primary/[0.03] px-3 py-3 space-y-2">
                {pendingOverrideRow?.label && (
                  <p className="text-[10px] font-medium text-foreground/55">
                    {t('overrideConfirmingFor', {
                      method: pendingOverrideRow.label,
                    })}
                  </p>
                )}
                <p className="text-[11px] font-semibold text-primary/80 uppercase tracking-wider">
                  {t('overrideJustificationTitle')}
                </p>
                <p className="text-[10px] text-foreground/50 leading-snug">
                  {t('overrideJustificationBlurb')}
                </p>
                <AuroraSelect
                  size="sm"
                  value={overrideReasonKey}
                  onChange={(v) => setOverrideReasonKey(v)}
                  label={t('overrideJustificationTitle')}
                  placeholder={t('overrideReasonPlaceholder')}
                  options={METHOD_OVERRIDE_REASON_KEYS.map((k) => ({
                    value: k,
                    label: t(`overrideReasons.${k}`),
                  }))}
                />
                <textarea
                  value={overrideNote}
                  onChange={(e) => setOverrideNote(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder={t('overrideNotePlaceholder')}
                  aria-label={t('overrideNotePlaceholder')}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs resize-none"
                />
                <div className="flex gap-2">
                  <AuroraButton
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={!overrideReasonKey || methodSelectionLocked}
                    className="flex-1 text-xs"
                    onClick={handleConfirmOverride}
                  >
                    {t('overrideConfirm')}
                  </AuroraButton>
                  <AuroraButton
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={methodSelectionLocked}
                    className="text-xs"
                    onClick={() => setPendingMethod(null)}
                  >
                    {t('overrideCancel')}
                  </AuroraButton>
                </div>
              </div>
            )}

            {showFiscalAnchorRow &&
              fiscalAnchor != null &&
              !getValuationMethodResultForKey(valuationResults, 'fiscal_4x') && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-foreground/[0.02] border border-dashed border-border/50">
                    <span className="text-[10px] font-medium text-foreground/50 uppercase tracking-wider">
                      {t('fiscalAnchor')}
                    </span>
                    <span className="text-xs font-mono font-medium text-foreground/60 tabular-nums">
                      {formatCurrency(Number(fiscalAnchor))}
                    </span>
                  </div>
                  <p className="text-[9px] text-foreground/40 leading-snug px-1">
                    {t('fiscalAnchorFootnote')}
                  </p>
                </div>
              )}
          </div>

          {/* Right: calculation transparency, EV/EBITDA preparer, Zero Draft */}
          <div
            role="region"
            aria-label={t('detailsColumnTitle')}
            className="space-y-4 min-h-0 min-w-0 flex-1 border-t lg:border-t-0 lg:border-l border-border/40 pt-4 lg:pt-0 lg:pl-6 lg:max-h-[min(82vh,880px)] lg:overflow-y-auto"
          >
            <MethodBreakdownSection
              methodKey={activeMethodKey}
              method={activeMethod}
              result={result}
              fiscalAnchor={fiscalAnchor}
              benchmarkMultiple={benchmarkNum}
              appliedMultiple={appliedNum}
              previewEquity={liveEquityPreview}
            />

            {/* ─── Calibrate EV/EBITDA multiple ─── */}
            {showPreparerMultiple && hasPrepData && (
              <div className={cn('space-y-3', nonEbitdaMethodSelected && 'opacity-60')}>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h4 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                      {tModal('multipleSection')}
                    </h4>
                    {wasRestoredFromSave && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/[0.06] px-2 py-0.5 text-[10px] font-medium text-primary/85"
                        title={tPrep('restoredBadgeLabel')}
                      >
                        <svg
                          className="w-2.5 h-2.5"
                          viewBox="0 0 12 12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <path d="M6 1v4l2.5 1.5" />
                          <circle cx="6" cy="6" r="5" />
                        </svg>
                        {tPrep('restoredBadgeLabel')}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] leading-snug text-foreground/55">
                    {tModal('multipleSectionLead')}
                  </p>
                </div>

                {nonEbitdaMethodSelected && (
                  <div className="rounded-md border border-amber-300/30 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-2">
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
                      {selectedMethod === 'fiscal_4x'
                        ? tPrep('hintFiscalMethod')
                        : tPrep('hintOtherMethod')}
                    </p>
                  </div>
                )}

                {/* Benchmark anchor — single big number with caption above. */}
                <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-foreground/45">
                    {tPrep('benchmark')}
                  </p>
                  <p className="text-[11px] text-foreground/60 leading-snug mt-0.5">
                    {benchmarkContext
                      ? tPrep('benchmarkAnchored', {
                          context: benchmarkContext,
                          multiple: (benchmarkMedian ?? bench).toFixed(2),
                        })
                      : tPrep('benchmarkAnchoredShort', {
                          multiple: (benchmarkMedian ?? bench).toFixed(2),
                        })}
                  </p>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span className="text-2xl font-mono font-semibold tabular-nums text-primary leading-none">
                      {(benchmarkMedian ?? bench).toFixed(2)}×
                    </span>
                    <span className="text-[10px] text-foreground/45">
                      {tPrep('benchmarkConfidence', { level: tPrep(confidenceKey) })}
                      {mv?.confidence_score != null && Number.isFinite(Number(mv.confidence_score))
                        ? ` · ${tPrep('scoreLabel', { score: Math.round(Number(mv.confidence_score)) })}`
                        : ''}
                    </span>
                  </div>
                </div>

                {/* "Already in the benchmark" — surfaces the engine's own discount
                  cascade so the preparer sees what's already priced in BEFORE
                  adding their own override. Without this card, every override
                  risks double-counting an effect the engine already booked. */}
                <details
                  className="rounded-lg border border-border/50 bg-background/40 group"
                  open={engineDiscountSteps.length > 0 && engineDiscountSteps.length <= 3}
                >
                  <summary className="cursor-pointer px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-foreground/55 marker:hidden flex items-center justify-between gap-2 select-none">
                    <span>{tPrep('alreadyInBenchmarkTitle')}</span>
                    <span className="font-mono tabular-nums text-foreground/40">
                      {engineDiscountSteps.length > 0 ? `${engineDiscountSteps.length}` : '—'}
                    </span>
                  </summary>
                  <div className="px-3 pb-2.5 pt-1 space-y-1.5 border-t border-border/30">
                    <p className="text-[10px] leading-snug text-foreground/50">
                      {tPrep('alreadyInBenchmarkSubtitle')}
                    </p>
                    {engineDiscountSteps.length === 0 ? (
                      <p className="text-[10px] italic text-foreground/45 pt-1">
                        {tPrep('alreadyInBenchmarkEmpty')}
                      </p>
                    ) : (
                      <ul className="space-y-1 text-[11px]">
                        {engineDiscountSteps.map((step, idx) => (
                          <li
                            key={`${step.name}-${idx}`}
                            className="flex items-baseline justify-between gap-2 font-mono tabular-nums"
                          >
                            <span className="font-sans text-foreground/70 truncate">
                              {step.name}
                            </span>
                            <span
                              className={cn(
                                'shrink-0 font-semibold',
                                step.pct < 0
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              )}
                            >
                              {step.pct > 0 ? '+' : '−'}
                              {Math.abs(step.pct).toFixed(1)}%
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>

                {/* Auto-suggested calibration. Surfaced only when:
                  – a clear dossier signal applies (e.g. CRITICAL owner risk)
                  – the engine hasn't already discounted for that signal
                  – the preparer hasn't dismissed it for this session.
                  One-click apply pre-fills both reasonKey and appliedMedian.
                  We respect any saved override (don't override the saved
                  reasonKey unless suggestion differs and user clicks). */}
                {dossierSignal != null &&
                  !suggestionDismissed &&
                  !nonEbitdaMethodSelected &&
                  benchmarkNum != null &&
                  benchmarkNum > 0 &&
                  !(wasRestoredFromSave && reasonKey === dossierSignal.reasonKey) && (
                    <div className="rounded-lg border border-amber-300/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                          {tPrep('suggestedBadgeLabel')}
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold text-amber-900 dark:text-amber-200 leading-snug">
                        {tPrep('suggestionPanelTitle')}
                      </p>
                      <p className="text-[11px] leading-snug text-amber-800/85 dark:text-amber-200/85">
                        {tPrep('suggestionPanelBody', {
                          signal: tPrep(dossierSignal.i18nKey, dossierSignal.i18nValues ?? {}),
                          direction_label:
                            dossierSignal.band.direction === 'discount'
                              ? tPrep('signalDirectionDiscount')
                              : tPrep('signalDirectionPremium'),
                          low: dossierSignal.band.lowPct,
                          high: dossierSignal.band.highPct,
                        })}
                      </p>
                      <div className="flex gap-2 pt-0.5">
                        <AuroraButton
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={effectiveDisabled}
                          className="flex-1 text-[11px]"
                          onClick={() => {
                            const projected = projectSuggestedMultiple(
                              benchmarkNum,
                              dossierSignal.band
                            )
                            // Clamp into the slider band so the suggested value
                            // is always reachable by the input/slider afterward.
                            const clamped = Math.min(sliderMax, Math.max(sliderMin, projected))
                            setAppliedMedian(clamped)
                            setReasonKey(dossierSignal.reasonKey)
                            setSuggestionDismissed(true)
                          }}
                        >
                          {tPrep('suggestionApplyCta', {
                            percent: dossierSignal.band.midPct,
                            direction_label:
                              dossierSignal.band.direction === 'discount'
                                ? tPrep('signalDirectionDiscount')
                                : tPrep('signalDirectionPremium'),
                          })}
                        </AuroraButton>
                        <AuroraButton
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={effectiveDisabled}
                          className="text-[11px]"
                          onClick={() => setSuggestionDismissed(true)}
                        >
                          {tPrep('suggestionDismissCta')}
                        </AuroraButton>
                      </div>
                    </div>
                  )}

                {/* Quick scenarios — one-click M&A scenarios that pre-fill
                  reason + applied multiple. The auto-suggest panel above
                  is dossier-driven (single best-fit signal); this row gives
                  the preparer the standard "shapes" they reach for daily.
                  Both surfaces share SUGGESTED_DELTA_BAND so the resulting
                  multiples are identical. */}
                {!nonEbitdaMethodSelected && benchmarkNum != null && benchmarkNum > 0 && (
                  <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-2.5 space-y-2">
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/55">
                        {tPrep('presetsTitle')}
                      </p>
                      <p className="text-[10px] leading-snug text-foreground/45">
                        {tPrep('presetsSubtitle')}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {SCENARIO_PRESETS.map((preset) => {
                        const projected = projectSuggestedMultiple(benchmarkNum, preset.band)
                        const isActive = reasonKey === preset.reasonKey
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            disabled={effectiveDisabled}
                            aria-pressed={isActive}
                            className={cn(
                              'group flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 text-left transition-colors',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                              'disabled:opacity-50 disabled:cursor-not-allowed',
                              isActive
                                ? 'border-primary/40 bg-primary/[0.08]'
                                : preset.band.direction === 'discount'
                                  ? 'border-rose-500/20 bg-rose-500/[0.04] hover:border-rose-500/35 hover:bg-rose-500/[0.06]'
                                  : 'border-emerald-500/20 bg-emerald-500/[0.04] hover:border-emerald-500/35 hover:bg-emerald-500/[0.06]'
                            )}
                            onClick={() => {
                              const clamped = Math.min(sliderMax, Math.max(sliderMin, projected))
                              setAppliedMedian(clamped)
                              setReasonKey(preset.reasonKey)
                              // Suppress the auto-suggest panel once the user
                              // has explicitly picked a scenario chip.
                              setSuggestionDismissed(true)
                            }}
                          >
                            <span
                              className={cn(
                                'flex items-center justify-between w-full text-[11px] font-semibold',
                                isActive ? 'text-primary' : 'text-foreground/85'
                              )}
                            >
                              <span className="truncate">{tPrep(preset.labelI18nKey)}</span>
                              <span
                                className={cn(
                                  'shrink-0 ml-2 text-[10px] font-mono tabular-nums',
                                  preset.band.direction === 'discount'
                                    ? 'text-rose-700 dark:text-rose-400'
                                    : 'text-emerald-700 dark:text-emerald-400'
                                )}
                              >
                                {preset.band.direction === 'discount' ? '−' : '+'}
                                {preset.band.midPct}%
                              </span>
                            </span>
                            <span className="text-[10px] leading-snug text-foreground/55">
                              {tPrep(preset.hintI18nKey)}
                            </span>
                            <span className="text-[10px] font-mono tabular-nums text-foreground/45 mt-0.5">
                              → {projected.toFixed(2)}×
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="grid gap-1">
                  <label
                    className="text-[10px] font-medium text-foreground/45 uppercase"
                    htmlFor="modal-prep-ev-ebitda"
                  >
                    {tPrep('applied')}
                  </label>
                  {prepDeltaNum != null &&
                    Math.abs(prepDeltaNum) >= 0.005 &&
                    benchmarkNum != null &&
                    benchmarkNum > 0 && (
                      <div
                        className={cn(
                          'flex items-center justify-between rounded-md border px-2.5 py-1.5 text-[11px]',
                          prepDeltaNum > 0
                            ? 'border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-700 dark:text-emerald-300'
                            : 'border-rose-500/25 bg-rose-500/[0.06] text-rose-700 dark:text-rose-300'
                        )}
                      >
                        <span className="font-semibold uppercase tracking-wide text-[10px]">
                          {prepDeltaNum > 0
                            ? tPrep('deltaPremiumLabel')
                            : tPrep('deltaDiscountLabel')}
                        </span>
                        <span className="font-mono tabular-nums">
                          {prepDeltaNum > 0 ? '+' : '−'}
                          {Math.abs(prepDeltaNum).toFixed(2)}×
                          <span className="opacity-70 ml-2">
                            ({prepDeltaNum > 0 ? '+' : '−'}
                            {((Math.abs(prepDeltaNum) / benchmarkNum) * 100).toFixed(1)}%)
                          </span>
                        </span>
                      </div>
                    )}
                  <input
                    id="modal-prep-ev-ebitda"
                    type="number"
                    step={0.05}
                    min={sliderMin}
                    max={sliderMax}
                    disabled={effectiveDisabled}
                    value={appliedMedian ?? ''}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v === '') {
                        setAppliedMedian(null)
                        return
                      }
                      const n = parseFloat(v)
                      if (Number.isFinite(n))
                        setAppliedMedian(Math.min(sliderMax, Math.max(sliderMin, n)))
                    }}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono tabular-nums"
                  />
                  <input
                    type="range"
                    aria-label={tPrep('applied')}
                    disabled={effectiveDisabled}
                    min={sliderMin}
                    max={sliderMax}
                    step={0.05}
                    value={
                      appliedMedian != null && Number.isFinite(appliedMedian)
                        ? Math.min(sliderMax, Math.max(sliderMin, appliedMedian))
                        : Math.min(sliderMax, Math.max(sliderMin, bench))
                    }
                    onChange={(e) => {
                      const n = parseFloat(e.target.value)
                      if (Number.isFinite(n)) setAppliedMedian(n)
                    }}
                    className="w-full h-2 mt-1 accent-primary"
                  />
                  {/* Visual peer-set gauge — replaces the plain "min — max"
                    line. Shows where the applied multiple sits relative to
                    p10/p25/p50/p75/p90 of the peer set. Falls back to a
                    note when fewer than two percentiles are available. */}
                  <PercentileBandGauge
                    band={{
                      p10: mv?.p10_ebitda_multiple ?? null,
                      p25: mv?.p25_ebitda_multiple ?? null,
                      p50: mv?.p50_ebitda_multiple ?? benchmarkNum,
                      p75: mv?.p75_ebitda_multiple ?? null,
                      p90: mv?.p90_ebitda_multiple ?? null,
                    }}
                    benchmark={benchmarkNum}
                    applied={appliedNum}
                    domainMin={sliderMin}
                    domainMax={sliderMax}
                    caption={tPrep('gaugeCaption')}
                    labels={{
                      legend: tPrep('gaugeLegend'),
                      benchmark: tPrep('gaugeBenchmarkLabel'),
                      applied: tPrep('gaugeAppliedLabel'),
                      typicalBand: tPrep('gaugeTypicalBandLabel'),
                      outOfBand: tPrep('gaugeOutOfBandLabel'),
                    }}
                    className="mt-2"
                  />
                  <p className="text-[10px] text-foreground/35">{tPrep('sliderHint')}</p>
                </div>

                {/* Always render the live preview when EBITDA + a multiple are
                  known. Delta vs the persisted headline drives colour. */}
                {liveEquityPreview != null && (
                  <div className="rounded-md border border-primary/20 bg-primary/[0.05] px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                        {tBreakdown('previewEquity')}
                      </span>
                      <span className="text-[10px] text-primary/65">
                        {tBreakdown('previewLabel')}
                      </span>
                    </div>
                    <div className="mt-1 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-lg font-mono font-semibold tabular-nums text-primary">
                          {formatCurrency(liveEquityPreview)}
                        </p>
                        <p className="text-[11px] leading-snug text-foreground/55">
                          {tBreakdown('previewBlurb')}
                        </p>
                      </div>
                      {activeMetricValue != null && (
                        <div className="text-right">
                          <p className="text-[10px] uppercase tracking-wide text-foreground/45">
                            {tBreakdown('deltaToHeadline')}
                          </p>
                          <p
                            className={cn(
                              'text-[11px] font-mono tabular-nums',
                              liveEquityPreview - activeMetricValue === 0
                                ? 'text-foreground/55'
                                : liveEquityPreview - activeMetricValue > 0
                                  ? 'text-success'
                                  : 'text-warning'
                            )}
                          >
                            {liveEquityPreview - activeMetricValue === 0
                              ? '±'
                              : liveEquityPreview - activeMetricValue > 0
                                ? '+'
                                : '−'}
                            {formatCurrency(Math.abs(liveEquityPreview - activeMetricValue))}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid gap-1">
                  <label
                    className="text-[10px] font-medium text-foreground/45 uppercase"
                    htmlFor="modal-prep-reason"
                  >
                    {tPrep('reason')}
                  </label>
                  <AuroraSelect
                    size="sm"
                    value={reasonKey}
                    onChange={(v) =>
                      setReasonKey(v as (typeof PREPARER_EBITDA_REASON_KEYS)[number] | '')
                    }
                    disabled={effectiveDisabled}
                    placeholder={tPrep('reasonPlaceholder')}
                    options={PREPARER_EBITDA_REASON_KEYS.map((k) => ({
                      value: k,
                      label: tPrep(`reasons.${k}`),
                    }))}
                    clearable
                  />
                  {/* Typical-band caption for the selected reason. Sourced from
                    SUGGESTED_DELTA_BAND (Pratt / Damodaran / Trugman / Marktlink).
                    Shown only for reasons with an academic anchor — `other`
                    intentionally has no band, so the preparer is forced to
                    justify in the note. */}
                  {selectedReasonBand != null && (
                    <p className="text-[10px] leading-snug text-foreground/50 font-mono tabular-nums">
                      {tPrep('reasonBandTooltip', {
                        direction:
                          selectedReasonBand.direction === 'discount'
                            ? tPrep('signalDirectionDiscount')
                            : tPrep('signalDirectionPremium'),
                        low: selectedReasonBand.lowPct,
                        high: selectedReasonBand.highPct,
                      })}
                    </p>
                  )}
                </div>

                <div className="grid gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      className="text-[10px] font-medium text-foreground/45 uppercase"
                      htmlFor="modal-prep-note"
                    >
                      {tPrep('noteOptional')}
                    </label>
                    <span
                      className={cn(
                        'text-[10px] font-mono tabular-nums',
                        note.length > 450
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-foreground/40'
                      )}
                      aria-live="polite"
                    >
                      {tModal('noteCharCounter', { count: note.length, max: 500 })}
                    </span>
                  </div>
                  <textarea
                    id="modal-prep-note"
                    disabled={effectiveDisabled}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    maxLength={500}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs resize-none"
                  />
                </div>

                {/* Footnote preview — promoted: this is what appears verbatim
                  in the calibration page of the PDF, so the reader needs
                  to see it as primary copy, not muted. */}
                {previewText && (
                  <div className="rounded-lg border border-primary/30 bg-primary/[0.06] px-3.5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-primary/85">
                          {tPrep('previewTitle')}
                        </p>
                        <p className="text-[10px] text-primary/60">{tPrep('previewSubtitle')}</p>
                      </div>
                      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-primary/70 bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-full">
                        {livePreview ? tPrep('previewLive') : tPrep('previewSaved')}
                      </span>
                    </div>
                    <p className="mt-2 text-[12px] leading-relaxed text-foreground/85 italic">
                      {previewText}
                    </p>
                  </div>
                )}

                {showExtreme && (
                  <div className="rounded-md border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2.5 space-y-2">
                    <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 leading-snug">
                      {extremeBoundInfo && appliedNum != null
                        ? tPrep('extremeWarningDetailed', {
                            applied: appliedNum.toFixed(2),
                            direction: extremeBoundInfo.direction,
                            bound: extremeBoundInfo.bound,
                            boundValue: extremeBoundInfo.boundValue,
                            direction_label: extremeBoundInfo.directionLabel,
                          })
                        : tPrep('extremeWarning')}
                    </p>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        disabled={effectiveDisabled}
                        checked={acknowledgedExtreme}
                        onChange={(e) => setAcknowledgedExtreme(e.target.checked)}
                        className="mt-1"
                      />
                      <span className="text-[11px] text-amber-700 dark:text-amber-300/90 leading-snug">
                        {tPrep('extremeWarning')}
                      </span>
                    </label>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  {onRecalculate && (
                    <AuroraButton
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={effectiveDisabled}
                      className="w-full text-xs"
                      onClick={() => {
                        onRecalculate()
                        onClose()
                      }}
                    >
                      {tPrep('recalculate')}
                    </AuroraButton>
                  )}
                  {!showResetConfirm ? (
                    <AuroraButton
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={effectiveDisabled}
                      className="w-full text-xs"
                      onClick={() => setShowResetConfirm(true)}
                    >
                      {tPrep('resetBenchmark')}
                    </AuroraButton>
                  ) : (
                    <div className="rounded-md border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2.5 space-y-2">
                      <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                        {tModal('resetConfirmTitle')}
                      </p>
                      <p className="text-[11px] leading-snug text-amber-700/90 dark:text-amber-300/85">
                        {tModal('resetConfirmBody')}
                      </p>
                      <div className="flex gap-2">
                        <AuroraButton
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={effectiveDisabled}
                          className="flex-1 text-xs"
                          onClick={() => setShowResetConfirm(false)}
                        >
                          {tModal('resetConfirmCancel')}
                        </AuroraButton>
                        <AuroraButton
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={effectiveDisabled}
                          className="flex-1 text-xs"
                          onClick={() => {
                            resetToBenchmark()
                            setShowResetConfirm(false)
                          }}
                        >
                          {tModal('resetConfirmCta')}
                        </AuroraButton>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─── Stake Calculator (frontend-only pro-rata) ─── */}
            {showPreparerMultiple && <StakeCalculatorSection equityValue={activeMetricValue} />}

            {/* ─── Zero Draft Export ─── */}
            {showZeroDraftExport &&
              canExportZeroDraft &&
              zeroDraftReportId &&
              entries.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-foreground/45 leading-snug px-0.5">
                    {t('zeroDraftBlurb')}
                  </p>
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
                        fiscalAnchor:
                          showFiscalAnchorRow && fiscalAnchor != null ? fiscalAnchor : undefined,
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
        </div>
      </ModalContent>
    </Modal>
  )
}
