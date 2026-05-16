'use client'

/**
 * Deal Structure Comparison
 * -------------------------
 * Renders the asset-vs-share deal comparison returned by the engine
 * (`details.deal_structure_comparison`) and exposes the inputs that
 * drive it: deal type selector, goodwill amount, seller-side flags and
 * buyer's discount rate for the goodwill amortisation tax-shield NPV.
 *
 * Round-1 fix B1: i18n + step badge — same `ValuationSectionHeader`
 * rhythm + locale-aware copy as the rest of the left panel.
 */

import { useTranslations } from 'next-intl'
import { useId } from 'react'
import { CurrencyInput } from '../CurrencyInput'
import { AdaptivePercentInput } from './AdaptivePercentInput'
import { PrefilledBadge } from './PrefilledBadge'
import { ValuationSectionHeader } from './ValuationSectionHeader'

export type DealScenario = {
  label: string
  headline_price: number
  seller_tax: number
  seller_net_proceeds: number
  buyer_tax_shield_npv: number
  buyer_net_cost: number
  notes: string[]
}

export type DealStructureComparison = {
  share_deal: DealScenario
  asset_deal: DealScenario
  indifference_premium: number
  recommendation: string
  inputs?: Record<string, unknown>
}

export interface DealStructureInputs {
  dealType?: 'share' | 'asset' | 'compare'
  goodwillAmount?: number
  sellerShareBasis?: number
  sellerIsIndividual?: boolean
  buyerDiscountRatePct?: number
  registrationDutyPct?: number
}

export interface DealStructureCompareSectionProps {
  /** Sub-step indicator (e.g. '5d'). See NavRealEstateAppraisalSection. */
  step: string | number
  inputs: DealStructureInputs
  /**
   * Field-keyed prefill flags. When true AND the user has not edited the
   * field, a "Prefilled" badge is shown on the stacked label so the user
   * knows the value is a system-suggested default they can override.
   */
  prefilled?: Partial<
    Record<
      'deal_type' | 'buyer_discount_rate_pct' | 'registration_duty_pct' | 'seller_is_individual',
      boolean
    >
  >
  onChange: (field: string, value: unknown) => void
  disabled?: boolean
  className?: string
}

export function DealStructureCompareSection({
  step,
  inputs,
  prefilled,
  onChange,
  disabled,
  className,
}: DealStructureCompareSectionProps) {
  const t = useTranslations('manualInput.methodSelector.navDealStructure')
  const tPrefill = useTranslations('manualInput.methodSelector.prefill')
  const dealType = inputs.dealType ?? 'compare'
  // Stable id for the seller-is-individual checkbox so the wrapping
  // `<label>` has an explicit `htmlFor` anchor (DOM nesting alone is
  // valid, but the explicit link reads better for assistive tech and
  // matches the rest of the Aurora Clarity inputs in this section).
  const sellerCheckboxId = useId()
  // Per-instance suffix so multiple sections rendered on the same page
  // (e.g. side-by-side scenario comparison surfaces) don't collide on
  // the radio group name.
  const radioGroupName = `deal-type-${useId()}`

  // Section "complete" once a deal type has been picked AND we have at
  // least one anchor (goodwill OR seller share basis OR buyer discount).
  // Engine-side, the comparison is always computed from the engine's own
  // defaults if the user supplies nothing — so completeness is a UX
  // signal, not a gating signal.
  const sectionComplete =
    !!inputs.dealType &&
    (inputs.goodwillAmount != null ||
      inputs.sellerShareBasis != null ||
      inputs.buyerDiscountRatePct != null)

  return (
    <section className={`mt-6 space-y-4 pt-2 ${className ?? ''}`} aria-label={t('ariaLabel')}>
      <ValuationSectionHeader step={step} complete={sectionComplete} title={t('title')} />

      <div className="rounded-xl border border-foreground/[0.08] bg-background">
        <p className="border-b border-foreground/[0.06] px-4 py-3 text-[11px] leading-snug text-foreground/55">
          {t('description')}
        </p>

        <fieldset className="grid grid-cols-3 gap-2 px-4 py-3">
          <legend className="sr-only">{t('dealTypeLegend')}</legend>
          {(['share', 'asset', 'compare'] as const).map((opt) => {
            const selected = dealType === opt
            return (
              <label
                key={opt}
                className={`cursor-pointer rounded-lg border px-2.5 py-2 text-center transition-colors ${
                  selected
                    ? 'border-primary/60 bg-primary/[0.06]'
                    : 'border-foreground/[0.08] hover:border-foreground/[0.18]'
                } ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
              >
                <input
                  type="radio"
                  name={radioGroupName}
                  value={opt}
                  className="sr-only"
                  checked={selected}
                  disabled={disabled}
                  onChange={() => onChange('deal_type', opt)}
                />
                <span className="text-[12px] font-semibold text-foreground/85">
                  {t(`dealType.${opt}`)}
                </span>
              </label>
            )
          })}
        </fieldset>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 pb-3">
          <CurrencyInput
            id="deal_goodwill_amount"
            name="deal_goodwill_amount"
            label={t('goodwillLabel')}
            value={inputs.goodwillAmount}
            onChange={(v) => onChange('deal_goodwill_amount', v)}
            size="sm"
            placeholder={t('goodwillPlaceholder')}
            disabled={disabled}
            truncateLabel={false}
          />
          <CurrencyInput
            id="deal_seller_share_basis"
            name="deal_seller_share_basis"
            label={t('sellerShareBasisLabel')}
            value={inputs.sellerShareBasis}
            onChange={(v) => onChange('deal_seller_share_basis', v)}
            size="sm"
            placeholder="0"
            disabled={disabled}
            truncateLabel={false}
          />
          <AdaptivePercentInput
            label={t('buyerDiscountRateLabel')}
            value={inputs.buyerDiscountRatePct}
            onChange={(v) => onChange('deal_buyer_discount_rate_pct', v)}
            placeholder="10"
            disabled={disabled}
            truncateLabel={false}
            trailingLabelAccessory={
              prefilled?.buyer_discount_rate_pct ? (
                <PrefilledBadge label={tPrefill('badge')} />
              ) : undefined
            }
          />
          <AdaptivePercentInput
            label={t('registrationDutyLabel')}
            value={inputs.registrationDutyPct}
            onChange={(v) => onChange('deal_registration_duty_pct', v)}
            placeholder="0"
            disabled={disabled}
            truncateLabel={false}
            trailingLabelAccessory={
              prefilled?.registration_duty_pct ? (
                <PrefilledBadge label={tPrefill('badge')} />
              ) : undefined
            }
          />
          <label
            htmlFor={sellerCheckboxId}
            className="col-span-1 sm:col-span-2 flex cursor-pointer items-center gap-2 rounded-lg border border-foreground/[0.08] bg-background px-3 py-2.5 transition-colors hover:border-foreground/[0.18]"
          >
            <input
              id={sellerCheckboxId}
              type="checkbox"
              checked={inputs.sellerIsIndividual ?? true}
              disabled={disabled}
              onChange={(e) => onChange('deal_seller_is_individual', e.target.checked)}
              className="h-4 w-4 rounded border-foreground/[0.2] text-primary focus:ring-2 focus:ring-primary/30 focus:ring-offset-0"
            />
            <span className="flex-1 text-[12px] text-foreground/80">
              {t('sellerIsIndividualLabel')}
            </span>
          </label>
        </div>

        {/*
          Round-4 audit: the comparison-result tiles (Share-Deal vs.
          Asset-Deal headline / seller tax / seller net proceeds / buyer
          tax shield NPV / buyer net cost / indifference premium /
          recommendation) and the run-compare prompt are advisory output.
          They moved to the ValuationIQ report (deal-structure section
          inside the NAV dossier). The left panel keeps only the inputs
          that drive that comparison: deal-type radio, goodwill,
          seller-share basis, buyer-discount %, registration duty,
          seller-is-individual flag.
        */}
      </div>
    </section>
  )
}
