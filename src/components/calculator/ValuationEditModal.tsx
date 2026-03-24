'use client'

import { useEffect, useState } from 'react'
import {
  BarChart3,
  Calculator,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  Pencil,
  Scale,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { cn } from '@/design-system/utils'
import { AuroraButton } from '@/design-system/components/Button'
import { AuroraSelect } from '@/design-system/components/Select'
import { SegmentedControl } from '@/design-system/components/SegmentedControl'
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
} from '@/design-system/components/Modal'
import type {
  MultiplePipelineStage,
  ValuationMethodResult,
  ValuationResponse,
  WaterfallStep,
} from '../../types/valuation'
import { getOmniMethodEquityRange } from '../../utils/omniCalcRange'
import { buildZeroDraftCsv, downloadZeroDraftCsv } from '@/utils/zeroDraftCsv'
import {
  PREPARER_EBITDA_REASON_KEYS,
  clientShouldWarnExtremeMultiple,
  usePreparerMultipleStore,
} from '../../store/manual/usePreparerMultipleStore'

const PRIMARY_METHOD_KEYS = new Set([
  'upswitch_adaptive',
  'ebitda_multiple',
  'omzet_multiple',
  'revenue_multiple',
  'adjusted_nav',
  'fiscal_4x',
])

const METHOD_OVERRIDE_REASON_KEYS = [
  'fiscal_compliance',
  'asset_heavy_business',
  'internal_transfer',
  'conservative_anchor',
  'client_preference',
  'regulatory_requirement',
  'other',
] as const

const formatCurrency = (amount: number) =>
  amount >= 1_000_000
    ? `€${(amount / 1_000_000).toFixed(1)}M`
    : amount >= 1_000
      ? `€${(amount / 1_000).toFixed(0)}K`
      : `€${Math.round(amount)}`

const formatMultiple = (value: number | null) =>
  value == null ? null : `${value.toFixed(2)}x`

const formatPercent = (value: number | null, scale = 1) =>
  value == null ? null : `${(value * scale).toFixed(1)}%`

const toNumberOrNull = (value: unknown): number | null => {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
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

function BreakdownMetricCard({
  label,
  value,
  accent = false,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-foreground/45">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 text-sm font-mono font-semibold tabular-nums',
          accent ? 'text-primary' : 'text-foreground/80',
        )}
      >
        {value}
      </p>
    </div>
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
      (resultAny?.valuation_result as Record<string, unknown> | undefined)?.enterpriseValueMid,
    )
  const equityValue = toNumberOrNull(method.value)
  const wacc = toNumberOrNull(method.wacc ?? details.wacc)
  const terminalValue = toNumberOrNull(details.terminal_value)
  const ownerSalaryEstimate = toNumberOrNull(details.owner_salary_estimate)
  const sdeValue = toNumberOrNull(details.sde)
  const comparablesCount = toNumberOrNull(result?.multiples_valuation?.comparables_count)
  const comparablesQuality = result?.multiples_valuation?.comparables_quality ?? null
  const pipelineRows = (
    result?.multiple_pipeline?.discount_waterfall?.slice(0, 4) ?? []
  ).map((row: WaterfallStep) => ({
    label: row.step_name,
    before: toNumberOrNull(row.multiple_before_mid) ?? toNumberOrNull(row.multiple_before_low),
    after: toNumberOrNull(row.multiple_after_mid) ?? toNumberOrNull(row.multiple_after_low),
    discount: toNumberOrNull(row.discount_percentage),
  }))

  const fallbackPipelineRows =
    pipelineRows.length > 0
      ? pipelineRows
      : (result?.multiple_pipeline?.stages?.slice(0, 4) ?? []).map(
          (stage: MultiplePipelineStage) => ({
            label: stage.step_name,
            before: toNumberOrNull(stage.multiple_before_mid ?? stage.multiple_before),
            after: toNumberOrNull(stage.multiple_after_mid ?? stage.multiple_after),
            discount: toNumberOrNull(stage.discount_percentage),
          }),
        )

  const effectiveAppliedMultiple =
    appliedMultiple ??
    toNumberOrNull(method.multiple_used) ??
    toNumberOrNull(result?.multiple_pipeline?.final_multiple_mid) ??
    toNumberOrNull(result?.multiple_pipeline?.final_multiple)

  return (
    <div className="rounded-lg border border-primary/15 bg-primary/[0.03] px-4 py-4 space-y-3">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-primary/75">
        <Calculator className="w-3.5 h-3.5" />
        {tBreakdown('title')}
      </div>
      <p className="text-[11px] leading-snug text-foreground/55">
        {tBreakdown('subtitle', { method: method.label })}
      </p>

      {methodKey === 'dcf' ? (
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
            <BreakdownMetricCard
              label={tBreakdown('netDebt')}
              value={formatCurrency(netDebt)}
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
      ) : methodKey === 'fiscal_4x' ? (
        <div className="grid gap-2 sm:grid-cols-2">
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
            <BreakdownMetricCard
              label={tBreakdown('netDebt')}
              value={formatCurrency(netDebt)}
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
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {methodKey === 'omzet_multiple' || methodKey === 'revenue_multiple' ? (
              revenueValue != null && (
                <BreakdownMetricCard
                  label={tBreakdown('revenue')}
                  value={formatCurrency(revenueValue)}
                />
              )
            ) : (
              normalizedEbitda != null && (
                <BreakdownMetricCard
                  label={tBreakdown('normalizedEbitda')}
                  value={formatCurrency(normalizedEbitda)}
                />
              )
            )}
            {benchmarkMultiple != null && (
              <BreakdownMetricCard
                label={tBreakdown('benchmarkMultiple')}
                value={formatMultiple(benchmarkMultiple) || '—'}
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
              <BreakdownMetricCard
                label={tBreakdown('netDebt')}
                value={formatCurrency(netDebt)}
              />
            )}
            {balanceSheetAdjustments != null && balanceSheetAdjustments !== 0 && (
              <BreakdownMetricCard
                label={tBreakdown('balanceSheetAdjustments')}
                value={formatCurrency(balanceSheetAdjustments)}
              />
            )}
            {equityValue != null && (
              <BreakdownMetricCard
                label={tBreakdown('equityValue')}
                value={formatCurrency(equityValue)}
                accent
              />
            )}
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
                      value={comparablesQuality}
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

      <div className="rounded-lg border border-dashed border-border/60 bg-background/60 px-3 py-2">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-foreground/55">
          <Scale className="w-3.5 h-3.5" />
          {tBreakdown('formulaHeading')}
        </div>
        <p className="mt-1 text-[11px] leading-snug text-foreground/55">
          {methodKey === 'dcf'
            ? tBreakdown('formulaDcf')
            : methodKey === 'fiscal_4x'
              ? tBreakdown('formulaFiscal')
              : methodKey === 'adjusted_nav'
                ? tBreakdown('formulaNav')
              : methodKey === 'sde_multiple'
                ? tBreakdown('formulaSde')
                : methodKey === 'omzet_multiple' || methodKey === 'revenue_multiple'
                  ? tBreakdown('formulaRevenue')
                : tBreakdown('formulaMultiple')}
        </p>
      </div>
    </div>
  )
}

export interface ValuationEditModalProps {
  open: boolean
  onClose: () => void
  valuationResults: Record<string, ValuationMethodResult>
  isHydratingMethods?: boolean
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
  zeroDraftReportId?: string
  zeroDraftBusinessName?: string | null
  zeroDraftCreatedAt?: string | null
  showPreparerMultiple?: boolean
  /** True while PATCH + getReport merge runs after a method change (parent drives) */
  isMethodPersisting?: boolean
}

export function ValuationEditModal({
  open,
  onClose,
  valuationResults,
  isHydratingMethods = false,
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
  zeroDraftReportId,
  zeroDraftBusinessName,
  zeroDraftCreatedAt,
  showPreparerMultiple = false,
  isMethodPersisting = false,
}: ValuationEditModalProps) {
  const t = useTranslations('omniCalc')
  const tPrep = useTranslations('preparerMultiple')
  const tModal = useTranslations('valuationEditModal')
  const tBreakdown = useTranslations('methodBreakdown')
  const locale = useLocale()

  const adaptiveLabel = t('currentMethodAdaptive')
  const [mode, setMode] = useState<'ai' | 'manual'>(
    selectedMethod !== 'upswitch_adaptive' ? 'manual' : 'ai',
  )
  const [pendingMethod, setPendingMethod] = useState<string | null>(null)
  const [overrideReasonKey, setOverrideReasonKey] = useState('')
  const [overrideNote, setOverrideNote] = useState('')
  const [showAllMethods, setShowAllMethods] = useState(false)

  useEffect(() => {
    const newMode = selectedMethod === 'upswitch_adaptive' ? 'ai' : 'manual'
    setMode(newMode)
    if (newMode === 'ai') {
      setPendingMethod(null)
      setOverrideReasonKey('')
      setOverrideNote('')
    }
  }, [selectedMethod])

  useEffect(() => {
    if (open) {
      setPendingMethod(null)
      setOverrideReasonKey('')
      setOverrideNote('')
      setShowAllMethods(false)
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
  }, [result, syncFromValuationResult])

  const entries = Object.entries(valuationResults)
  const activeMethodKey = pendingMethod ?? selectedMethod
  const activeMethod = valuationResults[activeMethodKey] ?? null

  // Method selection helpers
  const getSelectedMethodLabel = (method: string) =>
    method === 'upswitch_adaptive'
      ? adaptiveLabel
      : valuationResults[method]?.label || adaptiveLabel

  const adaptiveValue =
    valuationResults['upswitch_adaptive']?.value != null
      ? Number(valuationResults['upswitch_adaptive'].value)
      : null
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

  const availableCount = entries.filter(([, m]) => m.available).length

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
      mv?.p75_ebitda_multiple,
    )
  const bench = benchmarkNum ?? 5

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
    (s): s is string => typeof s === 'string' && s.trim().length > 0,
  )
  const benchmarkContext =
    contextSegments.length > 0 ? contextSegments.join(tPrep('contextSeparator')) : null

  const qualityRaw = `${mv?.comparables_quality ?? ''} ${mv?.confidence ?? ''}`.toUpperCase()
  let confidenceKey:
    | 'confidenceHigh'
    | 'confidenceMedium'
    | 'confidenceLow'
    | 'confidenceDefault' = 'confidenceDefault'
  if (qualityRaw.includes('HIGH')) confidenceKey = 'confidenceHigh'
  else if (qualityRaw.includes('MEDIUM') || qualityRaw.includes('MODERATE'))
    confidenceKey = 'confidenceMedium'
  else if (qualityRaw.includes('LOW')) confidenceKey = 'confidenceLow'

  const hasPrepData = !!(result?.multiples_valuation?.ebitda_multiple || benchmarkMedian != null)
  const nonEbitdaMethodSelected =
    selectedMethod !== 'upswitch_adaptive' && selectedMethod !== 'ebitda_multiple'
  const effectiveDisabled =
    preparerDisabled || nonEbitdaMethodSelected || isMethodPersisting

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
    result && (result as Record<string, any>).details && typeof (result as Record<string, any>).details === 'object'
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
  const liveEquityPreview =
    !effectiveDisabled && sustainableEbitda != null && appliedNum != null
      ? Math.round(sustainableEbitda * appliedNum - previewNetDebt + previewBalanceSheetAdjustments)
      : null
  const comparisonMethods = entries.filter(
    ([, method]) => method.available && toNumberOrNull(method.value) != null,
  )
  const maxComparisonValue = comparisonMethods.reduce((max, [, method]) => {
    const next = toNumberOrNull(method.value) ?? 0
    return Math.max(max, next)
  }, 0)
  const activeMetricValue = toNumberOrNull(activeMethod?.value)

  if (entries.length === 0) {
    const title = isHydratingMethods ? tModal('loadingTitle') : t('unavailableTitle')
    const blurb = isHydratingMethods ? tModal('loadingBlurb') : t('unavailableBlurb')
    return (
      <Modal open={open} onOpenChange={(v) => !v && onClose()}>
        <ModalContent size="lg" description={tModal('description')}>
          <ModalHeader>
            <ModalTitle>{tModal('title')}</ModalTitle>
          </ModalHeader>
          <div className="rounded-lg border border-dashed border-border/60 bg-background/60 px-4 py-5 text-center space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
              {title}
            </p>
            <p className="text-[11px] leading-snug text-foreground/50">
              {blurb}
            </p>
          </div>
        </ModalContent>
      </Modal>
    )
  }

  const renderMethodButton = ([key, method]: [string, ValuationMethodResult]) => {
    const isSelected = key === selectedMethod
    const isPending = key === pendingMethod
    const isAvailable = method.available
    const value = method.value != null ? Number(method.value) : null
    const range =
      isAvailable && value != null
        ? getOmniMethodEquityRange({
            value: method.value,
            available: method.available,
            details: method.details,
          })
        : null

    return (
      <button
        key={key}
        type="button"
        disabled={!isAvailable || methodSelectionLocked}
        onClick={() => isAvailable && !methodSelectionLocked && handleMethodClick(key)}
        className={cn(
          'w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-all border',
          isSelected
            ? 'border-primary/50 bg-primary/5'
            : isPending
              ? 'border-primary/30 bg-primary/[0.03] ring-1 ring-primary/20'
              : isAvailable
                ? 'border-border/50 hover:border-primary/30 hover:bg-primary/[0.02]'
                : 'border-border/30 opacity-50 cursor-not-allowed',
        )}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'text-sm font-medium truncate',
                isSelected || isPending ? 'text-primary' : 'text-foreground',
              )}
            >
              {method.label}
            </span>
            {isSelected && (
              <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                <Check className="w-2.5 h-2.5" />
                {t('selected')}
              </span>
            )}
          </div>
          {!isAvailable && method.unavailable_reason && (
            <p className="text-[10px] text-foreground/40 mt-0.5 truncate">
              {method.unavailable_reason}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          {isAvailable && value != null ? (
            <>
              <span
                className={cn(
                  'text-sm font-mono font-semibold tabular-nums',
                  isSelected || isPending ? 'text-primary' : 'text-foreground',
                )}
              >
                {formatCurrency(value)}
              </span>
              {range && (
                <>
                  <span className="block text-[10px] text-foreground/30 tabular-nums">
                    {formatCurrency(range.low)} – {formatCurrency(range.high)}
                  </span>
                  <span className="block text-[9px] text-foreground/25 uppercase tracking-wide">
                    {range.source === 'model' ? t('rangeModel') : t('rangeIllustrative')}
                  </span>
                </>
              )}
              {method.multiple_used != null && (
                <span className="block text-[10px] text-foreground/40 tabular-nums">
                  {Number(method.multiple_used).toFixed(1)}x
                </span>
              )}
              {method.wacc != null && (
                <span className="block text-[10px] text-foreground/40 tabular-nums">
                  WACC {(Number(method.wacc) * 100).toFixed(1)}%
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-foreground/30">&mdash;</span>
          )}
        </div>
      </button>
    )
  }

  const primaryEntries = entries.filter(([key]) => PRIMARY_METHOD_KEYS.has(key))
  const secondaryEntries = entries.filter(([key]) => !PRIMARY_METHOD_KEYS.has(key))
  const hasActiveSecondary = secondaryEntries.some(
    ([key]) => key === selectedMethod || key === pendingMethod,
  )

  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()}>
      <ModalContent
        size="lg"
        description={tModal('description')}
        className="max-h-[85vh] overflow-y-auto"
      >
        <ModalHeader>
          <ModalTitle>{tModal('title')}</ModalTitle>
        </ModalHeader>

        {/* ─── Section 1: Method Selection ─── */}
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <h4 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                {tModal('methodSection')}
              </h4>
              <p className="text-[11px] leading-snug text-foreground/50">{t('subtitle')}</p>
            </div>
            <div className="shrink-0 text-right max-w-[55%]">
              <span className="text-[10px] text-foreground/40 leading-tight block">
                {t('methodsReadyBadge', { available: availableCount, total: entries.length })}
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
                icon: <Sparkles className="w-3 h-3" />,
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
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-primary/70" aria-hidden />
              {tModal('persistingMethod')}
            </p>
          )}

          {showMethodList && comparisonMethods.length > 0 && (
            <div className="rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-3 space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary/75">
                <BarChart3 className="w-3.5 h-3.5" />
                {tBreakdown('comparisonTitle')}
              </div>
              <div className="space-y-2">
                {comparisonMethods.map(([key, method]) => {
                  const value = toNumberOrNull(method.value)
                  if (value == null) return null
                  const metric =
                    method.multiple_used != null
                      ? formatMultiple(Number(method.multiple_used))
                      : method.wacc != null
                        ? `WACC ${formatPercent(Number(method.wacc), 100)}`
                        : null
                  const deltaValue = adaptiveValue != null ? value - adaptiveValue : null
                  const deltaPercent =
                    adaptiveValue != null && adaptiveValue > 0 ? (deltaValue! / adaptiveValue) * 100 : null
                  const isActive = key === activeMethodKey
                  const width =
                    maxComparisonValue > 0 ? `${Math.max(10, (value / maxComparisonValue) * 100)}%` : '0%'

                  return (
                    <div
                      key={key}
                      className={cn(
                        'rounded-md border px-3 py-2',
                        isActive
                          ? 'border-primary/40 bg-background/80'
                          : 'border-border/50 bg-background/60',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium text-foreground/80 truncate">
                            {method.label}
                          </p>
                          <div className="mt-1 h-1.5 w-full rounded-full bg-foreground/[0.06] overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full',
                                isActive ? 'bg-primary' : 'bg-primary/45',
                              )}
                              style={{ width }}
                            />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-mono font-semibold tabular-nums text-foreground/85">
                            {formatCurrency(value)}
                          </p>
                          {metric && (
                            <p className="text-[10px] text-foreground/45 font-mono tabular-nums">
                              {metric}
                            </p>
                          )}
                          {deltaValue != null && deltaPercent != null && (
                            <p
                              className={cn(
                                'text-[10px] font-mono tabular-nums',
                                deltaValue >= 0 ? 'text-success' : 'text-warning',
                              )}
                            >
                              {deltaValue >= 0 ? '+' : ''}
                              {formatCurrency(Math.abs(deltaValue))} ({deltaPercent >= 0 ? '+' : ''}
                              {deltaPercent.toFixed(1)}%)
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {showMethodList && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-foreground/45 px-0.5">
                {t('methodsListHeading')}
              </p>
              <div className="grid gap-1.5 grid-cols-1">
                {primaryEntries.map(renderMethodButton)}
              </div>
              {secondaryEntries.length > 0 && (
                <>
                  <button
                    type="button"
                    disabled={methodSelectionLocked}
                    onClick={() => !methodSelectionLocked && setShowAllMethods((v) => !v)}
                    className="w-full flex items-center gap-1.5 px-1 py-1 text-[10px] text-foreground/40 hover:text-foreground/60 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                  >
                    {showAllMethods || hasActiveSecondary ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                    {t('showAllMethods', { count: secondaryEntries.length })}
                  </button>
                  {(showAllMethods || hasActiveSecondary) && (
                    <div className="grid gap-1.5 grid-cols-1">
                      {secondaryEntries.map(renderMethodButton)}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {pendingMethod && pendingMethod !== 'upswitch_adaptive' && (
            <div className="rounded-lg border border-primary/20 bg-primary/[0.03] px-3 py-3 space-y-2">
              {valuationResults[pendingMethod]?.label && (
                <p className="text-[10px] font-medium text-foreground/55">
                  {t('overrideConfirmingFor', {
                    method: valuationResults[pendingMethod]!.label,
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
                  className="text-xs"
                  onClick={() => setPendingMethod(null)}
                >
                  {t('overrideCancel')}
                </AuroraButton>
              </div>
            </div>
          )}

          {showFiscalAnchorRow && fiscalAnchor != null && !valuationResults['fiscal_4x'] && (
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

          <MethodBreakdownSection
            methodKey={activeMethodKey}
            method={activeMethod}
            result={result}
            fiscalAnchor={fiscalAnchor}
            benchmarkMultiple={benchmarkNum}
            appliedMultiple={appliedNum}
            previewEquity={liveEquityPreview}
          />
        </div>

        {/* ─── Section 2: EV/EBITDA Multiple Override ─── */}
        {showPreparerMultiple && hasPrepData && (
          <>
            <div className="my-5 border-t border-border/40" />
            <div className={cn('space-y-3', nonEbitdaMethodSelected && 'opacity-60')}>
              <h4 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                {tModal('multipleSection')}
              </h4>

              {nonEbitdaMethodSelected && (
                <div className="rounded-md border border-amber-300/30 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-2">
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
                    {selectedMethod === 'fiscal_4x'
                      ? tPrep('hintFiscalMethod')
                      : tPrep('hintOtherMethod')}
                  </p>
                </div>
              )}

              <div className="grid gap-1.5">
                <span className="text-[10px] font-medium text-foreground/45 uppercase">
                  {tPrep('benchmark')}
                </span>
                <p className="text-[12px] text-foreground/80 leading-snug font-medium">
                  {benchmarkContext
                    ? tPrep('benchmarkAnchored', {
                        context: benchmarkContext,
                        multiple: (benchmarkMedian ?? bench).toFixed(2),
                      })
                    : tPrep('benchmarkAnchoredShort', {
                        multiple: (benchmarkMedian ?? bench).toFixed(2),
                      })}
                </p>
                <span className="text-sm font-mono font-semibold tabular-nums text-primary">
                  {(benchmarkMedian ?? bench).toFixed(2)}×
                </span>
                <p className="text-[10px] text-foreground/45">
                  {tPrep('benchmarkConfidence', { level: tPrep(confidenceKey) })}
                  {mv?.confidence_score != null && Number.isFinite(Number(mv.confidence_score))
                    ? ` · ${tPrep('scoreLabel', { score: Math.round(Number(mv.confidence_score)) })}`
                    : ''}
                </p>
              </div>

              <div className="grid gap-1">
                <label
                  className="text-[10px] font-medium text-foreground/45 uppercase"
                  htmlFor="modal-prep-ev-ebitda"
                >
                  {tPrep('applied')}
                </label>
                {prepDeltaNum != null && Math.abs(prepDeltaNum) >= 0.005 && (
                  <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/60 px-2 py-1 text-[10px] text-foreground/55">
                    <span>{tPrep('deltaLabel')}</span>
                    <span className="font-mono tabular-nums text-foreground/75">
                      {prepDeltaNum > 0 ? '+' : ''}
                      {prepDeltaNum.toFixed(2)}×
                    </span>
                  </div>
                )}
                <input
                  id="modal-prep-ev-ebitda"
                  type="number"
                  step={0.1}
                  min={0.1}
                  max={20}
                  disabled={effectiveDisabled}
                  value={appliedMedian ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === '') {
                      setAppliedMedian(null)
                      return
                    }
                    const n = parseFloat(v)
                    if (Number.isFinite(n)) setAppliedMedian(n)
                  }}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono tabular-nums"
                />
                <input
                  type="range"
                  aria-label={tPrep('applied')}
                  disabled={effectiveDisabled}
                  min={0.1}
                  max={20}
                  step={0.1}
                  value={
                    appliedMedian != null && Number.isFinite(appliedMedian)
                      ? Math.min(20, Math.max(0.1, appliedMedian))
                      : Math.min(20, Math.max(0.1, bench))
                  }
                  onChange={(e) => {
                    const n = parseFloat(e.target.value)
                    if (Number.isFinite(n)) setAppliedMedian(n)
                  }}
                  className="w-full h-2 mt-1 accent-primary"
                />
                <p className="text-[10px] text-foreground/35">{tPrep('sliderHint')}</p>
              </div>

              {liveEquityPreview != null && activeMetricValue != null && (
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
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wide text-foreground/45">
                        {tBreakdown('deltaToHeadline')}
                      </p>
                      <p
                        className={cn(
                          'text-[11px] font-mono tabular-nums',
                          liveEquityPreview - activeMetricValue >= 0 ? 'text-success' : 'text-warning',
                        )}
                      >
                        {liveEquityPreview - activeMetricValue >= 0 ? '+' : ''}
                        {formatCurrency(Math.abs(liveEquityPreview - activeMetricValue))}
                      </p>
                    </div>
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
              </div>

              <div className="grid gap-1">
                <label
                  className="text-[10px] font-medium text-foreground/45 uppercase"
                  htmlFor="modal-prep-note"
                >
                  {tPrep('noteOptional')}
                </label>
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

              {previewText && (
                <div className="rounded-md border border-primary/20 bg-primary/[0.05] px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                      {tPrep('previewTitle')}
                    </span>
                    <span className="text-[10px] text-primary/65">
                      {livePreview ? tPrep('previewLive') : tPrep('previewSaved')}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-foreground/75">
                    {previewText}
                  </p>
                </div>
              )}

              {showExtreme && (
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={effectiveDisabled}
                    checked={acknowledgedExtreme}
                    onChange={(e) => setAcknowledgedExtreme(e.target.checked)}
                    className="mt-1"
                  />
                  <span className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
                    {tPrep('extremeWarning')}
                  </span>
                </label>
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
                <AuroraButton
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={effectiveDisabled}
                  className="w-full text-xs"
                  onClick={() => resetToBenchmark()}
                >
                  {tPrep('resetBenchmark')}
                </AuroraButton>
              </div>
            </div>
          </>
        )}

        {/* ─── Zero Draft Export ─── */}
        {showZeroDraftExport && zeroDraftReportId && entries.length > 0 && (
          <>
            <div className="my-5 border-t border-border/40" />
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
                      showFiscalAnchorRow && fiscalAnchor != null
                        ? fiscalAnchor
                        : undefined,
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
          </>
        )}
      </ModalContent>
    </Modal>
  )
}
