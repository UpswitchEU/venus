'use client'

/**
 * StartupValuationPanel
 * ---------------------
 *
 * Self-contained left-panel for the 9th valuation method
 * (`startup_valuation`).
 *
 * **Stacked sections layout** — mirrors how DCF (`DcfGlobalAssumptions`),
 * NAV (`NavAssetScheduleSection`), SaaS (`SaasMetricsSection`) etc.
 * stack one beneath the other in the SME `ManualInputPanel`.  Founders
 * scroll through three numbered sections instead of clicking
 * Back / Next on a wizard:
 *
 *   Setup bar (always visible) — Stage segmented + Sector dropdown
 *
 *     1. Risk-Reduction Scorecard (Berkus) — 5 sliders, each unlocking
 *        up to {max_per_milestone} EUR of the regional baseline.
 *
 *     2. Forward-Looking SaaS Metrics — MRR, MoM growth, churn, CAC.
 *        Skippable when pre-revenue (engine drops the SaaS Forward
 *        leg and re-normalises Berkus + VC).
 *
 *     3. Exit Scenario (VC Method) — Year-5 revenue, exit EV/Revenue
 *        multiple, target ROI (default 15×), investment amount sought.
 *
 *     Advanced (collapsible) — Scorecard fine-tuning (advisor only) +
 *     Cap-table & SAFE notes editor.
 *
 * Each numbered section is a *standalone component* under
 * `./RiskReductionScorecardSection`, `./ForwardLookingSaasSection`,
 * `./ExitScenarioSection` so they can be unit-tested in isolation
 * and reused (e.g. inside Mercury's intake flow if we ever flip the
 * dashboard to render the Berkus surface inline).
 *
 * Reads / writes `useStartupValuationStore` and emits the
 * `startup_inputs` payload via `toRequestPayload` on submit.
 */

import { motion } from 'framer-motion'
import { useLocale, useTranslations } from 'next-intl'
import { useLayoutEffect, useMemo, useState } from 'react'
import { AuroraButton, AuroraInput, SegmentedControl, Slider } from '@/design-system'
import { AuroraSelect } from '@/design-system/components/Select'
import { CurrencyInput } from '../../CurrencyInput'
import { AdaptivePercentInput } from '../AdaptivePercentInput'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import {
  STARTUP_SECTOR_DEFAULT_Y5_REVENUE,
  STARTUP_SECTOR_EXIT_MULTIPLES,
  STARTUP_STAGE_DEFAULT_RAISE,
  useStartupValuationStore,
  type StartupSafeNote,
  type StartupSector,
  type StartupStage,
} from '@/store/manual/useStartupValuationStore'
import {
  BERKUS_MILESTONE_KEYS,
  RiskReductionScorecardSection,
  type BerkusMilestoneKey,
} from './RiskReductionScorecardSection'
import { ForwardLookingSaasSection } from './ForwardLookingSaasSection'
import { ExitScenarioSection } from './ExitScenarioSection'

// ---------------------------------------------------------------------------
// Setup-bar options
// ---------------------------------------------------------------------------

const STAGE_OPTIONS: Array<{ value: StartupStage; labelKey: string }> = [
  { value: 'pre_seed', labelKey: 'stagePreSeed' },
  { value: 'seed', labelKey: 'stageSeed' },
  { value: 'series_a', labelKey: 'stageSeriesA' },
]

const SECTOR_OPTIONS: Array<{ value: StartupSector; labelKey: string }> = [
  { value: 'saas', labelKey: 'sectorSaas' },
  { value: 'marketplace', labelKey: 'sectorMarketplace' },
  { value: 'fintech', labelKey: 'sectorFintech' },
  { value: 'biotech_healthtech', labelKey: 'sectorBiotech' },
  { value: 'deeptech_ai', labelKey: 'sectorDeeptech' },
  { value: 'consumer', labelKey: 'sectorConsumer' },
  { value: 'hardware', labelKey: 'sectorHardware' },
  { value: 'other', labelKey: 'sectorOther' },
]

// ---------------------------------------------------------------------------
// Advanced drawer — Scorecard fine-tuning (advisor only)
// ---------------------------------------------------------------------------

function AdvancedScorecardSlider({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-foreground" aria-hidden>
          {label}
        </span>
        <span className="text-xs font-semibold tabular-nums text-primary" aria-hidden>
          {value}
        </span>
      </div>
      <Slider
        value={value}
        min={0}
        max={100}
        step={5}
        onChange={onChange}
        variant="default"
        aria-label={label}
      />
    </div>
  )
}

function SafeNoteRow({
  index,
  note,
  onChange,
  onRemove,
}: {
  index: number
  note: StartupSafeNote
  onChange: (patch: Partial<StartupSafeNote>) => void
  onRemove: () => void
}) {
  const t = useTranslations('manualInput.startupValuation')
  return (
    <div className="rounded-lg border border-foreground/[0.06] bg-background/60 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground/80">
          {t('safeNoteRowTitle', { index: index + 1 })}
        </span>
        <AuroraButton type="button" variant="ghost" size="sm" onClick={onRemove}>
          {t('removeSafeNote')}
        </AuroraButton>
      </div>
      <div className="flex flex-col gap-4">
        <CurrencyInput
          size="sm"
          label={t('safeAmount')}
          value={note.amount ?? undefined}
          onChange={(v) => onChange({ amount: v ?? null })}
        />
        <CurrencyInput
          size="sm"
          label={t('safeValuationCap')}
          value={note.valuation_cap ?? undefined}
          onChange={(v) => onChange({ valuation_cap: v ?? null })}
        />
        <AdaptivePercentInput
          label={t('safeDiscountPct')}
          value={note.discount_pct ?? undefined}
          onChange={(v) => onChange({ discount_pct: v ?? null })}
        />
        <AuroraInput
          size="sm"
          label={t('safeHolderLabel')}
          value={note.holder_label}
          onChange={(e) => onChange({ holder_label: e.target.value })}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Wizard surface mode.
 *
 * - ``advisor`` (default — keeps backward compat with every existing
 *   caller): exposes the full advanced drawer (Scorecard fine-tuning
 *   *and* cap-table & SAFE notes editor).  Drives the 4-leg synthesis
 *   blend on the report side.
 * - ``founder``: collapses the panel to the consortium founder
 *   experience.  Hides the Scorecard fine-tuning section (the founder
 *   triangulation drops Scorecard from the headline blend), keeps the
 *   cap-table editor inside the advanced drawer because the live
 *   simulator depends on it, and swaps the panel intro for
 *   founder-targeted copy.
 */
export type StartupValuationPanelMode = 'founder' | 'advisor'

export interface StartupValuationPanelProps {
  /** Optional className for the outer wrapper. */
  className?: string
  /**
   * Wizard surface mode — see :type:`StartupValuationPanelMode`.
   * Defaults to ``'advisor'`` so existing accountant call-sites keep
   * the full feature surface they had before this prop existed.
   */
  mode?: StartupValuationPanelMode
}

export function StartupValuationPanel({
  className,
  mode = 'advisor',
}: StartupValuationPanelProps) {
  const isFounderMode = mode === 'founder'
  const t = useTranslations('manualInput.startupValuation')
  const locale = useLocale()
  const state = useStartupValuationStore()
  const [showAdvanced, setShowAdvanced] = useState(false)

  const totalSafe = useMemo(
    () =>
      state.cap_table.safe_notes.reduce(
        (sum, n) => sum + (typeof n.amount === 'number' ? n.amount : 0),
        0,
      ),
    [state.cap_table.safe_notes],
  )

  // PLG smart-default: when Mercury's KBO prefill carries a NACE code,
  // infer a sector once on mount.  The store guards against overriding
  // a deliberate user choice (`_sectorWasUserSet`).
  const naceCode = useManualFormStore(
    (s) => (s.formData as { nace_code?: string }).nace_code ?? null,
  )
  const seedSectorFromNaceIfDefault = useStartupValuationStore(
    (s) => s.seedSectorFromNaceIfDefault,
  )
  useLayoutEffect(() => {
    seedSectorFromNaceIfDefault(naceCode)
  }, [naceCode, seedSectorFromNaceIfDefault])

  // Match CurrencyInput's locale resolution so the SAFE-notes total
  // formats consistently with the inputs above it.
  const safeTotalLocale = locale === 'en' ? 'en-BE' : 'nl-BE'

  const stageSegmentOptions = useMemo(
    () => STAGE_OPTIONS.map((opt) => ({ value: opt.value, label: t(opt.labelKey) })),
    [t],
  )

  const sectorSelectOptions = useMemo(
    () =>
      SECTOR_OPTIONS.map((opt) => ({
        value: opt.value,
        label: t(opt.labelKey),
        description: t('setupSectorOptionMultiple', {
          multiple: STARTUP_SECTOR_EXIT_MULTIPLES[opt.value],
        }),
      })),
    [t],
  )

  // Sector dropdown also primes the VC Method's exit multiple + Y5 baseline.
  // Re-seed strategy: a value is "untouched" not only when null, but also
  // when it still equals the previous sector's default (i.e. the founder
  // accepted our suggestion).  Explicit user numbers always win.
  const handleSectorChange = (next: StartupSector) => {
    const prevSector = state.sector
    const prevMultipleDefault = STARTUP_SECTOR_EXIT_MULTIPLES[prevSector]
    const prevY5Default = STARTUP_SECTOR_DEFAULT_Y5_REVENUE[prevSector]
    state.setField('sector', next)
    if (
      state.exit_revenue_multiple == null ||
      state.exit_revenue_multiple === prevMultipleDefault
    ) {
      state.setField('exit_revenue_multiple', STARTUP_SECTOR_EXIT_MULTIPLES[next])
    }
    if (
      state.year5_revenue_projection == null ||
      state.year5_revenue_projection === prevY5Default
    ) {
      state.setField('year5_revenue_projection', STARTUP_SECTOR_DEFAULT_Y5_REVENUE[next])
    }
  }

  // Stage change re-seeds the suggested raise size IFF the founder hasn't
  // actively touched it. Keeps the cap-table simulator showing a credible
  // number when the founder switches between pre-seed → seed → series A,
  // without ever overwriting a deliberate input.
  const handleStageChange = (next: StartupStage) => {
    const previousDefault = STARTUP_STAGE_DEFAULT_RAISE[state.stage]
    state.setField('stage', next)
    if (
      state.investment_amount_sought == null ||
      state.investment_amount_sought === previousDefault
    ) {
      state.setField('investment_amount_sought', STARTUP_STAGE_DEFAULT_RAISE[next])
    }
  }

  // Strongly-typed Berkus scores, gathered into a single record so the
  // section component receives a clean `Record<key, score>` shape.
  const berkusScores = useMemo(
    () =>
      BERKUS_MILESTONE_KEYS.reduce(
        (acc, key) => {
          acc[key] = state[key] as number
          return acc
        },
        {} as Record<BerkusMilestoneKey, number>,
      ),
    // Spread the dependency list so React re-computes on each
    // individual slider change (Zustand state is referentially stable).
    [
      state.sound_idea,
      state.prototype_status,
      state.management_strength,
      state.strategic_relationships,
      state.product_rollout,
      state,
    ],
  )

  // Single, generic field setter — mirrors the SME `ManualInputPanel`
  // pattern (`onFieldChange(field, value)`).  Sub-sections never touch
  // the store directly.
  const handleFieldChange = (field: string, value: number | null) => {
    state.setField(field as Parameters<typeof state.setField>[0], value as never)
  }

  return (
    <div className={['aurora-theme space-y-5 p-4 pb-32', className].filter(Boolean).join(' ')}>
      <header className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">
          {isFounderMode ? t('panelTitleFounder') : t('panelTitle')}
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {isFounderMode ? t('panelIntroFounder') : t('panelIntro')}
        </p>
      </header>

      {/* Setup bar — always visible context */}
      <section className="space-y-3 rounded-xl border border-foreground/[0.06] bg-background/40 p-5">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t('setupStageLabel')}
          </label>
          <SegmentedControl<StartupStage>
            value={state.stage}
            onChange={handleStageChange}
            options={stageSegmentOptions}
            size="sm"
            fullWidth
            aria-label={t('setupStageLabel')}
          />
        </div>

        <AuroraSelect
          label={t('setupSectorLabel')}
          options={sectorSelectOptions}
          value={state.sector}
          onChange={(value) => handleSectorChange(value as StartupSector)}
          helpText={t('setupSectorHelper')}
          helpTextPlacement="below"
          size="sm"
        />
      </section>

      {/* Component 1 — Risk-Reduction Scorecard (Berkus) */}
      <RiskReductionScorecardSection
        step={1}
        countryCode={state.country_code}
        stage={state.stage}
        scores={berkusScores}
        onScoreChange={(key, value) => state.setField(key, value)}
      />

      {/* Component 2 — Forward-Looking SaaS Metrics (skippable) */}
      <ForwardLookingSaasSection
        step={2}
        mrr={state.mrr}
        arr={state.arr}
        mrrGrowthPct={state.mrr_growth_rate_pct}
        monthlyChurnPct={state.monthly_churn_pct}
        cac={state.cac}
        burnRateMonthly={state.burn_rate_monthly}
        runwayMonths={state.runway_months}
        onFieldChange={handleFieldChange}
      />

      {/* Component 3 — Exit Scenario (VC Method) */}
      <ExitScenarioSection
        step={3}
        sector={state.sector}
        stage={state.stage}
        countryCode={state.country_code}
        year5Revenue={state.year5_revenue_projection}
        exitMultiple={state.exit_revenue_multiple}
        targetRoi={state.target_roi_x}
        investmentSought={state.investment_amount_sought}
        dilutionPct={state.dilution_assumption_pct}
        onFieldChange={handleFieldChange}
      />

      {/* Advanced drawer — Scorecard fine-tuning + Cap-table & SAFEs */}
      <section className="space-y-3 rounded-xl border border-foreground/[0.06] bg-background/40 p-5">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex w-full items-center justify-between text-xs font-semibold text-foreground/80 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-md"
          aria-expanded={showAdvanced}
        >
          <span>{t('advancedToggleTitle')}</span>
          <span className="text-[11px] text-muted-foreground">
            {showAdvanced ? t('advancedHide') : t('advancedShow')}
          </span>
        </button>
        {showAdvanced && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="space-y-4 pt-2"
          >
            {/* Scorecard fine-tuning is **advisor-only**: the founder
                triangulation deliberately drops Scorecard from the
                headline 3-leg blend (consortium spec). */}
            {!isFounderMode && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-foreground/80">
                  {t('advancedScorecardTitle')}
                </h3>
                <AdvancedScorecardSlider
                  label={t('opportunitySize')}
                  value={state.opportunity_size}
                  onChange={(v) => state.setField('opportunity_size', v)}
                />
                <AdvancedScorecardSlider
                  label={t('competitiveEnvironment')}
                  value={state.competitive_environment}
                  onChange={(v) => state.setField('competitive_environment', v)}
                />
                <AdvancedScorecardSlider
                  label={t('salesChannels')}
                  value={state.sales_marketing_channels}
                  onChange={(v) => state.setField('sales_marketing_channels', v)}
                />
                <AdvancedScorecardSlider
                  label={t('needForFunding')}
                  value={state.need_for_additional_funding}
                  onChange={(v) => state.setField('need_for_additional_funding', v)}
                />
                <AdvancedScorecardSlider
                  label={t('otherFactors')}
                  value={state.other_factors}
                  onChange={(v) => state.setField('other_factors', v)}
                />
              </div>
            )}

            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-foreground/80">
                {t('advancedCapTableTitle')}
              </h3>
              <p className="text-[11px] leading-tight text-muted-foreground">
                {t('advancedCapTableGdprNote')}
              </p>
              <div className="flex flex-col gap-4">
                <CurrencyInput
                  size="sm"
                  label={t('preMoneyTarget')}
                  value={state.cap_table.pre_money_target ?? undefined}
                  onChange={(v) => state.setCapField('pre_money_target', v ?? null)}
                />
                <AdaptivePercentInput
                  label={t('optionPoolPct')}
                  value={state.cap_table.option_pool_pct}
                  onChange={(v) => state.setCapField('option_pool_pct', v ?? 0)}
                />
                <CurrencyInput
                  size="sm"
                  label={t('lastRoundAmount')}
                  value={state.cap_table.last_round_amount ?? undefined}
                  onChange={(v) => state.setCapField('last_round_amount', v ?? null)}
                />
                <CurrencyInput
                  size="sm"
                  label={t('lastRoundPostMoney')}
                  value={state.cap_table.last_round_post_money ?? undefined}
                  onChange={(v) => state.setCapField('last_round_post_money', v ?? null)}
                />
                <AuroraInput
                  size="sm"
                  type="date"
                  label={t('lastRoundDate')}
                  value={state.cap_table.last_round_date}
                  onChange={(e) => state.setCapField('last_round_date', e.target.value)}
                />
                <AuroraInput
                  size="sm"
                  type="number"
                  inputMode="numeric"
                  label={t('teamSize')}
                  value={state.team_size ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    state.setField('team_size', v === '' ? null : Number(v))
                  }}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">{t('safeNotesTitle')}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {t('safeNotesTotal', { total: totalSafe.toLocaleString(safeTotalLocale) })}
                  </span>
                </div>
                {state.cap_table.safe_notes.map((note, idx) => (
                  <SafeNoteRow
                    key={note.id}
                    index={idx}
                    note={note}
                    onChange={(patch) => state.updateSafeNote(note.id, patch)}
                    onRemove={() => state.removeSafeNote(note.id)}
                  />
                ))}
                <AuroraButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={state.addSafeNote}
                >
                  {t('addSafeNote')}
                </AuroraButton>
              </div>
            </div>
          </motion.div>
        )}
      </section>
    </div>
  )
}

export default StartupValuationPanel
