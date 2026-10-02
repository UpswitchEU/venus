# DCF input integrity — 2 October 2026

This repair keeps Venus responsible for input and preview presentation. ValuationIQ remains responsible for country tax policy and authoritative valuations; Titan remains responsible for admission and persistence. Historical saved calculations and report artifacts are not rewritten.

## Confirmed defects and corrections

| Finding | Classification | Financial consequence | Correction |
| --- | --- | --- | --- |
| Generic 25% cash tax seeded from historical earnings in every market | Implementation error / methodological weakness | Overrides the engine's country policy with an unsupported request assumption | Do not seed tax from history, smart suggestions or a static fallback. Preserve supplied percentage points, including zero. |
| Zero EBITDA margin and CapEx treated as missing | Implementation error | Turns a zero-profit scenario into positive earnings or introduces expenditure | Preserve observed zero; hydrate only absent values. |
| Missing EBITDA and missing cash-tax facts displayed as zero or fabricated FCFF | Implementation error | Makes an incomplete financial bridge appear complete | Represent unresolved preview facts as null and display a dash. Never store invented FCFF on a mode switch. |
| Whole-unit rounding before forecast inputs are saved | Implementation error | Loses cents and creates unreconciled EBITDA/FCFF bridges | Decimal preview arithmetic without intermediate rounding; retain supplied FCFF precision. Display formatting is separate. |
| Forecast mode switch discards underlying earnings and bridge inputs | Implementation error | Loses source facts and replaces retained zero earnings on return | Keep source inputs on conversion, retain them on return, make repeat mode selection idempotent. |
| One-unit snapshot tolerance and missing-to-zero comparison | Implementation error | Overwrites small manual edits and cannot distinguish missing from zero | Exact default comparison; retain null semantics. An explicitly requested tolerance remains available for non-authoritative comparisons. |
| Forecast basis silently rewinds past an unusable latest year | Methodological weakness | Projects an older profitable base over a latest zero or missing observation | Require a usable latest actual basis. Deduplicate identical years; refuse conflicting years and invalid fiscal labels. |
| WACC modeling heuristic labeled as a Damodaran 2026 SME cohort | Insufficient evidence | Implies empirical calibration and coverage without source/sample evidence | Describe the unchanged band as illustrative in EN/NL/FR; remove the unsupported cohort attribution. |
| French mobile financial values partially clipped by a long metric label | Implementation error | Hides part of a displayed amount in the narrow table | Wrap the metric label and retain nonwrapping financial values with responsive padding. |
| Percentage controls lack associated labels | Implementation error | Controls cannot be located by their accessible financial labels | Stable React-generated input IDs bind the real labels to their controls. |

## Verification

The serving source reproduced 19 failures in the original 20 independent counterexamples; the repaired candidate passes all 20. The focused selection passes 223 tests in 23 files, including the expanded integrity cases, all 20 country request adapters, explicit percentage-point boundaries, and real EN/NL/FR controls/translations. Full application TypeScript, full lint and nine local safety/debt guards pass. Twelve real-component browser views across EN/NL/FR at 375 and 1280 pixels have no page overflow, fully visible financial cells and no page errors. Existing lint warnings are retained. Hosted full-suite and build acceptance is required before merge.

The local fork-pool run encountered two worker startup timeouts. Those failures remain in the external audit packet. The successful focused run used Node 20.19.6 and the thread pool, with unchanged financial assertions. Early test expectations that required discarded earnings or a fabricated tax default were corrected; no release gate budget was increased.

## Limits and compatibility

- A blank tax input delegates to the engine's applicable country policy. Component-tax/distribution regimes can require explicit assumptions under the reviewed engine policy. A preview without tax does not imply zero tax.
- Supplied tax rates are modeling assumptions, not evidence of legal eligibility. Previously saved explicit rates remain readable; ambiguous legacy defaults are not silently erased.
- Browser form monetary fields still use JavaScript numbers at their existing boundary. Decimal preview arithmetic does not establish exact arbitrary-size input transport or replace the engine's exact-string contracts.
- Broader per-field assumption provenance, initial forecast hydration ownership, zero-valued empty forecast creation, and all connector/normalization journeys remain wider audit work. This patch does not certify those paths.
- Desktop/mobile component fixtures verify presentation of actual controls. They do not establish an authenticated full-service browser or production database journey.
- Country accounting/tax certification, transaction calibration and empirical superiority remain unverified. The backend release candidates retain their failing quality gates.

## Integration with sparse-input assessments

The integrated candidate additionally respects `financial_observations` in historical DCF basis selection and forecast previews. Legacy numeric display slots can contain zero while the source status is missing, placeholder or unknown; those slots now remain absent for DCF. Explicitly observed zero earnings remain available. Regression coverage includes an imported legacy row passed through the display adapter into DCF defaults. The integrated focused run passed 472 tests across 53 files, with application typechecking and lint passing (151 existing warnings). Full hosted release acceptance is still required on the final source.
