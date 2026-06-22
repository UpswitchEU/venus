'use client'

import { Calculator, Scale, TrendingUp } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { DcfSensitivityMatrix } from './sections/DcfSensitivityMatrix'
import { BreakdownMetricCard, StableMetricCard } from './ValuationEditModalBreakdownCards'
import {
  buildMultipleFormulaModel,
  getDcfReadinessMissingFieldKeys,
  getFormulaTranslationKey,
  type MethodBreakdownModel,
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

interface MethodBreakdownDetailsProps {
  methodKey: string
  model: MethodBreakdownModel
  fiscalAnchor?: number | null
  benchmarkMultiple: number | null
  previewEquity: number | null
}

export function MethodBreakdownDetails({
  methodKey,
  model,
  fiscalAnchor,
  benchmarkMultiple,
  previewEquity,
}: MethodBreakdownDetailsProps) {
  const tBreakdown = useTranslations('methodBreakdown')
  const tFcfReadiness = useTranslations('calculator.fcfReadiness')
  const missingReadinessFields = getDcfReadinessMissingFieldKeys(model.dcfReadiness).map((field) =>
    tFcfReadiness(`fields.${field}`)
  )
  const multipleFormula = buildMultipleFormulaModel(methodKey, model)

  return (
    <>
      <MethodSpecificBreakdown
        benchmarkMultiple={benchmarkMultiple}
        fiscalAnchor={fiscalAnchor}
        methodKey={methodKey}
        missingReadinessFields={missingReadinessFields}
        model={model}
        previewEquity={previewEquity}
      />

      <div className="rounded-lg border border-dashed border-border/60 bg-background/60 px-3 py-2.5 space-y-1.5">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-foreground/55">
          <Scale className="w-3.5 h-3.5" />
          {tBreakdown('formulaHeading')}
        </div>
        <p className="text-[11px] leading-snug text-foreground/55">
          {tBreakdown(getFormulaTranslationKey(methodKey, model.hasApvBridge))}
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
    </>
  )
}

function MethodSpecificBreakdown({
  methodKey,
  model,
  fiscalAnchor,
  benchmarkMultiple,
  previewEquity,
  missingReadinessFields,
}: MethodBreakdownDetailsProps & { missingReadinessFields: string[] }) {
  if (methodKey === 'dcf') {
    return <DcfBreakdown model={model} missingReadinessFields={missingReadinessFields} />
  }

  if (methodKey === 'sde_multiple') {
    return <SdeBreakdown model={model} />
  }

  if (methodKey === 'fiscal_4x') {
    return <FiscalBreakdown fiscalAnchor={fiscalAnchor} model={model} />
  }

  if (methodKey === 'adjusted_nav') {
    return <AdjustedNavBreakdown model={model} />
  }

  if (methodKey === 'arr_multiple') {
    return <ArrBreakdown model={model} />
  }

  return (
    <GenericMultipleBreakdown
      benchmarkMultiple={benchmarkMultiple}
      model={model}
      previewEquity={previewEquity}
    />
  )
}

function DcfBreakdown({
  model,
  missingReadinessFields,
}: {
  model: MethodBreakdownModel
  missingReadinessFields: string[]
}) {
  const tBreakdown = useTranslations('methodBreakdown')
  const tFcfReadiness = useTranslations('calculator.fcfReadiness')

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {model.wacc != null && (
          <BreakdownMetricCard
            label={tBreakdown('wacc')}
            value={formatPercent(model.wacc, 100) || '—'}
          />
        )}
        {model.terminalValue != null && (
          <BreakdownMetricCard
            label={tBreakdown('terminalValue')}
            value={formatCurrency(model.terminalValue)}
          />
        )}
        {model.terminalValueMethodology === 'exit_multiple' &&
          model.terminalExitMultiple != null && (
            <BreakdownMetricCard
              label={tBreakdown('exitMultiple')}
              value={formatMultiple(model.terminalExitMultiple) || '—'}
            />
          )}
        {model.enterpriseValue != null && (
          <BreakdownMetricCard
            label={tBreakdown('enterpriseValue')}
            value={formatCurrency(model.enterpriseValue)}
          />
        )}
        {model.equityValue != null && (
          <BreakdownMetricCard
            label={tBreakdown('equityValue')}
            value={formatCurrency(model.equityValue)}
            accent
          />
        )}
      </div>
      {model.hasApvBridge && <DcfApvBridge model={model} />}
      {model.dcfReadiness && (
        <div className="rounded-lg border border-primary/15 bg-background/70 px-3 py-3 space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-primary/75">
            <Calculator className="w-3.5 h-3.5" />
            {tBreakdown('historicalFcfReadiness')}
          </div>
          <p className="text-[11px] font-medium leading-snug text-foreground/80">
            {tFcfReadiness(`${model.dcfReadiness.status}.title`)}
          </p>
          <p className="text-[11px] leading-snug text-foreground/55">
            {tFcfReadiness(`${model.dcfReadiness.status}.description`, {
              years: model.dcfReadiness.historical_years_count,
              capex: model.dcfReadiness.actual_capex_years,
              taxes: model.dcfReadiness.actual_tax_years,
              workingCapital: model.dcfReadiness.actual_nwc_years,
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
      <DcfSensitivityMatrix sensitivityData={model.sensitivityMatrix} />
    </div>
  )
}

function DcfApvBridge({ model }: { model: MethodBreakdownModel }) {
  const tBreakdown = useTranslations('methodBreakdown')

  return (
    <div className="rounded-lg border border-primary/15 bg-background/70 px-3 py-3 space-y-3">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-primary/75">
        <Calculator className="w-3.5 h-3.5" />
        {tBreakdown('apvBridge')}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {model.operatingDcfEnterpriseValue != null && (
          <BreakdownMetricCard
            label={tBreakdown('operatingDcfEnterpriseValue')}
            value={formatCurrency(model.operatingDcfEnterpriseValue)}
            muted
          />
        )}
        <BreakdownMetricCard
          label={tBreakdown('apvTaxShield')}
          value={formatCurrency(model.apvTaxShieldValue ?? 0)}
        />
        {model.apvEnterpriseValue != null && (
          <BreakdownMetricCard
            label={tBreakdown('apvEnterpriseValue')}
            value={formatCurrency(model.apvEnterpriseValue)}
            accent
          />
        )}
        {model.apvEquityValue != null && (
          <BreakdownMetricCard
            label={tBreakdown('apvEquityValue')}
            value={formatCurrency(model.apvEquityValue)}
            accent
          />
        )}
        {model.operatingDcfEquityValue != null && (
          <BreakdownMetricCard
            label={tBreakdown('operatingDcfEquityValue')}
            value={formatCurrency(model.operatingDcfEquityValue)}
            muted
          />
        )}
        {model.apvDiscountRate != null && (
          <BreakdownMetricCard
            label={tBreakdown('apvDiscountRate')}
            value={formatPercent(model.apvDiscountRate, 100) || '—'}
            muted
          />
        )}
      </div>
      {model.apvDiscountingConvention && (
        <p className="text-[11px] leading-snug text-foreground/55">
          {model.apvDiscountingConvention === 'year_end'
            ? tBreakdown('yearEndDiscounting')
            : tBreakdown('midYearDiscounting')}
        </p>
      )}
      {model.apvBenchmarkStatus === 'matched' && (
        <p className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.06] px-2.5 py-2 text-[11px] leading-snug text-emerald-800 dark:text-emerald-200/90">
          {tBreakdown('apvBenchmarkMatched', { benchmark: model.apvBenchmarkName })}
        </p>
      )}
    </div>
  )
}

function SdeBreakdown({ model }: { model: MethodBreakdownModel }) {
  const tBreakdown = useTranslations('methodBreakdown')

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {model.ownerSalaryEstimate != null && (
        <BreakdownMetricCard
          label={tBreakdown('ownerSalaryEstimate')}
          value={formatCurrency(model.ownerSalaryEstimate)}
        />
      )}
      {model.sdeValue != null && (
        <BreakdownMetricCard
          label={tBreakdown('estimatedSde')}
          value={formatCurrency(model.sdeValue)}
        />
      )}
      {model.effectiveAppliedMultiple != null && (
        <BreakdownMetricCard
          label={tBreakdown('appliedMultiple')}
          value={formatMultiple(model.effectiveAppliedMultiple) || '—'}
        />
      )}
      {model.enterpriseValue != null && (
        <BreakdownMetricCard
          label={tBreakdown('enterpriseValue')}
          value={formatCurrency(model.enterpriseValue)}
        />
      )}
      {model.netDebt != null && (
        <BreakdownMetricCard label={tBreakdown('netDebt')} value={formatCurrency(model.netDebt)} />
      )}
      {model.equityValue != null && (
        <BreakdownMetricCard
          label={tBreakdown('equityValue')}
          value={formatCurrency(model.equityValue)}
          accent
        />
      )}
    </div>
  )
}

function FiscalBreakdown({
  model,
  fiscalAnchor,
}: {
  model: MethodBreakdownModel
  fiscalAnchor?: number | null
}) {
  const tBreakdown = useTranslations('methodBreakdown')

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {model.bookEquity != null && (
        <BreakdownMetricCard
          label={tBreakdown('bookEquity')}
          value={formatCurrency(model.bookEquity)}
        />
      )}
      {model.normalizedEbitda != null && (
        <BreakdownMetricCard
          label={tBreakdown('normalizedEbitda')}
          value={formatCurrency(model.normalizedEbitda)}
        />
      )}
      <BreakdownMetricCard label={tBreakdown('fixedMultiple')} value="4.00x" />
      {fiscalAnchor != null && (
        <BreakdownMetricCard
          label={tBreakdown('fiscalAnchor')}
          value={formatCurrency(fiscalAnchor)}
        />
      )}
      {model.equityValue != null && (
        <BreakdownMetricCard
          label={tBreakdown('equityValue')}
          value={formatCurrency(model.equityValue)}
          accent
        />
      )}
    </div>
  )
}

function AdjustedNavBreakdown({ model }: { model: MethodBreakdownModel }) {
  const tBreakdown = useTranslations('methodBreakdown')

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {model.enterpriseValue != null && (
        <BreakdownMetricCard
          label={tBreakdown('adjustedNav')}
          value={formatCurrency(model.enterpriseValue)}
        />
      )}
      {model.netDebt != null && (
        <BreakdownMetricCard label={tBreakdown('netDebt')} value={formatCurrency(model.netDebt)} />
      )}
      {model.equityValue != null && (
        <BreakdownMetricCard
          label={tBreakdown('equityValue')}
          value={formatCurrency(model.equityValue)}
          accent
        />
      )}
    </div>
  )
}

function ArrBreakdown({ model }: { model: MethodBreakdownModel }) {
  const tBreakdown = useTranslations('methodBreakdown')

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {model.arrValue != null && (
        <BreakdownMetricCard label={tBreakdown('arr')} value={formatCurrency(model.arrValue)} />
      )}
      {model.effectiveAppliedMultiple != null && (
        <BreakdownMetricCard
          label={tBreakdown('appliedMultiple')}
          value={formatMultiple(model.effectiveAppliedMultiple) || '—'}
        />
      )}
      {model.saasRuleOf40 != null && (
        <BreakdownMetricCard
          label={tBreakdown('ruleOf40')}
          value={formatPercent(model.saasRuleOf40, 1) || '—'}
        />
      )}
      {model.saasNrr != null && (
        <BreakdownMetricCard
          label={tBreakdown('netRevenueRetention')}
          value={formatPercent(model.saasNrr, 1) || '—'}
        />
      )}
      {model.enterpriseValue != null && (
        <BreakdownMetricCard
          label={tBreakdown('enterpriseValue')}
          value={formatCurrency(model.enterpriseValue)}
        />
      )}
      {model.netDebt != null && (
        <BreakdownMetricCard label={tBreakdown('netDebt')} value={formatCurrency(model.netDebt)} />
      )}
      {model.equityValue != null && (
        <BreakdownMetricCard
          label={tBreakdown('equityValue')}
          value={formatCurrency(model.equityValue)}
          accent
        />
      )}
    </div>
  )
}

function GenericMultipleBreakdown({
  model,
  benchmarkMultiple,
  previewEquity,
}: {
  model: MethodBreakdownModel
  benchmarkMultiple: number | null
  previewEquity: number | null
}) {
  const tBreakdown = useTranslations('methodBreakdown')

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2">
        {model.usesRevenueMetric ? (
          <StableMetricCard
            label={tBreakdown('revenue')}
            value={model.revenueValue}
            formatter={formatCurrency}
          />
        ) : (
          <StableMetricCard
            label={tBreakdown('normalizedEbitda')}
            value={model.normalizedEbitda}
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
          value={model.effectiveAppliedMultiple}
          formatter={(n) => formatMultiple(n) ?? '—'}
        />
        <StableMetricCard
          label={tBreakdown('enterpriseValue')}
          value={model.enterpriseValue}
          formatter={formatCurrency}
        />
        <StableMetricCard
          label={tBreakdown('netDebt')}
          value={model.netDebt}
          formatter={formatCurrency}
        />
        <StableMetricCard
          label={tBreakdown('balanceSheetAdjustments')}
          value={
            model.balanceSheetAdjustments != null && model.balanceSheetAdjustments !== 0
              ? model.balanceSheetAdjustments
              : null
          }
          formatter={formatCurrency}
        />
        <StableMetricCard
          label={tBreakdown('equityValue')}
          value={model.equityValue}
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

      {(model.comparablesCount != null ||
        model.comparablesQuality ||
        model.fallbackPipelineRows.length > 0) && (
        <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-3 space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-foreground/55">
            <TrendingUp className="w-3.5 h-3.5" />
            {tBreakdown('multiplePipeline')}
          </div>
          {(model.comparablesCount != null || model.comparablesQuality) && (
            <div className="grid gap-2 sm:grid-cols-2">
              {model.comparablesCount != null && (
                <BreakdownMetricCard
                  label={tBreakdown('comparablesCount')}
                  value={String(Math.round(model.comparablesCount))}
                />
              )}
              {model.comparablesQuality && (
                <BreakdownMetricCard
                  label={tBreakdown('comparablesQuality')}
                  value={getComparablesQualityLabel(tBreakdown, String(model.comparablesQuality))}
                />
              )}
            </div>
          )}
          {model.fallbackPipelineRows.length > 0 && (
            <div className="space-y-2">
              {model.fallbackPipelineRows.map((row, index) => (
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
  )
}
