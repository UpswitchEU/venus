# Saved SME forecast preservation — 2 October 2026

This release repairs client financial facts while retaining the deployed tax request contract. Titan remains authoritative for admission/persistence and ValuationIQ for numerical valuations. Historical engine runs and reports are unchanged.

## Repairs

- Opening a saved manual forecast no longer overwrites its revenue, EBITDA or reinvestment. Only a matching versioned `dcf_forecast_inputs.v2` model-input baseline grants automatic resynchronization.
- Each explicit financial edit revokes that baseline, even when the entered amount equals the prior model value. A stale in-memory cache cannot reacquire ownership.
- Direct FCFF edits and mode changes retain the underlying earnings and bridge components. Repeating the selected mode is idempotent.
- Cleared draft fields stay absent, while explicit zero margin and CapEx remain zero. The legacy numeric forecast submit contract requires supplied revenue/EBITDA rather than converting a blank to zero.
- Decimal preview arithmetic preserves cents without whole-unit rounding before saving. Missing earnings and unavailable bridge components display a dash.
- The preview refuses to rewind over an unusable latest historical base and rejects conflicting duplicate years.
- Accessible labels bind the actual percentage inputs. Long French mobile table labels wrap so financial amounts remain visible.
- EN/NL/FR copy describes the WACC band as an illustrative modeling range and removes the unsupported cohort attribution.

## Verification and release boundary

The focused source selection passes 111 tests in 12 files. Additional ownership cases use the actual manual form restoration adapter after JSON serialization. Full TypeScript and lint pass, with existing lint warnings retained. Required hosted frozen-lock installation, full-suite tests, build and guards must pass on the exact release revision before merge/promotion. Desktop/mobile component fixtures verify EN/NL/FR tables and controls at 375/1280px; they are not an authenticated database/report journey.

The full tax-policy/default correction remains a separate candidate. The currently deployed ValuationIQ source `03dba78b2ab7bdd42d1f9cc6ec03442fcaae86ea` interprets an input of `0.5` as fraction `0.5`, although the percentage-point input means `0.005`. Its synthesized forecasts also retain a generic tax fallback. Removing client tax seeding is therefore held for the compatible engine/Titan rollout. This release retains the existing legacy tax assumption and request behavior; it does not certify that assumption, entity-specific tax eligibility or country calibration.

The baseline identifies client-generated projection inputs, not accounting evidence or an earnings approval. Legacy drafts without it are preserved. Browser monetary fields retain their existing JavaScript-number boundary; Decimal preview math does not certify arbitrary-size exact transport. Canonical sparse conversions, zero-valued empty-row creation, full import/normalization/persistence/report journeys, and empirical accuracy remain open. The complete system release remains held by the backend quality gates.
