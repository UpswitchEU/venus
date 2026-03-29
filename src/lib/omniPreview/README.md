# Omni preview (`lib/omniPreview`)

Client-side **preview** math and UX helpers aligned with ValuationIQ `omni_calc_coordinator` where possible. Full valuation numbers (calibrated multiples, DCF EV, Step 8 ownership) still come from the API.

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

## Adding a new preview

1. Put **pure** logic in a new `*.ts` file here (no `window`, no React).
2. Add unit tests `*.test.ts` beside it.
3. Export from `index.ts` and a one-line entry in `METHOD_PREVIEW_AUDIT` if it maps to an omni method.
4. In UI, use **`useManualPreviewFormatters`** + **`PreviewMetricCard`** from `components/calculator/sections/previewMetricCards.tsx`.
