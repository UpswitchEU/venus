'use client'

import { motion } from 'framer-motion'
import { Wand2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type ReactNode, useCallback, useMemo, useState } from 'react'
import { cn } from '@/design-system/utils'
import {
  countFilledNavProgressFields,
  NAV_SECTOR_DEFAULTS,
  type NavBookReferenceSnapshot,
  type NavPrefillProvenanceMap,
  resolveNavSectorKey,
  useManualPreviewFormatters,
} from '@/lib/omniPreview'
import { CurrencyInput } from '../CurrencyInput'
import { AdaptivePercentInput } from './AdaptivePercentInput'
import { PrefilledBadge } from './PrefilledBadge'
import { ValuationSectionHeader } from './ValuationSectionHeader'

function NavPanel({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="rounded-xl border border-primary/10 bg-primary/[0.03] p-3 space-y-3">
      <div className="space-y-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/60">
          {title}
        </h4>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  )
}

/**
 * "Book: €X" chip — read-only anchor next to an adjustment input so the
 * user can see the magnitude they're correcting without context-switching
 * back to the balance sheet. Round-2 fix B7 / book-reference anchoring.
 */
function BookReferenceChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-foreground/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-foreground/55 tabular-nums">
      <span className="uppercase tracking-wide text-[9px] text-foreground/45">{label}</span>
      {value}
    </span>
  )
}

interface NavAssetScheduleSectionProps {
  step: number
  navRealEstateAdjustment?: number
  navInventoryAdjustment?: number
  navHiddenReserves?: number
  navGoodwillWriteoff?: number
  navReceivablesAdjustment?: number
  navOtherRevaluations?: number
  navTaxLatencyPct?: number
  navOffBalanceItems?: number
  totalAssets?: number
  totalLiabilities?: number
  businessType?: string | null
  countryCode?: string
  /**
   * Side-input revaluations from the dedicated subsections — feed the
   * live-preview formula so the displayed estimated NAV reflects the
   * appraisal swap and equipment lifespan in addition to the schedule
   * deltas. Round-1 fix B6.
   */
  realEstateAppraisalMeerwaarde?: number | null
  equipmentRevaluationMeerwaarde?: number | null
  /**
   * When true, the real-estate book→appraisal swap (in
   * NavRealEstateAppraisalSection) has live values. The schedule's flat
   * `nav_real_estate_adjustment` field becomes a duplicate input in that
   * case, so we hide it and surface a read-only "Real estate uplift: €X
   * (from appraisal)" line that points the user at the canonical input.
   * Round-1 fix B3.
   */
  hasRealEstateAppraisalSwap?: boolean
  /**
   * Reference book values (inventory, receivables, goodwill, book equity)
   * surfaced inline on the corresponding adjustment inputs. NOT prefilled
   * into form state — the form fields are *deltas*. Round-2 fix B7.
   */
  bookReferences?: NavBookReferenceSnapshot
  /**
   * Provenance map for fields auto-derived by `computeNavPrefill`. When a
   * field is in this map AND the user has not yet edited it, the UI
   * surfaces a "Prefilled" badge so trust is explicit. Round-2 prefill.
   */
  prefillProvenance?: NavPrefillProvenanceMap
  /**
   * Per-asset deferred-tax rate overrides. Engine already accepts these
   * on the calculate request via `nav_per_asset_tax_rates`. The
   * collapsible "Advanced — per-asset rates" disclosure (round-3 fix B4)
   * surfaces them as five individual % inputs so an M&A advisor can
   * model BE participation-exemption (real-estate share = 0%), tax-loss
   * carryforwards on receivables write-downs, etc. without the
   * blunt-instrument single global rate.
   */
  perAssetTaxRates?: {
    real_estate?: number
    inventory?: number
    receivables?: number
    hidden_reserves?: number
    other_revaluations?: number
  }
  /**
   * Patch handler for per-asset rates. Receives the partial nested
   * object that should merge into `formData.nav_per_asset_tax_rates`.
   */
  onPerAssetTaxRateChange?: (
    patch: NonNullable<NavAssetScheduleSectionProps['perAssetTaxRates']>
  ) => void
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
}

export function NavAssetScheduleSection({
  step,
  navRealEstateAdjustment,
  navInventoryAdjustment,
  navHiddenReserves,
  navGoodwillWriteoff,
  navReceivablesAdjustment,
  navOtherRevaluations,
  navTaxLatencyPct,
  navOffBalanceItems,
  totalAssets,
  totalLiabilities,
  businessType,
  countryCode,
  realEstateAppraisalMeerwaarde,
  equipmentRevaluationMeerwaarde,
  hasRealEstateAppraisalSwap,
  bookReferences,
  prefillProvenance,
  perAssetTaxRates,
  onPerAssetTaxRateChange,
  onFieldChange,
  disabled,
}: NavAssetScheduleSectionProps) {
  const t = useTranslations('manualInput.methodSelector')
  const { currency: currencyFormatter } = useManualPreviewFormatters()

  const inputs = useMemo(
    () => ({
      navRealEstateAdjustment,
      navInventoryAdjustment,
      navHiddenReserves,
      navGoodwillWriteoff,
      navReceivablesAdjustment,
      navOtherRevaluations,
      navTaxLatencyPct,
      navOffBalanceItems,
    }),
    [
      navRealEstateAdjustment,
      navInventoryAdjustment,
      navHiddenReserves,
      navGoodwillWriteoff,
      navReceivablesAdjustment,
      navOtherRevaluations,
      navTaxLatencyPct,
      navOffBalanceItems,
    ]
  )

  // `sectionComplete` drives only the section-header check icon (data
  // affordance — "you've filled at least one field").  Anything beyond
  // that (progress bar / readiness narrative) lives in the report.
  const filledCount = useMemo(() => countFilledNavProgressFields(inputs), [inputs])
  const sectionComplete = filledCount > 0

  // Book-equity available only for the confidence chip ("Mostly
  // prefilled" requires a known book equity). NOT used for any
  // computation surfaced as a number on the panel.
  const bookEquity = bookReferences?.bookEquity ?? null

  // ── Inventory / receivables book-value chips ────────────────────────
  // These ARE input aids — anchor the user's typed adjustment so they
  // know the magnitude they're correcting. Locale-aware via the same
  // formatter as everywhere else.
  const inventoryRef = bookReferences?.inventory
  const receivablesRef = bookReferences?.accountsReceivable
  const goodwillRef = bookReferences?.goodwill

  const taxLatencyPrefilled =
    prefillProvenance?.nav_tax_latency_pct != null && navTaxLatencyPct != null

  // ── Quick-start: NACE sector defaults ───────────────────────────────
  // Restore the main-branch CTA that seeds the schedule with sector-typical
  // zeros for fields that are usually irrelevant (e.g. retail → no real
  // estate uplift, services → no inventory). Only shown when the form is
  // still empty AND we can resolve a sector — otherwise the button does
  // nothing useful.
  const sectorKey = useMemo(() => resolveNavSectorKey(businessType), [businessType])
  const sectorDefaults = sectorKey ? NAV_SECTOR_DEFAULTS[sectorKey] : undefined
  const canApplySectorDefaults = sectorDefaults != null && filledCount === 0
  const applySectorDefaults = useCallback(() => {
    if (!sectorDefaults) return
    const fieldMap: Record<string, string> = {
      navRealEstateAdjustment: 'nav_real_estate_adjustment',
      navInventoryAdjustment: 'nav_inventory_adjustment',
      navHiddenReserves: 'nav_hidden_reserves',
      navGoodwillWriteoff: 'nav_goodwill_writeoff',
      navReceivablesAdjustment: 'nav_receivables_adjustment',
      navOtherRevaluations: 'nav_other_revaluations',
    }
    for (const [camel, val] of Object.entries(sectorDefaults)) {
      const snakeKey = fieldMap[camel]
      if (snakeKey != null && val != null && Number.isFinite(val)) {
        onFieldChange(snakeKey, val as number)
      }
    }
  }, [sectorDefaults, onFieldChange])

  // Round-3 fix B4: per-asset tax-rate disclosure. Defaults closed
  // because 95% of users want a single rate (the global is fine); the
  // 5% who need precision (BE participation exemption on shares,
  // recoverable VAT on receivables write-down, etc.) get a one-click
  // expansion with five individual % inputs that map directly to the
  // engine's `nav_per_asset_tax_rates` shape.
  const [perAssetRatesOpen, setPerAssetRatesOpen] = useState(
    () =>
      // Auto-open when ANY per-asset override is already set (e.g.
      // session-restored from a saved valuation).
      perAssetTaxRates != null &&
      Object.values(perAssetTaxRates).some((v) => v != null && Number.isFinite(v))
  )
  const perAssetRateKeys = [
    'real_estate',
    'inventory',
    'receivables',
    'hidden_reserves',
    'other_revaluations',
  ] as const

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
        complete={sectionComplete}
        title={t('sections.navAssetSchedule')}
      />

      {/*
        Quick-start CTA — restored 2026-05-12.
        Seeds zero values for the schedule fields that are typically
        irrelevant for the resolved sector (retail → no real estate,
        services → no inventory, …). One click acknowledges those fields
        so the user only fills the boxes that actually matter. We hide it
        once any field has a value to keep the panel uncluttered for the
        editing flow.
      */}
      {canApplySectorDefaults && (
        <button
          type="button"
          onClick={applySectorDefaults}
          disabled={disabled}
          className={cn(
            'group flex w-full items-center gap-2 rounded-xl border border-primary/20',
            'bg-primary/[0.04] px-3 py-2.5 text-left text-[12px]',
            'transition-colors hover:border-primary/40 hover:bg-primary/[0.08]',
            'focus:outline-none focus:ring-2 focus:ring-primary/30',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          <Wand2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span className="flex-1">
            <span className="block font-semibold text-foreground/85">
              {t('sections.navDefaultsButtonTitle', { sector: sectorKey ?? '' })}
            </span>
            <span className="mt-0.5 block text-[11px] leading-snug text-foreground/55">
              {t('sections.navDefaultsButtonDescription')}
            </span>
          </span>
        </button>
      )}

      {/* Section quickstart panel removed 2026-05-10 — the "Recommended
          for NAV" chip, the data-source-confidence chip, the navLead /
          navQuickStart explainer paragraphs, the progress bar with
          filledCount counter, and the "minimum X fields" coaching note
          were all advisor narrative, not data input.  Methodology copy
          (asset uplift / working-capital / deductions framing) lives in
          `templates/main_report/pages/adjusted_nav_valuation.html`
          (`t.nav_methodology_intro`).  The form is for data only —
          fields below are the input. */}

      {/*
        Round-2 fix B2: schedule restructured into the engine's mental
        model — three panels that map 1:1 to how `_apply_nav_channel`
        composes the bridge.

          Panel A — Asset uplifts (positive revaluations):
            real estate, hidden reserves, other revaluations
            → contribute to gross corrections AND to the tax latency base

          Panel B — Working-capital corrections (typically conservative):
            inventory NRV, receivables provision
            → adjust the running NAV, positive amounts grow the tax base

          Panel C — Deductions (always subtracted):
            goodwill writeoff (intangible impairment),
            tax latency %,
            off-balance obligations

        Off-balance moves OUT of panel A (it's a deduction, not an
        uplift), goodwill moves IN to deductions (it's always negative
        for NAV purposes — a writedown of an intangible carried at cost).
        Order within each panel is most-likely-impactful first so the
        progress bar fills fastest from the top.
      */}
      <NavPanel title={t('navPanels.upliftsTitle')} description={t('navPanels.upliftsDescription')}>
        <div className="grid grid-cols-1 gap-3">
          {hasRealEstateAppraisalSwap ? (
            // Round-1 fix B3: when the user has filled the dedicated
            // book→appraisal swap below, this delta becomes a duplicate
            // input. Replace with a read-only line that points at the
            // canonical artefact so we never double-count and never
            // confuse the user with two stale values.
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground/75">
                  {t('fields.navRealEstateAdjustment')}
                </span>
                <span className="tabular-nums font-semibold text-emerald-700">
                  {realEstateAppraisalMeerwaarde != null
                    ? currencyFormatter.format(realEstateAppraisalMeerwaarde)
                    : '—'}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-foreground/55">
                {t('fields.navRealEstateAdjustmentFromAppraisal')}
              </p>
            </div>
          ) : (
            <CurrencyInput
              label={t('fields.navRealEstateAdjustment')}
              value={navRealEstateAdjustment}
              onChange={(v) => onFieldChange('nav_real_estate_adjustment', v)}
              size="sm"
              placeholder="0"
              disabled={disabled}
              description={t('fields.navRealEstateAdjustmentDesc')}
              truncateLabel={false}
            />
          )}
          <CurrencyInput
            label={t('fields.navHiddenReserves')}
            value={navHiddenReserves}
            onChange={(v) => onFieldChange('nav_hidden_reserves', v)}
            size="sm"
            placeholder="0"
            disabled={disabled}
            description={t('fields.navHiddenReservesDesc')}
            truncateLabel={false}
          />
          <CurrencyInput
            label={t('fields.navOtherRevaluations')}
            value={navOtherRevaluations}
            onChange={(v) => onFieldChange('nav_other_revaluations', v)}
            size="sm"
            placeholder="0"
            disabled={disabled}
            description={t('fields.navOtherRevaluationsDesc')}
            truncateLabel={false}
          />
        </div>
      </NavPanel>

      <NavPanel
        title={t('navPanels.workingCapitalTitle')}
        description={t('navPanels.workingCapitalDescription')}
      >
        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-1">
            <CurrencyInput
              label={t('fields.navInventoryAdjustment')}
              value={navInventoryAdjustment}
              onChange={(v) => onFieldChange('nav_inventory_adjustment', v)}
              size="sm"
              placeholder="0"
              disabled={disabled}
              allowNegative
              description={t('fields.navInventoryAdjustmentDesc')}
              truncateLabel={false}
            />
            {inventoryRef != null && (
              <BookReferenceChip
                label={t('bookRef.label')}
                value={currencyFormatter.format(inventoryRef)}
              />
            )}
          </div>
          <div className="space-y-1">
            <CurrencyInput
              label={t('fields.navReceivablesAdjustment')}
              value={navReceivablesAdjustment}
              onChange={(v) => onFieldChange('nav_receivables_adjustment', v)}
              size="sm"
              placeholder="0"
              disabled={disabled}
              allowNegative
              description={t('fields.navReceivablesAdjustmentDesc')}
              truncateLabel={false}
            />
            {receivablesRef != null && (
              <BookReferenceChip
                label={t('bookRef.label')}
                value={currencyFormatter.format(receivablesRef)}
              />
            )}
          </div>
        </div>
      </NavPanel>

      <NavPanel
        title={t('navPanels.deductionsTitle')}
        description={t('navPanels.deductionsDescription')}
      >
        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-1">
            <CurrencyInput
              label={t('fields.navGoodwillWriteoff')}
              value={navGoodwillWriteoff}
              onChange={(v) => onFieldChange('nav_goodwill_writeoff', v)}
              size="sm"
              placeholder="0"
              disabled={disabled}
              description={t('fields.navGoodwillWriteoffDesc')}
              truncateLabel={false}
            />
            {goodwillRef != null && goodwillRef > 0 && (
              <BookReferenceChip
                label={t('bookRef.label')}
                value={currencyFormatter.format(goodwillRef)}
              />
            )}
          </div>
          <div className="space-y-1">
            <AdaptivePercentInput
              label={t('fields.navTaxLatencyPct')}
              value={navTaxLatencyPct}
              onChange={(v) => onFieldChange('nav_tax_latency_pct', v)}
              placeholder={countryCode?.startsWith('BE') ? '25' : '0'}
              disabled={disabled}
              description={t('fields.navTaxLatencyPctDesc')}
              truncateLabel={false}
              trailingLabelAccessory={
                taxLatencyPrefilled ? <PrefilledBadge label={t('prefill.badge')} /> : undefined
              }
            />
          </div>

          {/*
            Round-3 fix B4: per-asset tax-rate disclosure. Defaults
            closed; opens automatically when overrides are already set.
            Maps to engine `nav_per_asset_tax_rates`. Users who want
            precision (BE participation exemption: real-estate share = 0%,
            recoverable VAT on doubtful receivables, etc.) get five
            inputs without cluttering the default-rate path.
          */}
          {onPerAssetTaxRateChange && (
            <div className="rounded-lg border border-foreground/[0.08] bg-foreground/[0.015]">
              <button
                type="button"
                onClick={() => setPerAssetRatesOpen((open) => !open)}
                aria-expanded={perAssetRatesOpen}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] font-medium text-foreground/65 transition-colors hover:bg-foreground/[0.03]"
              >
                <span>{t('fields.navPerAssetTaxRatesTitle')}</span>
                <span className="text-[10px] text-foreground/45 tabular-nums" aria-hidden="true">
                  {perAssetRatesOpen ? '−' : '+'}
                </span>
              </button>
              {perAssetRatesOpen && (
                <div className="space-y-2 border-t border-foreground/[0.06] px-3 pb-3 pt-2">
                  <p className="text-[10.5px] leading-snug text-foreground/55">
                    {t('fields.navPerAssetTaxRatesDescription')}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {perAssetRateKeys.map((key) => (
                      <AdaptivePercentInput
                        key={key}
                        label={t(`fields.navPerAssetTaxRate.${key}`)}
                        value={perAssetTaxRates?.[key]}
                        onChange={(v) => onPerAssetTaxRateChange({ [key]: v })}
                        placeholder={navTaxLatencyPct != null ? String(navTaxLatencyPct) : '—'}
                        disabled={disabled}
                        truncateLabel={false}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <CurrencyInput
            label={t('fields.navOffBalanceItems')}
            value={navOffBalanceItems}
            onChange={(v) => onFieldChange('nav_off_balance_items', v)}
            size="sm"
            placeholder="0"
            disabled={disabled}
            description={t('fields.navOffBalanceItemsDesc')}
            truncateLabel={false}
          />
        </div>
      </NavPanel>

      {/*
        Round-4 audit: schedule-summary preview cards (book-equity
        anchor / sum of adjustments / tax-latency deduction / estimated
        NAV with uplift hint) were removed. The left panel is for data
        input — the corrected NAV bridge, intrinsic-value summary card
        and uplift commentary all live in the ValuationIQ report
        (`adjusted_nav_valuation.html`, screen + PDF). Surfacing them
        here duplicated the report and made the panel feel like a
        mini-dashboard. The book-reference chips and per-field meerwaarde
        previews stay because they're input *validation* — they confirm
        what the user just typed before submit.
      */}
    </motion.section>
  )
}
