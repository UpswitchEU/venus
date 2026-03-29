# Valuation methods — operating guide (Venus + engine)

**Audience:** Staff accountants, independent reviewers, and M&A advisors using the manual calculator.  
**Last updated:** March 2026

## Ground rules

1. **Authoritative numbers** — Enterprise value, equity bridge, calibrated multiples, DCF PV, and tax/fiscal outputs are produced by the **valuation engine** (Python / Titan path), not by Venus preview helpers. The UI collects inputs, shows **indicative previews** where documented, and renders the API response.
2. **Professional judgement** — Multiples, WACC, terminal assumptions, and normalizations remain **matter-of-fact** choices. Upswitch surfaces benchmarks and warnings; **sign-off stays with the preparer**.
3. **Consistency** — Do not blend **SDE-based** and **EBITDA-based** market methods in one synthesis: they embed different owner-compensation logic. Also **do not blend `omzet_multiple` with `revenue_multiple`** (same economics, English/NL API keys). The app enforces this via `MUTUALLY_EXCLUSIVE_PAIRS` in `methodFieldConfig.ts`.

## Methods at a glance

| Method key | Typical use | Extra inputs (bonus sections) | Client “preview” (non-binding) |
|------------|-------------|------------------------------|--------------------------------|
| `upswitch_adaptive` | Let the engine choose emphasis | None | Headline range from full run only |
| `omzet_multiple` / `revenue_multiple` | Revenue-led SMEs | Revenue quality | Margin + quality metrics; **EV/Revenue** from calibration server-side |
| `ebitda_multiple` | Profitable trading companies | Revenue quality | Same quality metrics; **EV/EBITDA** from calibration |
| `arr_multiple` | SaaS / recurring revenue | SaaS metrics | SaaS ratios in `lib/saas`; **EV** from server |
| `dcf` | Cash-flow narrative, growth story | DCF projections (+ SaaS if applicable) | Forecast table + projection preview; **EV** from engine |
| `sde_multiple` | Owner-operated SMEs (US-style SDE) | SDE owner compensation | SDE preview in `lib/sde`; align addbacks with policy |
| `adjusted_nav` | Asset-heavy / liquidation-style | NAV asset schedule | Sum of adjustments; full NAV from engine |
| `fiscal_4x` | Belgian fiscal reference (not NL firms in UI) | Optional carve-out fields elsewhere | 4× EBITDA anchor + book equity **preview**; Step 8 ownership from full run |

`revenue_multiple` is an **English alias** for the same economics as `omzet_multiple` (bonus sections, previews, and **blended synthesis** eligibility align — it is listed in `COMBINABLE_METHODS`, not only `omzet_multiple`).

## Who uses what

- **“Dummy accountant” path:** Prefer **adaptive** or a **single** clear method (`ebitda_multiple` or `omzet_multiple`), complete **financial history**, **normalizations** where needed, and read the report’s methodology section. Use **fiscal_4x** only for Belgian context when relevant.
- **Champion M&A advisor path:** Pre-select **multiple combinable methods**, use **synthesis weighting** with a written **justification**, tune **DCF** (WACC, terminal, forecast), **NAV** adjustments, **SaaS** metrics for ARR deals, and **real-estate carve-out** when the perimeter excludes property. Cross-check **sensitivity** output where shown.

## Where to look in code

| Topic | Location |
|-------|----------|
| Bonus sections per method | `src/constants/methodFieldConfig.ts` (`METHOD_FIELD_CONFIG`, `getBonusSections`) |
| Pre-selectable + blended rules | `PRE_SELECTABLE_METHODS`, `COMBINABLE_METHODS`, `STANDALONE_METHODS`, `sanitizeMethodSelection` |
| NL vs BE fiscal method | `getPreSelectableMethodsForFirm` |
| Client-side preview scope (audit) | `src/lib/omniPreview/methodPreviewAudit.ts` |
| Formatter consistency (€ / %) | `src/lib/omniPreview/README.md` |

## QA checklist before signing a report

- [ ] Method selection matches **engagement narrative** (revenue vs EBITDA vs SDE vs cash flow).
- [ ] No **forbidden blend** of SDE and EBITDA multiples (app blocks; verify synthesis table).
- [ ] **Forecast years** and **DCF** inputs match management narrative.
- [ ] **Carve-out** (vastgoed) and **tax latencies** match legal/tax advice.
- [ ] **Belgian fiscal 4×** used only where Belgian corporate context applies.

For pipeline architecture (frontend → API → Python), see `docs/architecture/MANUAL_FLOW_COMPLETE_DOCUMENTATION.md`.
