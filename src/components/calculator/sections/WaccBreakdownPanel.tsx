'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/design-system/utils'
import { AdaptivePercentInput } from './AdaptivePercentInput'
import { DCF_DEFAULT_WACC_PCT } from './dcfEngineDefaults'

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
    const costOfEquityPct = resolvedRiskFreeRatePct + resolvedBeta * resolvedEquityRiskPremiumPct
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
      if (riskFreeRatePct == null)
        onFieldChange('dcf_risk_free_rate_pct', DEFAULT_RISK_FREE_RATE_PCT)
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
    <div className="w-full min-w-0">
      <AdaptivePercentInput
        label={t('fields.dcfWaccPct')}
        value={expanded ? computedWaccPct : currentWaccPct}
        onChange={(value) => onFieldChange('dcf_wacc_pct', value)}
        placeholder={String(DCF_DEFAULT_WACC_PCT)}
        disabled={disabled}
        readOnly={expanded}
        truncateLabel={false}
      />
      <button
        type="button"
        onClick={handleToggleExpanded}
        disabled={disabled}
        className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
        {expanded ? t('waccBreakdown.collapse') : t('waccBreakdown.expand')}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="mt-3 grid grid-cols-1 gap-3">
              <AdaptivePercentInput
                label={t('fields.dcfRiskFreeRatePct')}
                value={riskFreeRatePct}
                onChange={(value) => onFieldChange('dcf_risk_free_rate_pct', value)}
                placeholder={String(DEFAULT_RISK_FREE_RATE_PCT)}
                disabled={disabled}
                truncateLabel={false}
              />
              <AdaptivePercentInput
                label={t('fields.dcfEquityRiskPremiumPct')}
                value={equityRiskPremiumPct}
                onChange={(value) => onFieldChange('dcf_equity_risk_premium_pct', value)}
                placeholder={String(DEFAULT_EQUITY_RISK_PREMIUM_PCT)}
                disabled={disabled}
                truncateLabel={false}
              />
              <AdaptivePercentInput
                label={t('fields.dcfBeta')}
                value={beta}
                onChange={(value) => onFieldChange('dcf_beta', value)}
                placeholder={String(DEFAULT_BETA)}
                disabled={disabled}
                step="0.1"
                truncateLabel={false}
              />
              <AdaptivePercentInput
                label={t('fields.dcfCostOfDebtPct')}
                value={costOfDebtPct}
                onChange={(value) => onFieldChange('dcf_cost_of_debt_pct', value)}
                placeholder={String(DEFAULT_COST_OF_DEBT_PCT)}
                disabled={disabled}
                truncateLabel={false}
              />
              <AdaptivePercentInput
                label={t('fields.dcfDebtEquityPct')}
                value={debtEquityPct}
                onChange={(value) => onFieldChange('dcf_debt_equity_pct', value)}
                placeholder={String(DEFAULT_DEBT_EQUITY_PCT)}
                disabled={disabled}
                truncateLabel={false}
              />
              <AdaptivePercentInput
                label={t('fields.dcfTaxShieldPct')}
                value={taxShieldPct}
                onChange={(value) => onFieldChange('dcf_tax_shield_pct', value)}
                placeholder={String(DEFAULT_TAX_SHIELD_PCT)}
                disabled={disabled}
                truncateLabel={false}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
