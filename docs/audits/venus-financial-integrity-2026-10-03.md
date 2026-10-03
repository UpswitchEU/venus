# Venus financial integrity audit — 3 October 2026

This candidate brings the previously tested Venus financial-integrity repairs onto current main (022d2b21), retaining the forecast preservation shipped in PR 107. It adds saved-normalization fixes discovered during the continuation. It uses the existing backend contracts; it does not enable the pending partial-assessment or cash-tax-policy release.

## Corrected behavior

- Financial result readers preserve observed zero and losses, distinguish unknown from malformed values, and keep each selected method's published range and enterprise/equity basis. They do not synthesize missing asking prices, currency, confidence or midpoint values. Saved HTML recovery cannot mix a conflicting live financial result with an immutable version.
- Accepted malformed/overflowing normalization amounts and repeated decisions within a fiscal year produce an explicit validation error. Repeated imports are idempotent within a batch and across retries.
- English, Dutch and French calculation panels describe the actual earnings and value basis. History comparison requires compatible currency and basis and does not calculate growth percentages from a zero or negative baseline.
- Normalization arithmetic uses an isolated Decimal context. Only accepted decisions affect the annual input; rejected/pending decisions supersede stale accepted mirrors. Repeated fiscal-year targets apply an adjustment once. An explicit unnormalized flag prevents a stale cached normalized amount from being reapplied after reload.
- Saved version normalization bridges now use the explicit reported baseline, preserve decimal cancellation and omit undefined percentages on zero EBITDA. Missing/malformed reported amounts cannot become a saved zero. Current-period evidence wins over a duplicate historical row.
- Version snapshots and restoration preserve adjustment identity, source/review evidence, economic owner-compensation terms and multi-year scope. Repeated annual copies of one percentage/absolute instruction restore as one scoped instruction. Legacy custom deductions are restored; malformed adjustments cannot become accepted zeros.
- The manual EBITDA preview uses the same imported-review policy as the calculation request. An imported addback demoted to pending cannot inflate the displayed EBITDA. Replacement-compensation terms use exact decimal reconciliation and do not parse blank/null amounts as zero.

## Evidence and verification

The new saved-bridge counterexamples initially produced 11 failures out of 12 cases. After the correction, all 32 saved-bridge, restore, preview and version-store tests passed. The final focused and hosted quality receipts are recorded in the external audit output directory, including any unsuccessful/interrupted runs. Final acceptance requires the complete exact-revision GitHub Quality Guard (types, lint, tests, build, dependencies and structural/security guards). No guard or debt budget is relaxed by this change.

## Boundaries

This is a software correctness repair, not empirical certification or a claim that SME value can be known perfectly. The broader partial-assessment rollout depends on Titan PR 336 and ValuationIQ PR 84, whose mandatory gates were failing at audit start. Browser amount interfaces still use JavaScript numbers; the isolated Decimal bridge is not a complete migration of all form fields to exact strings. The source-level round trip does not substitute for a full production sign-in/save/export journey or independent market outcome calibration.


## Build dependency boundary

The first hosted run stopped at the unchanged production dependency audit for [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). As checked on 3 October 2026, braces 3.0.3 has no patched release. Source inspection finds Tailwind runtime imports only in the repository CSS configuration/preset and its tests; application code does not load the CSS compiler. Tailwind and its four CSS plugins are now development dependencies, consistent with the [Tailwind Next.js setup](https://v3.tailwindcss.com/docs/guides/nextjs). Package versions are unchanged. Frozen-lock builds still install the tools.

The production audit remains enabled without ignored advisories or a reduced severity threshold. A new post-build gate rejects Tailwind tooling or braces in any production Node file trace and requires real build evidence. This classification does **not** claim to patch the development/build dependency; untrusted glob patterns must not be supplied to the build. The remaining build-time advisory is recorded here for a future upstream patch or tooling migration.
