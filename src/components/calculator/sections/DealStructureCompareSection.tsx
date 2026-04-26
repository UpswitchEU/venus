'use client'

/**
 * Deal Structure Comparison
 * -------------------------
 * Renders the asset-vs-share deal comparison returned by the engine
 * (`details.deal_structure_comparison`) and exposes the inputs that
 * drive it: deal type selector, goodwill amount, seller-side flags and
 * buyer's discount rate for the goodwill amortisation tax-shield NPV.
 */

import { useManualPreviewFormatters } from '@/lib/omniPreview'
import { CurrencyInput } from '../CurrencyInput'

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
  inputs: DealStructureInputs
  comparison?: DealStructureComparison | null
  onChange: (field: string, value: unknown) => void
  disabled?: boolean
  className?: string
}

export function DealStructureCompareSection({
  inputs,
  comparison,
  onChange,
  disabled,
  className,
}: DealStructureCompareSectionProps) {
  const { currency } = useManualPreviewFormatters()
  const dealType = inputs.dealType ?? 'compare'

  return (
    <section
      className={`rounded-xl border border-foreground/[0.08] bg-background ${className ?? ''}`}
      aria-label="Deal structure comparison"
    >
      <header className="border-b border-foreground/[0.06] px-4 py-3">
        <h4 className="text-[12px] font-semibold uppercase tracking-wide text-foreground/65">
          Deal structure — Aandelen vs. Handelsfonds
        </h4>
        <p className="mt-0.5 text-[11px] leading-snug text-foreground/50">
          Compare share deal vs. asset deal economics including goodwill amortisation tax shield (Art.
          61 WIB 92) and private-shareholder capital-gains tax (Art. 90 WIB 92, 10% from 01/01/2026).
        </p>
      </header>

      <fieldset className="grid grid-cols-3 gap-2 px-4 py-3">
        <legend className="sr-only">Deal type</legend>
        {(['share', 'asset', 'compare'] as const).map((opt) => {
          const selected = dealType === opt
          const label =
            opt === 'share' ? 'Aandelen' : opt === 'asset' ? 'Handelsfonds' : 'Compare'
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
                name="deal-type"
                value={opt}
                className="sr-only"
                checked={selected}
                disabled={disabled}
                onChange={() => onChange('deal_type', opt)}
              />
              <span className="text-[12px] font-semibold text-foreground/85">{label}</span>
            </label>
          )
        })}
      </fieldset>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 pb-3">
        <CurrencyInput
          label="Goodwill paid in asset deal"
          value={inputs.goodwillAmount}
          onChange={(v) => onChange('deal_goodwill_amount', v)}
          size="sm"
          placeholder="Auto = headline − book equity"
          disabled={disabled}
          truncateLabel={false}
        />
        <CurrencyInput
          label="Seller's share basis (cost)"
          value={inputs.sellerShareBasis}
          onChange={(v) => onChange('deal_seller_share_basis', v)}
          size="sm"
          placeholder="0"
          disabled={disabled}
          truncateLabel={false}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/55">
            Buyer discount rate (%)
          </span>
          <input
            type="number"
            step="0.5"
            min={0}
            max={50}
            value={inputs.buyerDiscountRatePct ?? ''}
            onChange={(e) =>
              onChange(
                'deal_buyer_discount_rate_pct',
                e.target.value === '' ? undefined : Number(e.target.value)
              )
            }
            placeholder="10"
            disabled={disabled}
            className="rounded-lg border border-foreground/[0.12] bg-background px-2.5 py-1.5 text-[13px] tabular-nums focus:border-primary/60 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/55">
            Registration duty on movables (%)
          </span>
          <input
            type="number"
            step="0.1"
            min={0}
            max={20}
            value={inputs.registrationDutyPct ?? ''}
            onChange={(e) =>
              onChange(
                'deal_registration_duty_pct',
                e.target.value === '' ? undefined : Number(e.target.value)
              )
            }
            placeholder="0"
            disabled={disabled}
            className="rounded-lg border border-foreground/[0.12] bg-background px-2.5 py-1.5 text-[13px] tabular-nums focus:border-primary/60 focus:outline-none"
          />
        </label>
        <label className="col-span-1 sm:col-span-2 flex items-center gap-2 rounded-lg border border-foreground/[0.08] px-3 py-2">
          <input
            type="checkbox"
            checked={inputs.sellerIsIndividual ?? true}
            disabled={disabled}
            onChange={(e) => onChange('deal_seller_is_individual', e.target.checked)}
            className="h-3.5 w-3.5"
          />
          <span className="text-[12px] text-foreground/75">
            Seller is a natural person (private shareholder)
          </span>
        </label>
      </div>

      {comparison ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-foreground/[0.06] bg-foreground/[0.02] px-4 py-3">
          {([comparison.share_deal, comparison.asset_deal] as const).map((scenario) => (
            <article
              key={scenario.label}
              className="rounded-lg border border-foreground/[0.06] bg-background px-3 py-2.5"
            >
              <h5 className="text-[12px] font-semibold text-foreground/85">{scenario.label}</h5>
              <dl className="mt-2 space-y-1 text-[11px]">
                <Row label="Headline price" value={currency.format(scenario.headline_price)} />
                <Row
                  label="Seller tax"
                  value={`−${currency.format(scenario.seller_tax)}`}
                  tone="negative"
                />
                <Row
                  label="Seller net proceeds"
                  value={currency.format(scenario.seller_net_proceeds)}
                  emphasised
                />
                <Row
                  label="Buyer tax shield NPV"
                  value={
                    scenario.buyer_tax_shield_npv === 0
                      ? '—'
                      : `+${currency.format(scenario.buyer_tax_shield_npv)}`
                  }
                  tone={scenario.buyer_tax_shield_npv > 0 ? 'positive' : undefined}
                />
                <Row
                  label="Buyer net cost"
                  value={currency.format(scenario.buyer_net_cost)}
                  emphasised
                />
              </dl>
              {scenario.notes.length ? (
                <ul className="mt-2 space-y-0.5 text-[10.5px] leading-snug text-foreground/50">
                  {scenario.notes.map((note, idx) => (
                    <li key={idx} className="flex gap-1.5">
                      <span className="text-foreground/35">•</span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
          <div className="sm:col-span-2 rounded-lg border border-primary/30 bg-primary/[0.04] px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-primary/80">
                Indifference premium
              </span>
              <span className="tabular-nums text-[13px] font-semibold text-primary">
                {currency.format(comparison.indifference_premium)}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-foreground/65">
              {comparison.recommendation}
            </p>
          </div>
        </div>
      ) : (
        <p className="border-t border-foreground/[0.06] px-4 py-3 text-[11px] text-foreground/50">
          Run the calculation with deal type = "Compare" to see both scenarios.
        </p>
      )}
    </section>
  )
}

function Row({
  label,
  value,
  emphasised,
  tone,
}: {
  label: string
  value: string
  emphasised?: boolean
  tone?: 'positive' | 'negative'
}) {
  const valueClass =
    tone === 'positive'
      ? 'text-emerald-600'
      : tone === 'negative'
        ? 'text-rose-500'
        : emphasised
          ? 'font-semibold text-foreground/85'
          : 'text-foreground/75'
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-foreground/55">{label}</dt>
      <dd className={`tabular-nums ${valueClass}`}>{value}</dd>
    </div>
  )
}
