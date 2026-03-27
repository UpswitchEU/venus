'use client'

import { AuroraButton } from '@/design-system/components/Button'
import { cn } from '@/design-system/utils'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronUp, Sigma } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AdaptivePercentInput } from './AdaptivePercentInput'

interface WaccBreakdownPanelProps {
  currentWaccPct?: number
  riskFreeRatePct?: number
  equityRiskPremiumPct?: number
  beta?: number
  costOfDebtPct?: number
  debtEquityPct?: number
  taxShieldPct?: number
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
}

const DEFAULT_RISK_FREE_RATE_PCT = 3
const DEFAULT_EQUITY_RISK_PREMIUM_PCT = 5.5
const DEFAULT_BETA = 1.1
const DEFAULT_COST_OF_DEBT_PCT = 4.5
const DEFAULT_DEBT_EQUITY_PCT = 30
const DEFAULT_TAX_SHIELD_PCT = 25

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

export function WaccBreakdownPanel({
  currentWaccPct,
  riskFreeRatePct,
  equityRiskPremiumPct,
  beta,
  costOfDebtPct,
  debtEquityPct,
  taxShieldPct,
  onFieldChange,
  disabled,
}: WaccBreakdownPanelProps) {
  const t = useTranslations('manualInput.methodSelector')
  const [expanded, setExpanded] = useState(false)

  const resolvedRiskFreeRatePct = riskFreeRatePct ?? DEFAULT_RISK_FREE_RATE_PCT
  const resolvedEquityRiskPremiumPct = equityRiskPremiumPct ?? DEFAULT_EQUITY_RISK_PREMIUM_PCT
  const resolvedBeta = beta ?? DEFAULT_BETA
  const resolvedCostOfDebtPct = costOfDebtPct ?? DEFAULT_COST_OF_DEBT_PCT
  const resolvedDebtEquityPct = debtEquityPct ?? DEFAULT_DEBT_EQUITY_PCT
  const resolvedTaxShieldPct = taxShieldPct ?? DEFAULT_TAX_SHIELD_PCT

  const computedWaccPct = useMemo(() => {
    const debtWeight = clamp(resolvedDebtEquityPct, 0, 95) / 100
    const equityWeight = 1 - debtWeight
    const costOfEquityPct =
      resolvedRiskFreeRatePct + resolvedBeta * resolvedEquityRiskPremiumPct
    const afterTaxDebtPct = resolvedCostOfDebtPct * (1 - clamp(resolvedTaxShieldPct, 0, 100) / 100)
    return round1(equityWeight * costOfEquityPct + debtWeight * afterTaxDebtPct)
  }, [
    resolvedBeta,
    resolvedCostOfDebtPct,
    resolvedDebtEquityPct,
    resolvedEquityRiskPremiumPct,
    resolvedRiskFreeRatePct,
    resolvedTaxShieldPct,
  ])

  useEffect(() => {
    if (!expanded) return
    onFieldChange('dcf_wacc_pct', computedWaccPct)
  }, [computedWaccPct, expanded, onFieldChange])

  const handleToggleExpanded = () => {
    if (!expanded) {
      if (riskFreeRatePct == null) onFieldChange('dcf_risk_free_rate_pct', DEFAULT_RISK_FREE_RATE_PCT)
      if (equityRiskPremiumPct == null) {
        onFieldChange('dcf_equity_risk_premium_pct', DEFAULT_EQUITY_RISK_PREMIUM_PCT)
      }
      if (beta == null) onFieldChange('dcf_beta', DEFAULT_BETA)
      if (costOfDebtPct == null) onFieldChange('dcf_cost_of_debt_pct', DEFAULT_COST_OF_DEBT_PCT)
      if (debtEquityPct == null) onFieldChange('dcf_debt_equity_pct', DEFAULT_DEBT_EQUITY_PCT)
      if (taxShieldPct == null) onFieldChange('dcf_tax_shield_pct', DEFAULT_TAX_SHIELD_PCT)
    }
    setExpanded((value) => !value)
  }

  return (
    <div className="space-y-3 rounded-xl border border-primary/15 bg-primary/[0.03] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Sigma className="h-4 w-4 text-primary" />
            <span>{t('fields.dcfWaccPct')}</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {expanded ? t('waccBreakdown.expandedDescription') : t('waccBreakdown.collapsedDescription')}
          </p>
        </div>
        <AuroraButton
          type="button"
          size="sm"
          variant="outline"
          className="min-h-[36px] shrink-0 gap-2"
          onClick={handleToggleExpanded}
          disabled={disabled}
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? t('waccBreakdown.collapse') : t('waccBreakdown.expand')}
        </AuroraButton>
      </div>

      <AdaptivePercentInput
        label={t('fields.dcfWaccPct')}
        value={expanded ? computedWaccPct : currentWaccPct}
        onChange={(value) => onFieldChange('dcf_wacc_pct', value)}
        placeholder="10"
        disabled={disabled}
        readOnly={expanded}
        description={expanded ? t('waccBreakdown.computedHint') : t('waccBreakdown.aggregateHint')}
      />

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <AdaptivePercentInput
                label={t('fields.dcfRiskFreeRatePct')}
                value={riskFreeRatePct}
                onChange={(value) => onFieldChange('dcf_risk_free_rate_pct', value)}
                placeholder={String(DEFAULT_RISK_FREE_RATE_PCT)}
                disabled={disabled}
                description={t('waccBreakdown.riskFreeDescription')}
              />
              <AdaptivePercentInput
                label={t('fields.dcfEquityRiskPremiumPct')}
                value={equityRiskPremiumPct}
                onChange={(value) => onFieldChange('dcf_equity_risk_premium_pct', value)}
                placeholder={String(DEFAULT_EQUITY_RISK_PREMIUM_PCT)}
                disabled={disabled}
                description={t('waccBreakdown.equityRiskPremiumDescription')}
              />
              <AdaptivePercentInput
                label={t('fields.dcfBeta')}
                value={beta}
                onChange={(value) => onFieldChange('dcf_beta', value)}
                placeholder={String(DEFAULT_BETA)}
                disabled={disabled}
                description={t('waccBreakdown.betaDescription')}
                step="0.1"
              />
              <AdaptivePercentInput
                label={t('fields.dcfCostOfDebtPct')}
                value={costOfDebtPct}
                onChange={(value) => onFieldChange('dcf_cost_of_debt_pct', value)}
                placeholder={String(DEFAULT_COST_OF_DEBT_PCT)}
                disabled={disabled}
                description={t('waccBreakdown.costOfDebtDescription')}
              />
              <AdaptivePercentInput
                label={t('fields.dcfDebtEquityPct')}
                value={debtEquityPct}
                onChange={(value) => onFieldChange('dcf_debt_equity_pct', value)}
                placeholder={String(DEFAULT_DEBT_EQUITY_PCT)}
                disabled={disabled}
                description={t('waccBreakdown.debtEquityDescription')}
              />
              <AdaptivePercentInput
                label={t('fields.dcfTaxShieldPct')}
                value={taxShieldPct}
                onChange={(value) => onFieldChange('dcf_tax_shield_pct', value)}
                placeholder={String(DEFAULT_TAX_SHIELD_PCT)}
                disabled={disabled}
                description={t('waccBreakdown.taxShieldDescription')}
              />
            </div>

            <div className={cn('mt-3 rounded-lg border border-primary/10 bg-background/70 px-3 py-2')}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-primary/75">
                {t('waccBreakdown.formulaLabel')}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{t('waccBreakdown.formulaBody')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
