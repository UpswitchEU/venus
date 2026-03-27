# Adaptive Input Studio (canonical architecture)

This document locks the **implemented** architecture for upfront valuation method selection and method-aware inputs. It replaces the earlier placeholder folder names (`InputStudio/SectionRenderer`, `registry/fieldRegistry.ts`) with the actual modules in the codebase.

## Data flow

1. **Top bar** — [`CalculatorNav`](../src/components/calculator/CalculatorNav.tsx) exposes the method dropdown; state lives in [`useManualResultsStore`](../src/store/manual/useManualResultsStore.ts) (`preSelectedMethod`, `selectedMethod`).
2. **Session + URL sync** — [`usePreSelectedMethodSessionSync`](../src/hooks/usePreSelectedMethodSessionSync.ts) (client-only) handles debounced persistence to `_pre_selected_valuation_method` and one-time `?selected_method=` seeding after restoration. `ManualLayout` stays thin; no `useSearchParams` — `selected_method` is passed from the server page’s `searchParams` into `urlParams` (SSR-safe). [`reports/new`](../app/[locale]/reports/new/page.tsx) preserves `selected_method` across the redirect to the generated report id.
3. **Registry** — [`methodFieldConfig.ts`](../src/constants/methodFieldConfig.ts) defines `METHOD_FIELD_CONFIG`, `getBonusSections()`, and firm-aware pre-selectable methods (`getPreSelectableMethodsForFirm`).
4. **Left panel** — [`ManualInputPanel`](../src/components/calculator/ManualInputPanel.tsx) uses `effectiveMethod = preSelectedMethod ?? selectedMethod` and renders [`AdaptiveSections`](../src/components/calculator/ManualInputPanel.tsx) (same file) for bonus blocks (DCF projections, NAV schedule, SaaS metrics, revenue quality).
5. **Persistence** — Upfront preference is stored in session JSONB under `_pre_selected_valuation_method` (see [`sessionUiKeys.ts`](../src/constants/sessionUiKeys.ts)), merged by [`SessionNormalizer`](../src/services/session/SessionNormalizer.ts) and hydrated in [`SessionRestorationService`](../src/services/session/SessionRestorationService.ts) before the first calculation. After a run, `selected_valuation_method` on the valuation result remains authoritative.
6. **Mercury → Venus** — Mercury may append `selected_method=<omni_key>` to the calculator redirect URL; Venus passes it via server `urlParams` into `usePreSelectedMethodSessionSync` when the session has no stored preference yet.

## Drag-and-drop section reorder

**Out of scope for P0.** The adaptive sections use a fixed, product-tuned order. Reorderable blocks are not implemented; adding them would require a persisted order key in session data and a DnD library (e.g. `@dnd-kit`), which is explicitly descoped until a future sprint.

## Implementation notes (audit)

- **Persistence**: `usePreSelectedMethodSessionSync` only persists when `restorationComplete` is true and `session.reportId` exists; debounced flush reads the latest store state. Stored value is built with `toSessionPreSelectedFieldValue()` in [`sessionUiKeys.ts`](../src/constants/sessionUiKeys.ts) (single definition of “adaptive → null”).
- **Subscriptions**: The hook subscribes only to `preSelectedMethod` + `selectedMethod` with `shallow`; URL seed calls `setPreSelectedMethod` via `getState()` so the setter is not part of the subscription surface.
- **Normalization tests**: See `SessionNormalizer.test.ts` (`preSelectedValuationMethod`) and `sessionUiKeys.test.ts` (`sanitizePreSelectedValuationMethod`).
- **Firm rules**: URL/session values are sanitized with `getPreSelectableMethodsForFirm` (e.g. `fiscal_4x` excluded for NL) in `sanitizePreSelectedValuationMethod`.
- **Session alias**: `SESSION_PRE_SELECTED_VALUATION_METHOD_ALT_KEY` (`pre_selected_valuation_method`) is the legacy/alt field name; `sessionHasStoredPreSelectedMethod()` detects either key so Mercury `?selected_method=` does not overwrite an already-restored preference. `SessionNormalizer` and `hydrateFromPackage` use the same constants.

## Adding a new method or section

1. Add the method key to `PRE_SELECTABLE_METHODS` / `METHOD_FIELD_CONFIG` in `methodFieldConfig.ts` (and Titan/ValuationIQ omni keys as needed).
2. Extend `AdaptiveSections` / `ManualInputPanel` for any new `InputSectionKey` or method-specific UI.
3. Add i18n labels in `CalculatorNav` `METHOD_LABEL_KEYS` and `manualInput.methodSelector.*`.
