'use client'

/**
 * Belgian SME Audit Panel
 * -----------------------
 * Composite panel that picks up audit-trail surfaces from a method's
 * `details` object and renders them as defensible artefacts:
 *
 *   - SDE bridge ladder       (Reported NI → SDE)
 *   - NAV revaluation log     (per-asset latente belastingen, SME rate trail)
 *   - Real-estate revaluation (book → appraisal swap with auto meerwaarde)
 *   - Equipment revaluation   (economic vs. tax book)
 *   - Deal structure compare  (Aandelen vs. Handelsfonds)
 *
 * The component is designed to be drop-in: it reads the canonical engine
 * keys (no transformation in upstream callers) and renders only the
 * subsections that have data. Safe to embed multiple times in the page.
 */

import type { ReactNode } from 'react'
import {
  type DealScenario,
  type DealStructureComparison,
  type DeferredTaxBreakdownRow,
  NavRevaluationAuditLog,
  type RealEstateRevaluation,
  SdeBridgeLadder,
  type SdeBridgeRow,
  type SmeEligibilityPayload,
} from './'
import { useManualPreviewFormatters } from '@/lib/omniPreview'

export interface BelgianSmeAuditPanelProps {
  /**
   * Method-result details. The shape follows the engine's response:
   *  - SDE step:  { sde_bridge: [...], owner_role?: 'working' | 'passive' }
   *  - NAV step:  { deferred_tax_breakdown, sme_eligibility,
   *                 real_estate_revaluation, equipment_revaluation,
   *                 deal_structure_comparison }
   */
  details?: Record<string, unknown> | null
  className?: string
  /** Title override — defaults to "Audit trail". */
  title?: string
}

type EquipmentRevaluation = {
  original_cost?: number | null
  acquisition_year?: number | null
  age_years?: number | null
  economic_useful_life_years?: number | null
  tax_book_value?: number | null
  economic_book_value?: number | null
  meerwaarde?: number | null
  method?: string | null
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

function toNumber(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function BelgianSmeAuditPanel({
  details,
  className,
  title,
}: BelgianSmeAuditPanelProps) {
  const { currency } = useManualPreviewFormatters()
  const d = isObject(details) ? details : null

  if (!d) return null

  const sdeBridge = Array.isArray(d.sde_bridge) ? (d.sde_bridge as SdeBridgeRow[]) : null
  const ownerRole =
    d.owner_role === 'working' || d.owner_role === 'passive'
      ? (d.owner_role as 'working' | 'passive')
      : undefined

  const breakdown = Array.isArray(d.deferred_tax_breakdown)
    ? (d.deferred_tax_breakdown as DeferredTaxBreakdownRow[])
    : null

  const smeEligibility =
    isObject(d.sme_eligibility) &&
    typeof (d.sme_eligibility as Record<string, unknown>).is_eligible === 'boolean'
      ? ({
          is_eligible: Boolean(
            (d.sme_eligibility as Record<string, unknown>).is_eligible
          ),
          rate_pct: Number((d.sme_eligibility as Record<string, unknown>).rate_pct ?? 25),
          reasons: Array.isArray((d.sme_eligibility as Record<string, unknown>).reasons)
            ? ((d.sme_eligibility as Record<string, unknown>).reasons as string[])
            : [],
        } satisfies SmeEligibilityPayload)
      : null

  const realEstate =
    isObject(d.real_estate_revaluation) &&
    toNumber((d.real_estate_revaluation as Record<string, unknown>).book_value) != null
      ? ({
          book_value: Number(
            (d.real_estate_revaluation as Record<string, unknown>).book_value
          ),
          appraisal_value: Number(
            (d.real_estate_revaluation as Record<string, unknown>).appraisal_value
          ),
          meerwaarde: Number(
            (d.real_estate_revaluation as Record<string, unknown>).meerwaarde
          ),
        } satisfies RealEstateRevaluation)
      : null

  const equipment = isObject(d.equipment_revaluation)
    ? (d.equipment_revaluation as EquipmentRevaluation)
    : null

  const dealComparison = parseDealStructureComparison(d.deal_structure_comparison)

  const taxLatencyDeduction = toNumber(d.tax_latency_deduction)
  const effectiveRatePct = toNumber(d.effective_tax_latency_pct)

  const sectionsToRender: Array<{ key: string; node: ReactNode }> = []

  if (sdeBridge && sdeBridge.length > 0) {
    sectionsToRender.push({
      key: 'sde-bridge',
      node: <SdeBridgeLadder rows={sdeBridge} ownerRole={ownerRole} />,
    })
  }

  if (realEstate || equipment || breakdown || smeEligibility) {
    sectionsToRender.push({
      key: 'nav-audit',
      node: (
        <div className="space-y-3">
          {equipment ? <EquipmentRevaluationCard equipment={equipment} /> : null}
          <NavRevaluationAuditLog
            breakdown={breakdown ?? undefined}
            smeEligibility={smeEligibility ?? undefined}
            realEstate={realEstate ?? undefined}
            effectiveRatePct={effectiveRatePct}
            taxLatencyDeduction={taxLatencyDeduction}
          />
        </div>
      ),
    })
  }

  if (dealComparison) {
    sectionsToRender.push({
      key: 'deal-structure',
      node: <DealStructureReadout comparison={dealComparison} currency={currency} />,
    })
  }

  if (sectionsToRender.length === 0) return null

  return (
    <section className={`space-y-4 ${className ?? ''}`} aria-label="Belgian SME audit panel">
      {title ? (
        <header>
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-foreground/70">
            {title}
          </h3>
        </header>
      ) : null}
      {sectionsToRender.map(({ key, node }) => (
        <div key={key}>{node}</div>
      ))}
    </section>
  )
}

function EquipmentRevaluationCard({ equipment }: { equipment: EquipmentRevaluation }) {
  const { currency } = useManualPreviewFormatters()
  const meerwaarde = toNumber(equipment.meerwaarde)
  return (
    <section
      className="rounded-xl border border-foreground/[0.08] bg-background"
      aria-label="Equipment revaluation"
    >
      <header className="border-b border-foreground/[0.06] px-4 py-3">
        <h4 className="text-[12px] font-semibold uppercase tracking-wide text-foreground/65">
          Equipment / PP&E revaluation
        </h4>
        <p className="mt-0.5 text-[11px] leading-snug text-foreground/50">
          {equipment.method === 'user_supplied_economic_book'
            ? 'User-supplied economic book value.'
            : `Straight-line economic depreciation${
                equipment.age_years != null
                  ? ` — age ${equipment.age_years}y / life ${equipment.economic_useful_life_years ?? '?'}y`
                  : ''
              }.`}
        </p>
      </header>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 text-[12px]">
        <Stat
          label="Original cost"
          value={equipment.original_cost != null ? currency.format(Number(equipment.original_cost)) : '—'}
        />
        <Stat
          label="Tax book"
          value={equipment.tax_book_value != null ? currency.format(Number(equipment.tax_book_value)) : '—'}
        />
        <Stat
          label="Economic book"
          value={equipment.economic_book_value != null ? currency.format(Number(equipment.economic_book_value)) : '—'}
        />
        <Stat
          label="Meerwaarde"
          value={meerwaarde != null ? currency.format(meerwaarde) : '—'}
          tone={meerwaarde != null && meerwaarde >= 0 ? 'positive' : meerwaarde != null ? 'negative' : undefined}
        />
      </dl>
    </section>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'positive' | 'negative'
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-foreground/45">{label}</dt>
      <dd
        className={`mt-0.5 tabular-nums font-semibold ${
          tone === 'positive'
            ? 'text-emerald-600'
            : tone === 'negative'
              ? 'text-rose-500'
              : 'text-foreground/85'
        }`}
      >
        {value}
      </dd>
    </div>
  )
}

function parseDealStructureComparison(raw: unknown): DealStructureComparison | null {
  if (!isObject(raw)) return null
  const share = parseDealScenario(raw.share_deal)
  const asset = parseDealScenario(raw.asset_deal)
  if (!share || !asset) return null
  return {
    share_deal: share,
    asset_deal: asset,
    indifference_premium: Number(raw.indifference_premium ?? 0),
    recommendation: typeof raw.recommendation === 'string' ? raw.recommendation : '',
    inputs: isObject(raw.inputs) ? raw.inputs : undefined,
  }
}

function parseDealScenario(raw: unknown): DealScenario | null {
  if (!isObject(raw)) return null
  return {
    label: typeof raw.label === 'string' ? raw.label : '',
    headline_price: Number(raw.headline_price ?? 0),
    seller_tax: Number(raw.seller_tax ?? 0),
    seller_net_proceeds: Number(raw.seller_net_proceeds ?? 0),
    buyer_tax_shield_npv: Number(raw.buyer_tax_shield_npv ?? 0),
    buyer_net_cost: Number(raw.buyer_net_cost ?? 0),
    notes: Array.isArray(raw.notes) ? (raw.notes as string[]) : [],
  }
}

function DealStructureReadout({
  comparison,
  currency,
}: {
  comparison: DealStructureComparison
  currency: { format: (n: number) => string }
}) {
  return (
    <section
      className="rounded-xl border border-foreground/[0.08] bg-background"
      aria-label="Deal structure comparison"
    >
      <header className="border-b border-foreground/[0.06] px-4 py-3">
        <h4 className="text-[12px] font-semibold uppercase tracking-wide text-foreground/65">
          Deal structure — Aandelen vs. Handelsfonds
        </h4>
        <p className="mt-0.5 text-[11px] leading-snug text-foreground/50">
          Engine-computed comparison including goodwill amortisation tax shield.
        </p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 py-3">
        {[comparison.share_deal, comparison.asset_deal].map((scenario) => (
          <article
            key={scenario.label}
            className="rounded-lg border border-foreground/[0.06] bg-foreground/[0.02] px-3 py-2.5"
          >
            <h5 className="text-[12px] font-semibold text-foreground/85">{scenario.label}</h5>
            <dl className="mt-2 space-y-1 text-[11px]">
              <ScenarioRow label="Headline price" value={currency.format(scenario.headline_price)} />
              <ScenarioRow
                label="Seller tax"
                value={`−${currency.format(scenario.seller_tax)}`}
                tone="negative"
              />
              <ScenarioRow
                label="Seller net proceeds"
                value={currency.format(scenario.seller_net_proceeds)}
                emphasised
              />
              <ScenarioRow
                label="Buyer tax shield NPV"
                value={
                  scenario.buyer_tax_shield_npv === 0
                    ? '—'
                    : `+${currency.format(scenario.buyer_tax_shield_npv)}`
                }
                tone={scenario.buyer_tax_shield_npv > 0 ? 'positive' : undefined}
              />
              <ScenarioRow
                label="Buyer net cost"
                value={currency.format(scenario.buyer_net_cost)}
                emphasised
              />
            </dl>
          </article>
        ))}
      </div>
      <footer className="border-t border-foreground/[0.06] bg-primary/[0.04] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-primary/80">
            Indifference premium
          </span>
          <span className="tabular-nums text-[13px] font-semibold text-primary">
            {currency.format(comparison.indifference_premium)}
          </span>
        </div>
        {comparison.recommendation ? (
          <p className="mt-1 text-[11px] leading-snug text-foreground/65">
            {comparison.recommendation}
          </p>
        ) : null}
      </footer>
    </section>
  )
}

function ScenarioRow({
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
