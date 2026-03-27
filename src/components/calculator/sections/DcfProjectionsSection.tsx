'use client'

import { AuroraButton } from '@/design-system/components/Button'
import { cn } from '@/design-system/utils'
import { AlertTriangle, Sparkles, TrendingUp } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { AdaptivePercentInput } from './AdaptivePercentInput'
import type { DcfReadinessInsight } from './dcfReadiness'
import type { DcfRiskInsight } from './dcfRiskInsight'
import type { DcfSmartDefaults } from './dcfSmartDefaults'
import { WaccBreakdownPanel } from './WaccBreakdownPanel'

interface DcfProjectionsSectionProps {
  dcfRevenueGrowthPct?: number
  dcfEbitdaMarginPct?: number
  dcfCapexPct?: number
  dcfNwcPct?: number
  dcfWaccPct?: number
  dcfTerminalGrowthPct?: number
  dcfExitMultiple?: number
  dcfRiskFreeRatePct?: number
  dcfEquityRiskPremiumPct?: number
  dcfBeta?: number
  dcfCostOfDebtPct?: number
  dcfDebtEquityPct?: number
  dcfTaxShieldPct?: number
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
  smartDefaults?: DcfSmartDefaults | null
  projectionPreview?: Array<{ year: number; revenue: number; ebitda: number }>
  readinessInsight?: DcfReadinessInsight | null
  riskInsight?: DcfRiskInsight | null
}

export function DcfProjectionsSection({
  dcfRevenueGrowthPct,
  dcfEbitdaMarginPct,
  dcfCapexPct,
  dcfNwcPct,
  dcfWaccPct,
  dcfTerminalGrowthPct,
  dcfExitMultiple,
  dcfRiskFreeRatePct,
  dcfEquityRiskPremiumPct,
  dcfBeta,
  dcfCostOfDebtPct,
  dcfDebtEquityPct,
  dcfTaxShieldPct,
  onFieldChange,
  disabled,
  smartDefaults,
  projectionPreview = [],
  readinessInsight,
  riskInsight,
}: DcfProjectionsSectionProps) {
  const t = useTranslations('manualInput.methodSelector')
  const locale = useLocale()

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat(locale === 'en' ? 'en-BE' : 'nl-BE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)

  const handleApplySmartDefaults = () => {
    if (!smartDefaults) return
    onFieldChange('dcf_revenue_growth_pct', smartDefaults.revenueGrowthPct)
    onFieldChange('dcf_ebitda_margin_pct', smartDefaults.ebitdaMarginPct)
    onFieldChange('dcf_capex_pct', smartDefaults.capexPct)
    onFieldChange('dcf_wacc_pct', smartDefaults.waccPct)
    onFieldChange('dcf_terminal_growth_pct', smartDefaults.terminalGrowthPct)
    onFieldChange('dcf_exit_multiple', smartDefaults.exitMultiple)
  }

  const handleApplyRiskAdjustment = () => {
    if (!riskInsight?.suggestedWaccPct) return
    onFieldChange('dcf_wacc_pct', riskInsight.suggestedWaccPct)
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="space-y-4 pt-2"
    >
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
          <TrendingUp className="w-3 h-3 text-primary" />
        </div>
        <h3 className="text-sm font-medium text-foreground">
          {t('sections.dcfProjections')}
        </h3>
        <span className="text-[10px] font-medium text-primary/70 bg-primary/8 px-1.5 py-0.5 rounded-full">
          {t('recommendedForMethod', { method: 'DCF' })}
        </span>
      </div>

      {smartDefaults && (
        <div className="rounded-xl border border-primary/15 bg-primary/[0.04] p-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Sparkles className="w-4 h-4 text-primary" />
                {t('smartDefaults.title')}
              </div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {t('smartDefaults.description', { count: smartDefaults.historicalYearsUsed })}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  {
                    key: 'growth',
                    label: t('fields.dcfRevenueGrowthPct'),
                    value: smartDefaults.revenueGrowthPct,
                  },
                  {
                    key: 'margin',
                    label: t('fields.dcfEbitdaMarginPct'),
                    value: smartDefaults.ebitdaMarginPct,
                  },
                  {
                    key: 'capex',
                    label: t('fields.dcfCapexPct'),
                    value: smartDefaults.capexPct,
                  },
                  {
                    key: 'wacc',
                    label: t('fields.dcfWaccPct'),
                    value: smartDefaults.waccPct,
                  },
                  {
                    key: 'terminal',
                    label: t('fields.dcfTerminalGrowthPct'),
                    value: smartDefaults.terminalGrowthPct,
                  },
                  {
                    key: 'exitMultiple',
                    label: t('fields.dcfExitMultiple'),
                    value: smartDefaults.exitMultiple,
                    suffix: 'x',
                  },
                ].map((item) => (
                  <div
                    key={item.key}
                    className={cn(
                      'rounded-full border border-primary/10 bg-background/80 px-2.5 py-1 text-[11px] text-foreground/75'
                    )}
                  >
                    <span className="text-foreground/50">{item.label}:</span>{' '}
                    <span className="font-medium text-foreground">
                      {item.value}
                      {'suffix' in item ? item.suffix : '%'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <AuroraButton
              type="button"
              variant="outline"
              size="sm"
              className="min-h-[40px] gap-2 shrink-0"
              onClick={handleApplySmartDefaults}
              disabled={disabled}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {t('smartDefaults.apply')}
            </AuroraButton>
          </div>
        </div>
      )}

      {readinessInsight && (
        <div
          className={cn(
            'rounded-xl border p-3',
            readinessInsight.status === 'imported_ready'
              ? 'border-emerald-500/20 bg-emerald-500/[0.05]'
              : readinessInsight.status === 'partial'
                ? 'border-amber-500/20 bg-amber-500/[0.05]'
                : 'border-foreground/10 bg-background/60'
          )}
        >
          <div className="flex items-start gap-2">
            <TrendingUp
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0',
                readinessInsight.status === 'imported_ready'
                  ? 'text-emerald-500'
                  : readinessInsight.status === 'partial'
                    ? 'text-amber-500'
                    : 'text-foreground/50'
              )}
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {t(`fcfReadiness.${readinessInsight.status}.title`)}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {t(`fcfReadiness.${readinessInsight.status}.description`, {
                  years: readinessInsight.actualYearsCount,
                  capex: readinessInsight.actualCapexYears,
                  taxes: readinessInsight.actualTaxYears,
                  workingCapital:
                    readinessInsight.actualWorkingCapitalYears +
                    readinessInsight.derivedWorkingCapitalYears,
                })}
              </p>
              {readinessInsight.missingSignals.length > 0 && (
                <p className="mt-2 text-xs text-foreground/75">
                  {t('fcfReadiness.missing', {
                    fields: readinessInsight.missingSignals
                      .map((signal) => t(`fcfReadiness.fields.${signal}`))
                      .join(', '),
                  })}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {riskInsight && (
        <div
          className={cn(
            'rounded-xl border p-3',
            riskInsight.severity === 'critical'
              ? 'border-red-500/20 bg-red-500/[0.04]'
              : 'border-amber-500/20 bg-amber-500/[0.05]'
          )}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <AlertTriangle
                  className={cn(
                    'w-4 h-4',
                    riskInsight.severity === 'critical' ? 'text-red-500' : 'text-amber-500'
                  )}
                />
                {t(
                  riskInsight.severity === 'critical'
                    ? 'riskInsight.criticalTitle'
                    : 'riskInsight.highTitle'
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {t('riskInsight.description', {
                  ratio: riskInsight.ownerRatioPct,
                  uplift: riskInsight.waccUpliftPct,
                })}
              </p>
              {riskInsight.suggestedWaccPct != null && (
                <p className="mt-2 text-xs text-foreground/75">
                  {t('riskInsight.suggestedWacc', {
                    value: riskInsight.suggestedWaccPct,
                  })}
                </p>
              )}
            </div>
            {riskInsight.suggestedWaccPct != null && (
              <AuroraButton
                type="button"
                variant="outline"
                size="sm"
                className="min-h-[40px] gap-2 shrink-0"
                onClick={handleApplyRiskAdjustment}
                disabled={disabled}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                {t('riskInsight.apply')}
              </AuroraButton>
            )}
          </div>
        </div>
      )}

      {projectionPreview.length > 0 && (
        <div className="rounded-xl border border-foreground/10 bg-background/70 p-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <p className="text-sm font-medium text-foreground">
              {t('projectionPreview.title')}
            </p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            {t('projectionPreview.description')}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {projectionPreview.map((row) => (
              <div
                key={row.year}
                className="rounded-lg border border-foreground/8 bg-foreground/[0.02] px-3 py-2"
              >
                <p className="text-xs font-semibold text-foreground">{row.year}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {t('projectionPreview.revenue')}
                </p>
                <p className="text-sm font-medium text-foreground">{formatCurrency(row.revenue)}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {t('projectionPreview.ebitda')}
                </p>
                <p className="text-sm font-medium text-foreground">{formatCurrency(row.ebitda)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <AdaptivePercentInput
          label={t('fields.dcfRevenueGrowthPct')}
          value={dcfRevenueGrowthPct}
          onChange={(v) => onFieldChange('dcf_revenue_growth_pct', v)}
          placeholder="5"
          disabled={disabled}
        />
        <AdaptivePercentInput
          label={t('fields.dcfEbitdaMarginPct')}
          value={dcfEbitdaMarginPct}
          onChange={(v) => onFieldChange('dcf_ebitda_margin_pct', v)}
          placeholder="15"
          disabled={disabled}
        />
        <AdaptivePercentInput
          label={t('fields.dcfCapexPct')}
          value={dcfCapexPct}
          onChange={(v) => onFieldChange('dcf_capex_pct', v)}
          placeholder="3"
          disabled={disabled}
        />
        <AdaptivePercentInput
          label={t('fields.dcfNwcPct')}
          value={dcfNwcPct}
          onChange={(v) => onFieldChange('dcf_nwc_pct', v)}
          placeholder="2"
          disabled={disabled}
        />
        <WaccBreakdownPanel
          currentWaccPct={dcfWaccPct}
          riskFreeRatePct={dcfRiskFreeRatePct}
          equityRiskPremiumPct={dcfEquityRiskPremiumPct}
          beta={dcfBeta}
          costOfDebtPct={dcfCostOfDebtPct}
          debtEquityPct={dcfDebtEquityPct}
          taxShieldPct={dcfTaxShieldPct}
          onFieldChange={onFieldChange}
          disabled={disabled}
        />
        <AdaptivePercentInput
          label={t('fields.dcfTerminalGrowthPct')}
          value={dcfTerminalGrowthPct}
          onChange={(v) => onFieldChange('dcf_terminal_growth_pct', v)}
          placeholder="2"
          disabled={disabled}
        />
        <AdaptivePercentInput
          label={t('fields.dcfExitMultiple')}
          value={dcfExitMultiple}
          onChange={(v) => onFieldChange('dcf_exit_multiple', v)}
          placeholder="6.0"
          disabled={disabled}
          description={t('fields.dcfExitMultipleDescription')}
          step="0.1"
        />
      </div>
    </motion.section>
  )
}
