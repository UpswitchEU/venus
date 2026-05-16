'use client'

/**
 * NAV Revaluation Audit Log — DEPRECATED FOR LEFT-PANEL USE
 * ---------------------------------------------------------
 * Renders the per-asset-class deferred-tax breakdown returned by the
 * adjusted-NAV engine (`details.deferred_tax_breakdown`) plus the
 * resolved SME-rate eligibility trail.
 *
 * Round-6 audit: this is **advisory output** — it consumes engine
 * results and renders the defensible per-asset table that a buyer-side
 * accountant signs off on. The data-input/advisory split moved this
 * surface to the ValuationIQ report:
 *
 *   `apps/valuation-iq/src/templates/main_report{,_pdf}/components/_nav_audit_trail.html`
 *
 * The Jinja partial above carries the deferred-tax breakdown, SME-rate
 * eligibility chip, real-estate book→appraisal swap card, and equipment
 * lifespan card with full locale support. It's the canonical renderer.
 *
 * This component is kept in the tree (and its data shapes
 * `DeferredTaxBreakdownRow`, `RealEstateRevaluation`,
 * `SmeEligibilityPayload` are still exported from the sections barrel)
 * because Venus still consumes the types in helpers and tests. The
 * rendering function itself is no longer barrel-exported — it's only
 * reachable via the deep `./NavRevaluationAuditLog` path, so any new
 * import flag-reviews itself.
 *
 * Do NOT mount this in any input/data-entry flow. If a future read-only
 * post-calc preview legitimately needs an inline audit (e.g. an
 * advisor-mode side panel that doesn't render the full report), use it
 * there. For the deliverable, use the Jinja partial.
 */

import { useManualPreviewFormatters } from '@/lib/omniPreview'

export type DeferredTaxBreakdownRow = {
  asset_class: string
  meerwaarde: number
  rate_pct: number
  deferred_tax: number
  rate_source:
    | 'user_override'
    | 'global_user_rate'
    | 'engine_default_per_asset'
    | 'engine_default_global'
}

export type SmeEligibilityPayload = {
  is_eligible: boolean
  rate_pct: number
  reasons: string[]
}

export type RealEstateRevaluation = {
  book_value: number
  appraisal_value: number
  meerwaarde: number
}

export interface NavRevaluationAuditLogProps {
  breakdown?: DeferredTaxBreakdownRow[] | null
  smeEligibility?: SmeEligibilityPayload | null
  realEstate?: RealEstateRevaluation | null
  effectiveRatePct?: number | null
  taxLatencyDeduction?: number | null
  className?: string
}

const ASSET_LABELS: Record<string, string> = {
  real_estate: 'Onroerend goed (Vastgoed)',
  inventory: 'Voorraad',
  receivables: 'Vorderingen',
  hidden_reserves: 'Stille reserves',
  other_revaluations: 'Overige herwaarderingen',
}

const RATE_SOURCE_LABELS: Record<string, string> = {
  user_override: 'User override',
  global_user_rate: 'Global user rate',
  engine_default_per_asset: 'Default per asset class',
  engine_default_global: 'Resolved CIT rate',
}

export function NavRevaluationAuditLog({
  breakdown,
  smeEligibility,
  realEstate,
  effectiveRatePct,
  taxLatencyDeduction,
  className,
}: NavRevaluationAuditLogProps) {
  const { currency } = useManualPreviewFormatters()
  const hasBreakdown = Array.isArray(breakdown) && breakdown.length > 0
  const hasRealEstate = !!realEstate
  const hasEligibility = !!smeEligibility

  if (!hasBreakdown && !hasRealEstate && !hasEligibility) {
    return null
  }

  return (
    <section
      className={`rounded-xl border border-foreground/[0.08] bg-background ${className ?? ''}`}
      aria-label="NAV revaluation audit log"
    >
      <header className="border-b border-foreground/[0.06] px-4 py-3">
        <h4 className="text-[12px] font-semibold uppercase tracking-wide text-foreground/65">
          GNA Revaluation Audit Log
        </h4>
        <p className="mt-0.5 text-[11px] leading-snug text-foreground/50">
          Per-asset latente belastingen and SME-rate resolution — defensible to buyer-side review.
        </p>
      </header>

      {hasRealEstate ? (
        <div className="border-b border-foreground/[0.06] px-4 py-3">
          <h5 className="text-[11px] font-semibold uppercase tracking-wide text-foreground/55">
            Real-estate revaluation
          </h5>
          <dl className="mt-2 grid grid-cols-3 gap-3 text-[12px]">
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-foreground/45">Book value</dt>
              <dd className="mt-0.5 tabular-nums text-foreground/75">
                {currency.format(realEstate?.book_value)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-foreground/45">Appraisal</dt>
              <dd className="mt-0.5 tabular-nums text-foreground/75">
                {currency.format(realEstate?.appraisal_value)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-foreground/45">Meerwaarde</dt>
              <dd
                className={`mt-0.5 tabular-nums font-semibold ${
                  realEstate?.meerwaarde >= 0 ? 'text-emerald-600' : 'text-rose-500'
                }`}
              >
                {currency.format(realEstate?.meerwaarde)}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      {hasBreakdown ? (
        <div className="px-4 py-3">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-foreground/45">
                <th className="pb-2 font-medium">Asset class</th>
                <th className="pb-2 font-medium text-right">Meerwaarde</th>
                <th className="pb-2 font-medium text-right">Rate</th>
                <th className="pb-2 font-medium text-right">Deferred tax</th>
                <th className="pb-2 font-medium text-right">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/[0.04]">
              {breakdown?.map((row) => (
                <tr key={row.asset_class}>
                  <td className="py-2 text-foreground/75">
                    {ASSET_LABELS[row.asset_class] ?? row.asset_class}
                  </td>
                  <td className="py-2 text-right tabular-nums text-foreground/75">
                    {currency.format(row.meerwaarde)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-foreground/75">
                    {row.rate_pct.toFixed(1)}%
                  </td>
                  <td className="py-2 text-right tabular-nums text-rose-500">
                    −{currency.format(row.deferred_tax)}
                  </td>
                  <td className="py-2 text-right text-[10px] text-foreground/45">
                    {RATE_SOURCE_LABELS[row.rate_source] ?? row.rate_source}
                  </td>
                </tr>
              ))}
            </tbody>
            {taxLatencyDeduction != null ? (
              <tfoot>
                <tr className="border-t border-foreground/[0.08]">
                  <td colSpan={2} className="pt-2 text-[11px] text-foreground/55">
                    Total latente belastingen
                    {effectiveRatePct != null ? (
                      <span className="ml-1 text-foreground/40">
                        (effective {effectiveRatePct.toFixed(1)}%)
                      </span>
                    ) : null}
                  </td>
                  <td
                    colSpan={3}
                    className="pt-2 text-right tabular-nums font-semibold text-rose-500"
                  >
                    −{currency.format(taxLatencyDeduction)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      ) : null}

      {hasEligibility ? (
        <div className="border-t border-foreground/[0.06] bg-foreground/[0.02] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h5 className="text-[11px] font-semibold uppercase tracking-wide text-foreground/55">
              Resolved CIT rate (Art. 215 WIB 92)
            </h5>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                smeEligibility?.is_eligible
                  ? 'bg-emerald-500/[0.12] text-emerald-700'
                  : 'bg-foreground/[0.06] text-foreground/65'
              }`}
            >
              {smeEligibility?.rate_pct.toFixed(0)}%
              {smeEligibility?.is_eligible ? ' SME' : ' standard'}
            </span>
          </div>
          <ul className="mt-2 space-y-1 text-[11px] leading-snug text-foreground/55">
            {smeEligibility?.reasons.map((reason, idx) => (
              <li key={idx} className="flex gap-1.5">
                <span className="text-foreground/35">•</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
