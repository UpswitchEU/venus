# Omni preview (`lib/omniPreview`)

Client-side **preview** math and UX helpers aligned with ValuationIQ `omni_calc_coordinator` where possible. Full valuation numbers (calibrated multiples, DCF EV, Step 8 ownership) still come from the API.

**For accountants / M&A users:** method purposes, blending rules, and QA checklist → [`docs/VALUATION_METHODS_OPERATING_GUIDE.md`](../../../docs/VALUATION_METHODS_OPERATING_GUIDE.md).

## Quick imports

| Need | Import |
|------|--------|
| One barrel (incl. `lib/saas`, `lib/sde`) | `@/lib/omniPreview` |
| **Formatters in React sections** | `useManualPreviewFormatters` from `@/lib/omniPreview` |
| **No React** (tests, scripts) | `createManualPreviewFormatters`, `getBelgianNumberLocale` from `@/lib/omniPreview` |
| **Dev audit table** (lazy chunk) | `METHOD_PREVIEW_AUDIT` from `@/lib/omniPreview/methodPreviewAudit` |

## Layout

| File | Role |
|------|------|
| `previewConstants.ts` | `PREVIEW_DECIMALS` — single place for % / € decimal rules in the UI |
| `manualPreviewFormatters.ts` | Pure `Intl.NumberFormat` factories (Belgian locales) |
| `useManualPreviewFormatters.ts` | Hook wrapping the factories with `useLocale()` |
| `guards.ts` | `toFiniteNumber` for safe coercion |
| `methodPreviewAudit.ts` | Which methods have local previews vs server-only |
| `fiscalPreviewMetrics.ts`, `revenueQualityPreview.ts`, … | Pure preview calculators |
| `../saas`, `../sde` | SaaS / SDE domain math (also re-exported from the barrel) |

## Calculator sections — formatter audit (Venus)

| Section / surface | `useManualPreviewFormatters` | Notes |
|-------------------|------------------------------|--------|
| SaaS metrics | `saasMetric`, `currency` | `lib/saas` preview math |
| SDE owner comp | `sdeMultiple`, `currency` | `lib/sde` preview math |
| Revenue quality | `ratio`, `currency` | EBITDA margin, backlog months |
| NAV adjustments | `currency` | Sum of schedule lines |
| Fiscal 4× notice (`AdaptiveSections`) | `previewCurrencyFormatter` (from parent hook) | Fiscal preview cards |
| `ManualInputPanel` (panel currency) | `currency` | Official filing / EV bridge copy |
| DCF FCFF / projection / forecast workspace | `currency` | Table + inline € |
| DCF sensitivity matrix | `formatEurCompact`, `ratio` | Large EV uses compact €; axis uses ratio decimals |
| Real estate carve-out | — (inputs only) | `CurrencyInput` handles display |
| Synthesis weighting | — | Hand-tight compact `€XM` / `€XK` for blended EV (different from preview €) |
| Quick actions (normalization hints) | — | Compact `€M`/`€K` + `getBelgianNumberLocale` for small € |

**Out of scope for this barrel:** normalization modals, tax latency, breakdown panels, chat drawer — they still use ad hoc `en-BE` / `nl-BE` `Intl` or `toLocaleString`; migrate only when touching those flows.

**`ManualInputPanel`:** one `useManualPreviewFormatters()` builds `formatCurrency`; the same `Intl.NumberFormat` is passed to `AdaptiveSections` as `previewCurrencyFormatter` for the fiscal 4× notice (no second hook).

## Adding a new preview

1. Put **pure** logic in a new `*.ts` file here (no `window`, no React).
2. Add unit tests `*.test.ts` beside it.
3. Export from `index.ts` and a one-line entry in `METHOD_PREVIEW_AUDIT` if it maps to an omni method.
4. In UI, use **`useManualPreviewFormatters`** + **`PreviewMetricCard`** from `components/calculator/sections/previewMetricCards.tsx`.
