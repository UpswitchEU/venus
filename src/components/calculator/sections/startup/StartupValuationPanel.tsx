'use client'

/**
 * StartupValuationPanel
 *
 * Self-contained left-panel for the 9th valuation method (`startup_valuation`).
 *
 * **3-screen guided interview** (consortium blueprint, 2025):
 *
 *   Setup bar (always visible): Stage segmented + Sector dropdown
 *
 *     1. Risk-Reduction Scorecard   — 5 Berkus sliders (qualitative milestones)
 *     2. Forward-Looking Traction   — MRR, MoM growth, churn, CAC (skippable)
 *     3. VC Exit Scenario           — Y5 revenue, exit multiple, target ROI, dilution
 *
 *     Advanced (collapsible): Scorecard finetuning + Cap-table & SAFE notes
 *
 * Replaces the historical-financials SME pipeline when the founder picks
 * the venture path. Reads / writes `useStartupValuationStore` and emits
 * a `startup_inputs` payload via `toRequestPayload` on submit.
 *
 * KISS / DRY: single component, no extra context wrappers; mirrors the
 * "step badge + section header" rhythm of the SME ManualInputPanel so
 * founders feel at home in the same shell.
 *
 * Aurora Clarity compliance:
 *   - SegmentedControl for stage (replaces raw <button> grid)
 *   - AuroraSelect for sector (replaces raw <select>)
 *   - Slider scalar API (was passing array — broken silently)
 *   - AdaptivePercentInput for %-typed fields (matches SaasMetricsSection)
 *   - StepProgress-style indicator with primary track
 *   - ValuationSectionHeader keeps step-badge rhythm with rest of Manual flow
 */

import { motion } from 'framer-motion'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { AuroraButton, AuroraInput, SegmentedControl, Slider } from '@/design-system'
import { AuroraSelect } from '@/design-system/components/Select'
import { CurrencyInput } from '../../CurrencyInput'
import { AdaptivePercentInput } from '../AdaptivePercentInput'
import { ValuationSectionHeader } from '../ValuationSectionHeader'
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
// Reusable atoms
// ---------------------------------------------------------------------------

interface SliderRowProps {
  label: string
  helper?: string
  value: number
  onChange: (value: number) => void
}

/**
 * Berkus-style 0–100 slider row.
 * Uses the Aurora `Slider` primitive (scalar value + onChange).
 */
function SliderRow({ label, helper, value, onChange }: SliderRowProps) {
  // The Aurora `Slider` primitive renders a div with `role="slider"`, so a
  // bare `<label>` does not auto-associate. We forward `aria-label` (and
  // `aria-describedby` when there is helper text) so screen readers announce
  // the milestone instead of an anonymous "slider, 50".
  const reactId = useId()
  const helperId = helper ? `startup-slider-helper-${reactId}` : undefined
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
        aria-describedby={helperId}
      />
      {helper ? (
        <p id={helperId} className="text-[11px] leading-tight text-muted-foreground">
          {helper}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Wizard-step container — matches SaasMetricsSection's `rounded-xl border` rhythm.
 * Lazy-fades on mount so step transitions feel smooth.
 *
 * A11y: when ``focusOnMount`` is true, programmatically moves focus to
 * the section on mount so keyboard / screen-reader users (who just
 * clicked Back/Next) land on the new step's heading instead of being
 * stranded on a now-stale "Next" button. The parent only sets it to
 * true on step *changes*, never on first render — first-render focus
 * would steal focus from whatever the user is reading on the page.
 */
function SectionShell({
  step,
  title,
  description,
  focusOnMount,
  children,
}: {
  step: number
  title: string
  description?: string
  focusOnMount?: boolean
  children: React.ReactNode
}) {
  const sectionRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (focusOnMount && sectionRef.current) {
      sectionRef.current.focus({ preventScroll: false })
    }
  }, [focusOnMount])

  return (
    <motion.section
      key={`startup-step-${step}`}
      ref={sectionRef as React.RefObject<HTMLElement>}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      // tabIndex=-1 makes the section programmatically focusable without
      // adding it to the natural tab order. aria-labelledby points at
      // the heading rendered by ValuationSectionHeader so SR announces
      // the section title on focus.
      tabIndex={-1}
      aria-labelledby={`startup-step-heading-${step}`}
      // Suppress the default focus ring on the wrapper itself — the
      // visual focus indicator already lives on the heading badge.
      className="space-y-3 rounded-xl border border-foreground/[0.06] bg-background/40 p-4 focus-visible:outline-none"
    >
      <div id={`startup-step-heading-${step}`}>
        <ValuationSectionHeader step={step} complete={false} title={title} />
      </div>
      {description ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      <div className="space-y-3">{children}</div>
    </motion.section>
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
    <div className="rounded-lg border border-foreground/[0.06] bg-background/60 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground/80">
          {t('safeNoteRowTitle', { index: index + 1 })}
        </span>
        <AuroraButton type="button" variant="ghost" size="sm" onClick={onRemove}>
          {t('removeSafeNote')}
        </AuroraButton>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
// 3-screen wizard
// ---------------------------------------------------------------------------

type WizardStep = 1 | 2 | 3
const TOTAL_STEPS = 3

/**
 * Linear, segmented progress bar in primary tint — matches the
 * "primary track + step badges" Aurora pattern. Uses `motion.div` for
 * the active fill so it animates as the founder advances.
 */
function ProgressBar({ step }: { step: WizardStep }) {
  const t = useTranslations('manualInput.startupValuation')
  const labels: Record<WizardStep, string> = {
    1: t('wizardStep1Label'),
    2: t('wizardStep2Label'),
    3: t('wizardStep3Label'),
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>{t('wizardStepCounter', { current: step, total: TOTAL_STEPS })}</span>
        <span className="text-foreground/80">{labels[step]}</span>
      </div>
      <div
        className="flex gap-1"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={TOTAL_STEPS}
        aria-valuenow={step}
        // Screen-reader-friendly label: instead of "2 of 3", announce
        // "Step 2 of 3, Forward-Looking Traction" so visually impaired
        // founders know which milestone of the consortium-spec wizard
        // they're on.
        aria-valuetext={t('wizardProgressAriaValueText', {
          current: step,
          total: TOTAL_STEPS,
          label: labels[step],
        })}
      >
        {([1, 2, 3] as const).map((s) => (
          <div
            key={s}
            className="relative h-1 flex-1 overflow-hidden rounded-full bg-foreground/[0.08]"
          >
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={false}
              animate={{ width: s <= step ? '100%' : '0%' }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export interface StartupValuationPanelProps {
  /** Optional className for the outer wrapper. */
  className?: string
}

export function StartupValuationPanel({ className }: StartupValuationPanelProps) {
  const t = useTranslations('manualInput.startupValuation')
  const locale = useLocale()
  const state = useStartupValuationStore()
  const [step, setStep] = useState<WizardStep>(1)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Track whether the current `step` is the result of an in-session
  // navigation (Back/Next/Skip click) versus the initial mount.  Only
  // in-session changes should programmatically move focus to the new
  // section heading — focus-stealing on first render would yank focus
  // away from whatever the user is reading on the page when the panel
  // first appears.
  const isFirstStepRef = useRef(true)
  const prevStepRef = useRef<WizardStep>(step)
  const stepChanged = prevStepRef.current !== step
  useEffect(() => {
    prevStepRef.current = step
    if (isFirstStepRef.current) {
      isFirstStepRef.current = false
    }
  }, [step])
  const focusOnStepMount = stepChanged && !isFirstStepRef.current

  const totalSafe = useMemo(
    () =>
      state.cap_table.safe_notes.reduce(
        (sum, n) => sum + (typeof n.amount === 'number' ? n.amount : 0),
        0
      ),
    [state.cap_table.safe_notes]
  )

  // PLG smart-default: when Mercury's KBO prefill carries a NACE code,
  // infer a sector once on mount.  The store guards against overriding
  // a deliberate user choice (`_sectorWasUserSet`), so this is safe to
  // call on every render — but we still scope the effect to NACE
  // changes to avoid useless re-evaluations.
  const naceCode = useManualFormStore(
    (s) => (s.formData as { nace_code?: string }).nace_code ?? null
  )
  const seedSectorFromNaceIfDefault = useStartupValuationStore(
    (s) => s.seedSectorFromNaceIfDefault
  )
  useEffect(() => {
    seedSectorFromNaceIfDefault(naceCode)
  }, [naceCode, seedSectorFromNaceIfDefault])

  // Match CurrencyInput's locale resolution so the SAFE-notes total
  // formats consistently with the inputs above it.
  const safeTotalLocale = locale === 'en' ? 'en-BE' : 'nl-BE'

  const stageSegmentOptions = useMemo(
    () => STAGE_OPTIONS.map((opt) => ({ value: opt.value, label: t(opt.labelKey) })),
    [t]
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
    [t]
  )

  // Sector dropdown also primes the VC Method's exit multiple + Y5 baseline.
  //
  // Re-seed strategy mirrors `handleStageChange`: a value is treated as
  // "untouched" not only when it's null, but also when it still equals the
  // previous sector's default (i.e. the user accepted our suggestion).
  // Otherwise a founder who flips SaaS → Biotech after silently keeping our
  // 6× SaaS suggestion stays stuck on a sector-mismatched 6× when the
  // biotech default is closer to 8×.
  //
  // If the founder *did* type their own number, we leave it alone — explicit
  // input always wins.
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
  // actively touched it (i.e. it still matches the previous stage's
  // default). Keeps the cap-table simulator showing a credible number
  // when the founder switches between pre-seed → seed → series A,
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

  // Live cap-table simulator preview (mirrors the report's
  // ``cap_table_simulator`` block). We compute against the BLENDED
  // pre-money once it's available; in the panel we don't have the
  // blend yet, so we approximate with the consortium VC formula:
  //   pre = (Y5 × multiple / ROI) − investment_sought, clamped to >= 0.
  // The formal report shows the blended figure; this preview is a
  // confidence-builder ("yes, your inputs produce a real number") and
  // the disclosure copy makes the approximation clear.
  const liveVcPreview = useMemo(() => {
    const y5 = state.year5_revenue_projection ?? 0
    const multiple =
      state.exit_revenue_multiple ?? STARTUP_SECTOR_EXIT_MULTIPLES[state.sector]
    const roi = state.target_roi_x ?? 0
    const investment = state.investment_amount_sought ?? 0
    if (y5 <= 0 || multiple <= 0 || roi <= 0) return null
    const post = (y5 * multiple) / roi
    if (post <= 0) return null
    if (investment <= 0) return { pre: post, post, investment: 0, dilution: 0 }
    const pre = Math.max(0, post - investment)
    // Clamp dilution to [0, 100] for display: matches the same defensive
    // clamp applied on the report side (see startup_report_context.py).
    // A raw value > 100 % is mathematically correct when the founder asks
    // more than the implied post-money, but it reads like a UI bug to a
    // founder. The dedicated "asking too much" warning (rendered just
    // below this card via vc_oversubscribed semantics) is the right place
    // to surface that signal explicitly.
    const rawDilution = (investment / post) * 100
    const dilution = Math.max(0, Math.min(100, rawDilution))
    return { pre, post, investment, dilution }
  }, [
    state.year5_revenue_projection,
    state.exit_revenue_multiple,
    state.target_roi_x,
    state.investment_amount_sought,
    state.sector,
  ])

  const goToNext = () => setStep((s) => (s < TOTAL_STEPS ? ((s + 1) as WizardStep) : s))
  const goToPrev = () => setStep((s) => (s > 1 ? ((s - 1) as WizardStep) : s))

  return (
    <div className={['aurora-theme space-y-4 p-4 pb-32', className].filter(Boolean).join(' ')}>
      <header className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">{t('panelTitle')}</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('panelIntro')}</p>
      </header>

      {/* Setup bar — always visible context */}
      <section className="space-y-3 rounded-xl border border-foreground/[0.06] bg-background/40 p-4">
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

      <ProgressBar step={step} />

      {step === 1 && (
        <SectionShell
          step={1}
          title={t('wizardStep1Title')}
          description={t('wizardStep1Description')}
          focusOnMount={focusOnStepMount}
        >
          <SliderRow
            label={t('soundIdea')}
            helper={t('soundIdeaHelper')}
            value={state.sound_idea}
            onChange={(v) => state.setField('sound_idea', v)}
          />
          <SliderRow
            label={t('prototypeStatus')}
            helper={t('prototypeStatusHelper')}
            value={state.prototype_status}
            onChange={(v) => state.setField('prototype_status', v)}
          />
          <SliderRow
            label={t('managementStrength')}
            helper={t('managementStrengthHelper')}
            value={state.management_strength}
            onChange={(v) => state.setField('management_strength', v)}
          />
          <SliderRow
            label={t('strategicRelationships')}
            helper={t('strategicRelationshipsHelper')}
            value={state.strategic_relationships}
            onChange={(v) => state.setField('strategic_relationships', v)}
          />
          <SliderRow
            label={t('productRollout')}
            helper={t('productRolloutHelper')}
            value={state.product_rollout}
            onChange={(v) => state.setField('product_rollout', v)}
          />
        </SectionShell>
      )}

      {step === 2 && (
        <SectionShell
          step={2}
          title={t('wizardStep2Title')}
          description={t('wizardStep2Description')}
          focusOnMount={focusOnStepMount}
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <CurrencyInput
              size="sm"
              label={t('mrr')}
              value={state.mrr ?? undefined}
              onChange={(v) => state.setField('mrr', v ?? null)}
            />
            <AdaptivePercentInput
              label={t('mrrGrowth')}
              value={state.mrr_growth_rate_pct ?? undefined}
              onChange={(v) => state.setField('mrr_growth_rate_pct', v ?? null)}
            />
            <AdaptivePercentInput
              label={t('monthlyChurn')}
              value={state.monthly_churn_pct ?? undefined}
              onChange={(v) => state.setField('monthly_churn_pct', v ?? null)}
            />
            <CurrencyInput
              size="sm"
              label={t('cac')}
              value={state.cac ?? undefined}
              onChange={(v) => state.setField('cac', v ?? null)}
            />
            <CurrencyInput
              size="sm"
              label={t('burnRate')}
              value={state.burn_rate_monthly ?? undefined}
              onChange={(v) => state.setField('burn_rate_monthly', v ?? null)}
            />
            <AuroraInput
              size="sm"
              type="number"
              inputMode="numeric"
              label={t('runwayMonths')}
              value={state.runway_months ?? ''}
              onChange={(e) => {
                const v = e.target.value
                state.setField('runway_months', v === '' ? null : Number(v))
              }}
            />
          </div>
          <AuroraButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              state.setField('mrr', null)
              state.setField('arr', null)
              state.setField('mrr_growth_rate_pct', null)
              state.setField('monthly_churn_pct', null)
              setStep(3)
            }}
          >
            {t('wizardStep2SkipPreRevenue')}
          </AuroraButton>
        </SectionShell>
      )}

      {step === 3 && (
        <SectionShell
          step={3}
          title={t('wizardStep3Title')}
          description={t('wizardStep3Description')}
          focusOnMount={focusOnStepMount}
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <CurrencyInput
              size="sm"
              label={t('y5Revenue')}
              value={state.year5_revenue_projection ?? undefined}
              onChange={(v) => state.setField('year5_revenue_projection', v ?? null)}
            />
            <AuroraInput
              size="sm"
              type="number"
              inputMode="decimal"
              step="0.5"
              label={t('exitMultiple')}
              value={state.exit_revenue_multiple ?? ''}
              onChange={(e) => {
                const v = e.target.value
                state.setField('exit_revenue_multiple', v === '' ? null : Number(v))
              }}
            />
            <AuroraInput
              size="sm"
              type="number"
              inputMode="decimal"
              step="1"
              label={t('targetRoi')}
              value={state.target_roi_x ?? ''}
              onChange={(e) => {
                const v = e.target.value
                state.setField('target_roi_x', v === '' ? null : Number(v))
              }}
            />
            <CurrencyInput
              size="sm"
              label={t('investmentAmountSought')}
              description={t('investmentAmountSoughtHelper')}
              value={state.investment_amount_sought ?? undefined}
              onChange={(v) => state.setField('investment_amount_sought', v ?? null)}
            />
            <AdaptivePercentInput
              label={t('dilutionAssumption')}
              value={state.dilution_assumption_pct ?? undefined}
              onChange={(v) => state.setField('dilution_assumption_pct', v ?? null)}
            />
          </div>
          <p className="text-[11px] leading-tight text-muted-foreground">
            {t('wizardStep3SectorHint', {
              sector: t(SECTOR_OPTIONS.find((o) => o.value === state.sector)?.labelKey ?? 'sectorSaas'),
              multiple: STARTUP_SECTOR_EXIT_MULTIPLES[state.sector],
            })}
          </p>

          {/* Live cap-table simulator preview — the consortium's "if you
              raise €X you dilute Y%" line, computed against the VC-leg
              pre-money so the founder gets instant feedback. The full
              report uses the BLENDED pre-money. */}
          {liveVcPreview && liveVcPreview.investment > 0 && liveVcPreview.pre > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="rounded-lg border border-primary/30 bg-primary/[0.04] p-3"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                {t('capTableSimulatorTitle')}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-foreground">
                {t.rich('capTableSimulatorLine', {
                  amount: `€${Math.round(liveVcPreview.investment).toLocaleString(safeTotalLocale)}`,
                  preMoney: `€${Math.round(liveVcPreview.pre).toLocaleString(safeTotalLocale)}`,
                  dilution: liveVcPreview.dilution.toFixed(1),
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </p>
              <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
                {t('capTableSimulatorDisclaimer')}
              </p>
            </motion.div>
          )}

          {/* "Asking too much" warning — fires when the consortium VC
              formula clamps pre-money to 0 because investment > post.
              Without this, the founder watches their VC valuation
              silently disappear from the live preview without knowing
              why. The fix is actionable: lower the round, or push Y5
              projection / multiple. Mirrors the same warning that
              appears on the report so there are no surprises. */}
          {liveVcPreview && liveVcPreview.investment > 0 && liveVcPreview.pre <= 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="rounded-lg border border-amber-400/60 bg-amber-50/60 p-3 dark:border-amber-500/40 dark:bg-amber-950/20"
              role="alert"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                {t('vcOversubscribedTitle')}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-foreground">
                {t.rich('vcOversubscribedLine', {
                  amount: `€${Math.round(liveVcPreview.investment).toLocaleString(safeTotalLocale)}`,
                  postMoney: `€${Math.round(liveVcPreview.post).toLocaleString(safeTotalLocale)}`,
                  shortfall: `€${Math.round(liveVcPreview.investment - liveVcPreview.post).toLocaleString(safeTotalLocale)}`,
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </p>
            </motion.div>
          )}
        </SectionShell>
      )}

      {/* Wizard navigation */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <AuroraButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={goToPrev}
            disabled={step === 1}
          >
            {t('wizardBack')}
          </AuroraButton>
          <span className="text-[11px] font-medium text-muted-foreground">
            {t('wizardStepCounter', { current: step, total: TOTAL_STEPS })}
          </span>
          <AuroraButton
            type="button"
            variant={step === TOTAL_STEPS ? 'ghost' : 'primary'}
            size="sm"
            onClick={goToNext}
            disabled={step === TOTAL_STEPS}
          >
            {t('wizardNext')}
          </AuroraButton>
        </div>
        {/* "Dead-end" prevention on step 3 — the disabled Next button on its
            own reads like the founder is stuck. The hint redirects them to
            the global Calculate button at the bottom of the layout. */}
        {step === TOTAL_STEPS && (
          <p className="text-center text-[11px] leading-tight text-muted-foreground">
            {t('wizardReadyToCalculate')}
          </p>
        )}
      </div>

      {/* Advanced drawer — Scorecard fine-tuning + Cap-table & SAFEs */}
      <section className="space-y-3 rounded-xl border border-foreground/[0.06] bg-background/40 p-4">
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
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-foreground/80">
                {t('advancedScorecardTitle')}
              </h3>
              <SliderRow
                label={t('opportunitySize')}
                value={state.opportunity_size}
                onChange={(v) => state.setField('opportunity_size', v)}
              />
              <SliderRow
                label={t('competitiveEnvironment')}
                value={state.competitive_environment}
                onChange={(v) => state.setField('competitive_environment', v)}
              />
              <SliderRow
                label={t('salesChannels')}
                value={state.sales_marketing_channels}
                onChange={(v) => state.setField('sales_marketing_channels', v)}
              />
              <SliderRow
                label={t('needForFunding')}
                value={state.need_for_additional_funding}
                onChange={(v) => state.setField('need_for_additional_funding', v)}
              />
              <SliderRow
                label={t('otherFactors')}
                value={state.other_factors}
                onChange={(v) => state.setField('other_factors', v)}
              />
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-foreground/80">
                {t('advancedCapTableTitle')}
              </h3>
              {/* GDPR disclosure: cap-table data is sensitive (SAFE
                  amounts, holder identities). The blueprint requires
                  founders can omit it entirely without breaking the
                  valuation — make that explicit on the panel. */}
              <p className="text-[11px] leading-tight text-muted-foreground">
                {t('advancedCapTableGdprNote')}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
