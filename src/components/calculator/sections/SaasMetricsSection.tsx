'use client'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { computeSaasPreviewMetrics } from '@/lib/saas'
import { inferStartupSectorFromNace } from '@/store/manual/inferStartupSectorFromNace'
import { CurrencyInput } from '../CurrencyInput'
import { AdaptivePercentInput } from './AdaptivePercentInput'
import {
  buildSaasBenchmarkPrefillPlan,
  buildSaasMrrPrefillPatch,
  buildSaasProgressModel,
} from './SaasMetricsSectionModel'
import {
  SaasArrProjectionPreviewCard,
  SaasDerivedMetricsGrid,
  type SaasImportedProvenance,
  SaasImportedProvenanceBanner,
  SaasProgressCard,
} from './SaasMetricsSectionOutputs'
import { FieldWithSourceChip, type PrefillSource, SaasPanel } from './SaasMetricsSectionParts'
import { SAAS_SECTOR_DEFAULTS } from './saasBenchmarks'
import { computeYoyRevenueGrowthPct, type YearlyFinancialsRow } from './saasYoyPrefill'
import { ValuationSectionHeader } from './ValuationSectionHeader'

interface SaasMetricsSectionProps {
  step: number
  complete: boolean
  saasArr?: number
  saasMrr?: number
  saasArrGrowthPct?: number
  saasChurnPct?: number
  saasCustomerChurnPct?: number
  saasNrrPct?: number
  saasGrossMarginPct?: number
  saasCac?: number
  saasCustomerConcentrationPct?: number
  saasExpansionRevenuePct?: number
  saasSmSpend?: number
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
  arrProjectionPreview?: Array<{ year: number; arr: number }>
  importedSaasProvenance?: SaasImportedProvenance | null
  /** NACE-BEL or generic NACE Rev. 2 code from KBO/KVK lookup. Drives
   *  the one-shot benchmark prefill of gross margin, churn, NRR, growth.
   *  Optional — when absent, no prefill is attempted. */
  naceCode?: string | null
  /** Historical revenue grid already collected for every method.  When
   *  two consecutive complete years are present, the YoY revenue delta
   *  prefills `saas_arr_growth_pct` more accurately than the sector
   *  median can.  See `saasYoyPrefill.ts` for the clamp / sort rules. */
  yearlyFinancials?: ReadonlyArray<YearlyFinancialsRow> | null
}

export function SaasMetricsSection({
  step,
  complete,
  saasArr,
  saasMrr,
  saasArrGrowthPct,
  saasChurnPct,
  saasCustomerChurnPct,
  saasNrrPct,
  saasGrossMarginPct,
  saasCac,
  saasCustomerConcentrationPct,
  saasExpansionRevenuePct,
  saasSmSpend,
  onFieldChange,
  disabled,
  arrProjectionPreview = [],
  importedSaasProvenance,
  naceCode,
  yearlyFinancials,
}: SaasMetricsSectionProps) {
  const t = useTranslations('manualInput.methodSelector')
  const [advancedExpanded, setAdvancedExpanded] = useState(false)

  // Sector-benchmark prefill — runs once per mount when KBO/KVK has
  // surfaced a NACE we can map to a known sector AND the underlying
  // form values are still empty.  Soft-fills four defensible sector
  // medians (gross margin, monthly churn, NRR, monthly growth) so a
  // founder coming in from Wintercircus / a marketing entry point can
  // hit Calculate immediately and tune from there instead of staring
  // at four blank percent boxes.  We never overwrite imported values
  // (CSV / Octopus / Silverfin) or anything the founder has already
  // typed.  The set of prefilled keys is held in `prefilledKeysRef`
  // so the banner can clear them in one click.
  const sector = useMemo(() => inferStartupSectorFromNace(naceCode ?? null), [naceCode])
  const benchmark = sector ? SAAS_SECTOR_DEFAULTS[sector] : null
  // Best-available YoY growth derived from the historical revenue grid
  // the founder already filled in for every method.  When present, this
  // is the most accurate prefill for `saas_arr_growth_pct` we can offer
  // without an accounting integration — used in preference to the
  // sector median.  Returns null when fewer than two complete years are
  // available or the prior-year revenue is non-positive.
  const yoyGrowthPct = useMemo(
    () => computeYoyRevenueGrowthPct(yearlyFinancials),
    [yearlyFinancials]
  )
  const prefilledKeysRef = useRef<Set<string>>(new Set())
  const prefilledSourceRef = useRef<Map<string, PrefillSource>>(new Map())
  const prefilledRanRef = useRef(false)
  const [_prefilledKeys, setPrefilledKeys] = useState<readonly string[]>([])

  useEffect(() => {
    if (prefilledRanRef.current) return
    const { patches, shouldMarkRan } = buildSaasBenchmarkPrefillPlan({
      benchmark,
      yoyGrowthPct,
      importedSaasProvenance,
      currentValues: {
        saasArrGrowthPct,
        saasChurnPct,
        saasCustomerChurnPct,
        saasNrrPct,
        saasGrossMarginPct,
        saasExpansionRevenuePct,
      },
    })
    if (!shouldMarkRan) return
    prefilledRanRef.current = true
    // NOTE: MRR is intentionally NOT seeded here.  ARR / 12 is a live
    // identity that has to react to founder input mid-session, so it
    // lives in a dedicated effect below.  Keeping it out of this one-
    // shot effect avoids a double-dispatch race when ARR happens to be
    // present at mount.
    if (patches.length === 0) return
    const filled = patches.map((patch) => patch.field)
    const sources = new Map<string, PrefillSource>(
      patches.map((patch) => [patch.field, patch.source])
    )
    prefilledKeysRef.current = new Set(filled)
    prefilledSourceRef.current = sources
    setPrefilledKeys(filled)
    for (const patch of patches) {
      onFieldChange(patch.field, patch.value)
    }
  }, [
    benchmark,
    yoyGrowthPct,
    importedSaasProvenance,
    saasGrossMarginPct,
    saasChurnPct,
    saasNrrPct,
    saasCustomerChurnPct,
    saasExpansionRevenuePct,
    saasArrGrowthPct,
    onFieldChange,
  ])

  // ─── Per-field "still-prefilled" tracking ───────────────────────
  // A field counts as "prefilled" only while the founder has not
  // edited it. Once they type, we drop the chip + the per-field
  // key so the Clear All CTA never wipes their value.
  const editedSinceFillRef = useRef<Set<string>>(new Set())
  const isStillPrefilled = useCallback((key: string): boolean => {
    if (!prefilledKeysRef.current.has(key)) return false
    if (editedSinceFillRef.current.has(key)) return false
    return true
  }, [])
  const handleFieldChange = useCallback(
    (key: string, value: number | undefined) => {
      if (prefilledKeysRef.current.has(key)) {
        editedSinceFillRef.current.add(key)
      }
      onFieldChange(key, value)
    },
    [onFieldChange]
  )

  // ─── Live ARR → MRR derivation ─────────────────────────────────
  // The benchmark prefill effect only runs once at mount, so a founder
  // who types ARR mid-session would otherwise be left with an empty
  // MRR field even though it's a universal SaaS identity (ARR / 12).
  // This second, lightweight effect closes that gap: whenever ARR is
  // present and MRR is empty (and the founder hasn't cleared it since
  // a prior prefill), seed MRR and tag it so the chip surfaces.
  useEffect(() => {
    const patch = buildSaasMrrPrefillPatch({
      saasArr,
      saasMrr,
      importedSaasProvenance,
      editedSinceFill: editedSinceFillRef.current.has('saas_mrr'),
    })
    if (!patch) return
    prefilledKeysRef.current.add(patch.field)
    prefilledSourceRef.current.set(patch.field, patch.source)
    setPrefilledKeys((prev) => (prev.includes('saas_mrr') ? prev : [...prev, 'saas_mrr']))
    onFieldChange(patch.field, patch.value)
  }, [saasArr, saasMrr, importedSaasProvenance, onFieldChange])

  const derivedMetrics = useMemo(
    () =>
      computeSaasPreviewMetrics({
        saasArr,
        saasMrr,
        saasArrGrowthPct,
        saasChurnPct,
        saasCustomerChurnPct,
        saasNrrPct,
        saasGrossMarginPct,
        saasCac,
        saasSmSpend,
      }),
    [
      saasArr,
      saasArrGrowthPct,
      saasCac,
      saasChurnPct,
      saasCustomerChurnPct,
      saasGrossMarginPct,
      saasMrr,
      saasNrrPct,
      saasSmSpend,
    ]
  )

  const progressModel = useMemo(
    () =>
      buildSaasProgressModel({
        saasArr,
        saasMrr,
        saasArrGrowthPct,
        saasChurnPct,
        saasCustomerChurnPct,
        saasNrrPct,
        saasGrossMarginPct,
        saasCac,
        saasSmSpend,
        saasCustomerConcentrationPct,
        saasExpansionRevenuePct,
      }),
    [
      saasArr,
      saasMrr,
      saasArrGrowthPct,
      saasChurnPct,
      saasCustomerChurnPct,
      saasNrrPct,
      saasGrossMarginPct,
      saasCac,
      saasSmSpend,
      saasCustomerConcentrationPct,
      saasExpansionRevenuePct,
    ]
  )
  const { advancedFilledCount, filledCount, isReady, progressPct, totalFields } = progressModel
  // True accordion: open it automatically the first time it makes
  // sense (founder past the core 4 OR has already filled an advanced
  // field), but always let them collapse it again.  The
  // "permanent open once shown" pattern produced "I can't close this"
  // feedback during the first Wintercircus runs.
  const advancedAutoOpenedRef = useRef(false)
  useEffect(() => {
    if (advancedAutoOpenedRef.current) return
    if (advancedExpanded) {
      advancedAutoOpenedRef.current = true
      return
    }
    if (advancedFilledCount > 0 || isReady) {
      advancedAutoOpenedRef.current = true
      setAdvancedExpanded(true)
    }
  }, [advancedExpanded, advancedFilledCount, isReady])
  const showAdvancedInputs = advancedExpanded

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="mt-6 space-y-4 pt-2"
    >
      <ValuationSectionHeader
        step={step}
        complete={complete}
        title={t('sections.saasMetrics')}
        badge={
          <span className="rounded-full bg-primary/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-primary/70">
            {t('shownForBusinessType', {
              businessType: t('businessTypes.saasSoftware'),
            })}
          </span>
        }
      />

      {importedSaasProvenance && (
        <SaasImportedProvenanceBanner provenance={importedSaasProvenance} />
      )}

      <SaasProgressCard
        filledCount={filledCount}
        isReady={isReady}
        progressPct={progressPct}
        totalFields={totalFields}
      />

      <SaasPanel
        title={t('saasPanels.startHereTitle')}
        description={t('saasPanels.startHereDescription')}
      >
        <div className="grid grid-cols-1 gap-3">
          <CurrencyInput
            label={t('fields.saasArr')}
            value={saasArr}
            onChange={(v) => onFieldChange('saas_arr', v)}
            size="sm"
            placeholder="500.000"
            disabled={disabled}
            description={t('fieldHints.saasArr')}
            truncateLabel={false}
          />
          <FieldWithSourceChip
            prefilled={isStillPrefilled('saas_mrr')}
            source={prefilledSourceRef.current.get('saas_mrr') ?? null}
            label={t(`prefillSource.${prefilledSourceRef.current.get('saas_mrr') ?? 'derived'}`)}
            tooltip={t('prefillSource.derivedTooltip')}
          >
            <CurrencyInput
              label={t('fields.saasMrr')}
              value={saasMrr}
              onChange={(v) => handleFieldChange('saas_mrr', v)}
              size="sm"
              placeholder="42.000"
              disabled={disabled}
              description={t('fieldHints.saasMrr')}
              truncateLabel={false}
            />
          </FieldWithSourceChip>
          <FieldWithSourceChip
            prefilled={isStillPrefilled('saas_arr_growth_pct')}
            source={prefilledSourceRef.current.get('saas_arr_growth_pct') ?? null}
            label={t(
              `prefillSource.${prefilledSourceRef.current.get('saas_arr_growth_pct') ?? 'benchmark'}`
            )}
            tooltip={t(
              `prefillSource.${prefilledSourceRef.current.get('saas_arr_growth_pct') === 'history' ? 'historyTooltip' : 'benchmarkTooltip'}`
            )}
          >
            <AdaptivePercentInput
              label={t('fields.saasArrGrowthPct')}
              value={saasArrGrowthPct}
              onChange={(v) => handleFieldChange('saas_arr_growth_pct', v)}
              placeholder="60"
              disabled={disabled}
              description={t('fieldHints.saasArrGrowthPct')}
              truncateLabel={false}
            />
          </FieldWithSourceChip>
          <FieldWithSourceChip
            prefilled={isStillPrefilled('saas_nrr_pct')}
            source={prefilledSourceRef.current.get('saas_nrr_pct') ?? null}
            label={t(
              `prefillSource.${prefilledSourceRef.current.get('saas_nrr_pct') ?? 'benchmark'}`
            )}
            tooltip={t('prefillSource.benchmarkTooltip')}
          >
            <AdaptivePercentInput
              label={t('fields.saasNrrPct')}
              value={saasNrrPct}
              onChange={(v) => handleFieldChange('saas_nrr_pct', v)}
              placeholder="110"
              disabled={disabled}
              description={t('fieldHints.saasNrrPct')}
              truncateLabel={false}
            />
          </FieldWithSourceChip>
        </div>
      </SaasPanel>

      <SaasPanel
        title={t('saasPanels.retentionTitle')}
        description={t('saasPanels.retentionDescription')}
      >
        <div className="grid grid-cols-1 gap-3">
          <FieldWithSourceChip
            prefilled={isStillPrefilled('saas_churn_pct')}
            source={prefilledSourceRef.current.get('saas_churn_pct') ?? null}
            label={t(
              `prefillSource.${prefilledSourceRef.current.get('saas_churn_pct') ?? 'benchmark'}`
            )}
            tooltip={t('prefillSource.benchmarkTooltip')}
          >
            <AdaptivePercentInput
              label={t('fields.saasChurnPct')}
              value={saasChurnPct}
              onChange={(v) => handleFieldChange('saas_churn_pct', v)}
              placeholder="5"
              disabled={disabled}
              description={t('fieldHints.saasChurnPct')}
              truncateLabel={false}
            />
          </FieldWithSourceChip>
          <FieldWithSourceChip
            prefilled={isStillPrefilled('saas_customer_churn_pct')}
            source={prefilledSourceRef.current.get('saas_customer_churn_pct') ?? null}
            label={t(
              `prefillSource.${prefilledSourceRef.current.get('saas_customer_churn_pct') ?? 'benchmark'}`
            )}
            tooltip={t('prefillSource.benchmarkTooltip')}
          >
            <AdaptivePercentInput
              label={t('fields.saasCustomerChurnPct')}
              value={saasCustomerChurnPct}
              onChange={(v) => handleFieldChange('saas_customer_churn_pct', v)}
              placeholder="8"
              disabled={disabled}
              description={t('fieldHints.saasCustomerChurnPct')}
              truncateLabel={false}
            />
          </FieldWithSourceChip>
          <FieldWithSourceChip
            prefilled={isStillPrefilled('saas_expansion_revenue_pct')}
            source={prefilledSourceRef.current.get('saas_expansion_revenue_pct') ?? null}
            label={t(
              `prefillSource.${prefilledSourceRef.current.get('saas_expansion_revenue_pct') ?? 'benchmark'}`
            )}
            tooltip={t('prefillSource.benchmarkTooltip')}
          >
            <AdaptivePercentInput
              label={t('fields.saasExpansionRevenuePct')}
              value={saasExpansionRevenuePct}
              onChange={(v) => handleFieldChange('saas_expansion_revenue_pct', v)}
              placeholder="12"
              disabled={disabled}
              description={t('fieldHints.saasExpansionRevenuePct')}
              truncateLabel={false}
            />
          </FieldWithSourceChip>
          <FieldWithSourceChip
            prefilled={isStillPrefilled('saas_gross_margin_pct')}
            source={prefilledSourceRef.current.get('saas_gross_margin_pct') ?? null}
            label={t(
              `prefillSource.${prefilledSourceRef.current.get('saas_gross_margin_pct') ?? 'benchmark'}`
            )}
            tooltip={t('prefillSource.benchmarkTooltip')}
          >
            <AdaptivePercentInput
              label={t('fields.saasGrossMarginPct')}
              value={saasGrossMarginPct}
              onChange={(v) => handleFieldChange('saas_gross_margin_pct', v)}
              placeholder="78"
              disabled={disabled}
              description={t('fieldHints.saasGrossMarginPct')}
              truncateLabel={false}
            />
          </FieldWithSourceChip>
        </div>
      </SaasPanel>

      {/* Advanced inputs — true accordion (collapse from any state). */}
      <div className="rounded-xl border border-primary/10 bg-primary/[0.03] p-3 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0 flex-1">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/60">
              {t('saasPanels.advancedTitle')}
            </h4>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {showAdvancedInputs
                ? t('saasPanels.advancedDescription')
                : t('saasPanels.advancedLockedDescription')}
            </p>
            {!showAdvancedInputs && advancedFilledCount > 0 && (
              <p className="text-[11px] text-foreground/55">
                {t('saasAdvanced.expandSummary', {
                  count: advancedFilledCount,
                  total: 3,
                })}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setAdvancedExpanded((prev) => !prev)}
            disabled={disabled}
            aria-expanded={showAdvancedInputs}
            className="shrink-0 rounded-md border border-primary/20 bg-background/60 px-2 py-1 text-[11px] font-medium text-primary/80 transition-colors hover:bg-primary/[0.08] disabled:opacity-50"
          >
            {showAdvancedInputs
              ? t('saasAdvanced.collapseLabel')
              : t('saasPanels.showAdvancedButton')}
          </button>
        </div>
        {showAdvancedInputs && (
          <div className="grid grid-cols-1 gap-3">
            <CurrencyInput
              label={t('fields.saasCac')}
              value={saasCac}
              onChange={(v) => onFieldChange('saas_cac', v)}
              size="sm"
              placeholder="1.500"
              disabled={disabled}
              description={t('fieldHints.saasCac')}
              truncateLabel={false}
            />
            <CurrencyInput
              label={t('fields.saasSmSpend')}
              value={saasSmSpend}
              onChange={(v) => onFieldChange('saas_sm_spend', v)}
              size="sm"
              placeholder="120.000"
              disabled={disabled}
              description={t('fieldHints.saasSmSpend')}
              truncateLabel={false}
            />
            <AdaptivePercentInput
              label={t('fields.saasCustomerConcentrationPct')}
              value={saasCustomerConcentrationPct}
              onChange={(v) => onFieldChange('saas_customer_concentration_pct', v)}
              placeholder="20"
              disabled={disabled}
              description={t('fieldHints.saasCustomerConcentrationPct')}
              truncateLabel={false}
            />
          </div>
        )}
      </div>

      <SaasDerivedMetricsGrid derivedMetrics={derivedMetrics} isReady={isReady} />

      <SaasArrProjectionPreviewCard rows={arrProjectionPreview} />
    </motion.section>
  )
}
