'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
  /**
   * Sector-anchored WACC band rendered as a defensibility hint above the input.
   * When supplied and the current value falls outside [min, max], an amber out-of-band
   * note appears (reviewer flag, not blocker).
   */
  sectorBand?: {
    sectorLabel: string
    median: number
    min: number
    max: number
  } | null
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
  sectorBand,
}: WaccBreakdownPanelProps) {
  const t = useTranslations('manualInput.methodSelector')
  const [expanded, setExpanded] = useState(false)

  // Out-of-band detection vs the supplied sector band.
  // Uses the current WACC the user sees (computed when the build-up is open,
  // typed when collapsed) so the warning tracks the value being submitted.
  const outOfBandSeverity = useMemo<'high' | 'low' | null>(() => {
    if (!sectorBand) return null
    const value = expanded ? currentWaccPct : currentWaccPct
    if (typeof value !== 'number' || !Number.isFinite(value)) return null
    if (value > sectorBand.max) return 'high'
    if (value < sectorBand.min) return 'low'
    return null
  }, [sectorBand, currentWaccPct, expanded])

  const resolvedRiskFreeRatePct = riskFreeRatePct ?? DEFAULT_RISK_FREE_RATE_PCT
  const resolvedEquityRiskPremiumPct = equityRiskPremiumPct ?? DEFAULT_EQUITY_RISK_PREMIUM_PCT
  const resolvedBeta = beta ?? DEFAULT_BETA
  const resolvedCostOfDebtPct = costOfDebtPct ?? DEFAULT_COST_OF_DEBT_PCT
  const resolvedDebtEquityPct = debtEquityPct ?? DEFAULT_DEBT_EQUITY_PCT
  const resolvedTaxShieldPct = taxShieldPct ?? DEFAULT_TAX_SHIELD_PCT

  const waccBuildup = useMemo(() => {
    const debtWeight = clamp(resolvedDebtEquityPct, 0, 95) / 100
    const equityWeight = 1 - debtWeight
    const costOfEquityPct = resolvedRiskFreeRatePct + resolvedBeta * resolvedEquityRiskPremiumPct
    const afterTaxDebtPct = resolvedCostOfDebtPct * (1 - clamp(resolvedTaxShieldPct, 0, 100) / 100)
    const wacc = round1(equityWeight * costOfEquityPct + debtWeight * afterTaxDebtPct)
    return {
      debtWeight,
      equityWeight,
      costOfEquityPct: round1(costOfEquityPct),
      afterTaxDebtPct: round1(afterTaxDebtPct),
      wacc,
    }
  }, [
    resolvedBeta,
    resolvedCostOfDebtPct,
    resolvedDebtEquityPct,
    resolvedEquityRiskPremiumPct,
    resolvedRiskFreeRatePct,
    resolvedTaxShieldPct,
  ])
  const computedWaccPct = waccBuildup.wacc

  const waccOverridesCapm = useMemo(() => {
    if (expanded) return false
    if (typeof currentWaccPct !== 'number' || !Number.isFinite(currentWaccPct)) return false
    return Math.abs(currentWaccPct - computedWaccPct) >= 0.15
  }, [expanded, currentWaccPct, computedWaccPct])

  const displayWaccPct = useMemo(() => {
    if (expanded) return computedWaccPct
    if (typeof currentWaccPct === 'number' && Number.isFinite(currentWaccPct)) {
      return currentWaccPct
    }
    return computedWaccPct
  }, [expanded, currentWaccPct, computedWaccPct])

  useEffect(() => {
    if (!expanded) return
    onFieldChange('dcf_wacc_pct', computedWaccPct)
  }, [computedWaccPct, expanded, onFieldChange])

  const seedMissingDefaults = useCallback(() => {
    if (disabled) return

    const defaultSeeds = [
      ['dcf_risk_free_rate_pct', riskFreeRatePct, DEFAULT_RISK_FREE_RATE_PCT],
      ['dcf_equity_risk_premium_pct', equityRiskPremiumPct, DEFAULT_EQUITY_RISK_PREMIUM_PCT],
      ['dcf_beta', beta, DEFAULT_BETA],
      ['dcf_cost_of_debt_pct', costOfDebtPct, DEFAULT_COST_OF_DEBT_PCT],
      ['dcf_debt_equity_pct', debtEquityPct, DEFAULT_DEBT_EQUITY_PCT],
      ['dcf_tax_shield_pct', taxShieldPct, DEFAULT_TAX_SHIELD_PCT],
    ] as const

    for (const [field, currentValue, defaultValue] of defaultSeeds) {
      if (currentValue == null) onFieldChange(field, defaultValue)
    }
  }, [
    beta,
    costOfDebtPct,
    debtEquityPct,
    disabled,
    equityRiskPremiumPct,
    onFieldChange,
    riskFreeRatePct,
    taxShieldPct,
  ])

  // Seed the 6 build-up sub-fields on mount when blank, so the engine
  // receives the same values the formula chip displays. Without this,
  // a user who never expands the panel ships `undefined` for Rf / β / ERP /
  // Kd / D-E / tax-shield, and the backend's own fallbacks may diverge from
  // what the chip showed (the same class of bug as the headline WACC seed).
  // Null-checks prevent the loop on prop reflection.
  useEffect(() => {
    seedMissingDefaults()
  }, [seedMissingDefaults])

  const handleToggleExpanded = () => {
    if (!expanded) {
      seedMissingDefaults()
    }
    setExpanded((value) => !value)
  }

  return (
    <div className="w-full min-w-0">
      {sectorBand && (
        <div className="mb-2 flex flex-col gap-0.5">
          <p className="text-[10px] leading-snug text-foreground/55">
            {t('waccBreakdown.sectorBand', {
              min: sectorBand.min.toFixed(1),
              max: sectorBand.max.toFixed(1),
              median: sectorBand.median.toFixed(1),
              sector: sectorBand.sectorLabel,
            })}
          </p>
          <p className="text-[9px] leading-snug text-foreground/35">
            {t('waccBreakdown.sectorBandSource')}
          </p>
        </div>
      )}
      <AdaptivePercentInput
        label={t('fields.dcfWaccPct')}
        value={expanded ? computedWaccPct : currentWaccPct}
        onChange={(value) => onFieldChange('dcf_wacc_pct', value)}
        placeholder={String(DCF_DEFAULT_WACC_PCT)}
        disabled={disabled}
        readOnly={expanded}
        truncateLabel={false}
      />
      {outOfBandSeverity && (
        <p
          className="mt-1 text-[10px] leading-snug text-amber-700 dark:text-amber-200/90"
          role="note"
        >
          {outOfBandSeverity === 'high'
            ? t('waccBreakdown.outOfBandHigh')
            : t('waccBreakdown.outOfBandLow')}
        </p>
      )}
      {/* Always-visible CAPM chip — shows the math behind the rate even when
          the breakdown is collapsed. Uses resolved* values so the math is
          consistent with what the engine receives (no silent placeholder/value drift). */}
      {!expanded && (
        <p className="mt-1 font-mono text-[10px] leading-snug text-foreground/55 tabular-nums">
          {waccOverridesCapm
            ? t('waccBreakdown.manualOverride', { wacc: displayWaccPct.toFixed(1) })
            : t('waccBreakdown.liveFormula', {
                equityWeight: round1(waccBuildup.equityWeight * 100).toFixed(1),
                costOfEquity: waccBuildup.costOfEquityPct.toFixed(1),
                debtWeight: round1(waccBuildup.debtWeight * 100).toFixed(1),
                costOfDebt: resolvedCostOfDebtPct.toFixed(1),
                taxShield: resolvedTaxShieldPct.toFixed(0),
                wacc: displayWaccPct.toFixed(1),
              })}
        </p>
      )}
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
              <p className="mt-1 rounded-lg border border-primary/10 bg-primary/[0.03] px-3 py-2 font-mono text-[10px] leading-relaxed text-foreground/65 tabular-nums">
                {t('waccBreakdown.liveFormula', {
                  equityWeight: round1(waccBuildup.equityWeight * 100).toFixed(1),
                  costOfEquity: waccBuildup.costOfEquityPct.toFixed(1),
                  debtWeight: round1(waccBuildup.debtWeight * 100).toFixed(1),
                  costOfDebt: resolvedCostOfDebtPct.toFixed(1),
                  taxShield: resolvedTaxShieldPct.toFixed(0),
                  wacc: waccBuildup.wacc.toFixed(1),
                })}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
