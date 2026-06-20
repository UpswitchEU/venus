'use client'

import { AlertTriangle, Calculator, Percent, Scale, TrendingUp } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { cn } from '@/design-system/utils'
import type { ValuationMethodResult, ValuationResponse } from '../../types/valuation'
import { DcfSensitivityMatrix } from './sections/DcfSensitivityMatrix'
import {
  buildMethodBreakdownModel,
  buildMultipleFormulaModel,
  getDcfReadinessMissingFieldKeys,
  getFormulaTranslationKey,
  normalizeComparablesQualityKey,
} from './ValuationEditModalBreakdownModel'
import { formatCurrency, formatMultiple, formatPercent } from './ValuationEditModalFormatting'

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

interface MethodBreakdownSectionProps {
  methodKey: string
  method: ValuationMethodResult | null
  result: ValuationResponse | null
  fiscalAnchor?: number | null
  benchmarkMultiple: number | null
  appliedMultiple: number | null
  previewEquity: number | null
}

export function MethodBreakdownSection({
  methodKey,
  method,
  result,
  fiscalAnchor,
  benchmarkMultiple,
  appliedMultiple,
  previewEquity,
}: MethodBreakdownSectionProps) {
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

  const model = buildMethodBreakdownModel({ methodKey, method, result, appliedMultiple })
  const {
    usesRevenueMetric,
    normalizedEbitda,
    revenueValue,
    arrValue,
    netDebt,
    balanceSheetAdjustments,
    enterpriseValue,
    equityValue,
    wacc,
    terminalValue,
    terminalValueMethodology,
    terminalExitMultiple,
    dcfReadiness,
    operatingDcfEnterpriseValue,
    operatingDcfEquityValue,
    apvTaxShieldValue,
    apvEnterpriseValue,
    apvEquityValue,
    apvDiscountRate,
    apvDiscountingConvention,
    apvBenchmarkStatus,
    apvBenchmarkName,
    hasApvBridge,
    sensitivityMatrix,
    ownerSalaryEstimate,
    sdeValue,
    bookEquity,
    methodologyJustification,
    saasRuleOf40,
    saasNrr,
    comparablesCount,
    comparablesQuality,
    fallbackPipelineRows,
    effectiveAppliedMultiple,
  } = model
  const missingReadinessFields = getDcfReadinessMissingFieldKeys(dcfReadiness).map((field) =>
    tFcfReadiness(`fields.${field}`)
  )
  const multipleFormula = buildMultipleFormulaModel(methodKey, model)

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
          {hasApvBridge && (
            <div className="rounded-lg border border-primary/15 bg-background/70 px-3 py-3 space-y-3">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-primary/75">
                <Calculator className="w-3.5 h-3.5" />
                {tBreakdown('apvBridge')}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {operatingDcfEnterpriseValue != null && (
                  <BreakdownMetricCard
                    label={tBreakdown('operatingDcfEnterpriseValue')}
                    value={formatCurrency(operatingDcfEnterpriseValue)}
                    muted
                  />
                )}
                <BreakdownMetricCard
                  label={tBreakdown('apvTaxShield')}
                  value={formatCurrency(apvTaxShieldValue ?? 0)}
                />
                {apvEnterpriseValue != null && (
                  <BreakdownMetricCard
                    label={tBreakdown('apvEnterpriseValue')}
                    value={formatCurrency(apvEnterpriseValue)}
                    accent
                  />
                )}
                {apvEquityValue != null && (
                  <BreakdownMetricCard
                    label={tBreakdown('apvEquityValue')}
                    value={formatCurrency(apvEquityValue)}
                    accent
                  />
                )}
                {operatingDcfEquityValue != null && (
                  <BreakdownMetricCard
                    label={tBreakdown('operatingDcfEquityValue')}
                    value={formatCurrency(operatingDcfEquityValue)}
                    muted
                  />
                )}
                {apvDiscountRate != null && (
                  <BreakdownMetricCard
                    label={tBreakdown('apvDiscountRate')}
                    value={formatPercent(apvDiscountRate, 100) || '—'}
                    muted
                  />
                )}
              </div>
              {apvDiscountingConvention && (
                <p className="text-[11px] leading-snug text-foreground/55">
                  {apvDiscountingConvention === 'year_end'
                    ? tBreakdown('yearEndDiscounting')
                    : tBreakdown('midYearDiscounting')}
                </p>
              )}
              {apvBenchmarkStatus === 'matched' && (
                <p className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.06] px-2.5 py-2 text-[11px] leading-snug text-emerald-800 dark:text-emerald-200/90">
                  {tBreakdown('apvBenchmarkMatched', { benchmark: apvBenchmarkName })}
                </p>
              )}
            </div>
          )}
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
          <div className="grid gap-2 sm:grid-cols-2">
            {usesRevenueMetric ? (
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
          {tBreakdown(getFormulaTranslationKey(methodKey, hasApvBridge))}
        </p>
        {multipleFormula && (
          <p className="text-[11px] font-mono tabular-nums text-foreground/70 leading-relaxed pt-1 border-t border-border/40 break-words">
            {formatCurrency(multipleFormula.metric)} <span className="text-foreground/40">×</span>{' '}
            {multipleFormula.multiple.toFixed(2)}× <span className="text-foreground/40">=</span>{' '}
            <span className="text-foreground/85">
              {formatCurrency(multipleFormula.enterpriseValue)}
            </span>
            {multipleFormula.netDebt != null && multipleFormula.netDebt !== 0 && (
              <>
                {' '}
                <span className="text-foreground/40">
                  {multipleFormula.netDebt > 0 ? '−' : '+'}
                </span>{' '}
                {formatCurrency(Math.abs(multipleFormula.netDebt))}
              </>
            )}
            {multipleFormula.balanceSheetAdjustments != null &&
              multipleFormula.balanceSheetAdjustments !== 0 && (
                <>
                  {' '}
                  <span className="text-foreground/40">
                    {multipleFormula.balanceSheetAdjustments > 0 ? '+' : '−'}
                  </span>{' '}
                  {formatCurrency(Math.abs(multipleFormula.balanceSheetAdjustments))}
                </>
              )}{' '}
            <span className="text-foreground/40">→</span>{' '}
            <span className="text-primary font-semibold">
              {formatCurrency(multipleFormula.equity)}
            </span>
          </p>
        )}
      </div>
    </div>
  )
}

export function StakeCalculatorSection({ equityValue }: { equityValue: number | null }) {
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
          onChange={(event) => {
            const value = parseFloat(event.target.value)
            if (Number.isFinite(value)) setStakePercent(Math.min(100, Math.max(1, value)))
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
          onChange={(event) => setStakePercent(parseFloat(event.target.value))}
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
