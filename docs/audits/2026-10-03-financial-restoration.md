# Venus financial restoration audit — 3 October 2026

Scope: frontend restoration of annual financial inputs, reported EBITDA, turnover, supporting observations, and the indication that a report requires recalculation. This continues the financial-integrity and method-output audits in PRs 109 and 110.

## Reproduced failures and corrections

- Prefill restored a normalized EBITDA of 491,500 as reported earnings. Reapplying the accepted 156,500 adjustment produced 648,000 instead of 491,500. The restored reported baseline is now 335,000. A normalized row with no recoverable reported baseline stays unavailable; it cannot use its normalized earnings as the baseline.
- A historical duplicate could replace a current-year observation. Restoration now selects the current row as a whole, preserving cleared fields and its associated evidence. The manual seed path retains its narrowly identified legacy empty-grid repair.
- Missing EBITDA became zero in prefill, seed and live-context paths. Missing observations now remain absent, while explicit zero and signed amounts survive.
- Supporting cash-flow, NAV and review fields were dropped along some paths. A common restoration function preserves these optional observations and source metadata, including correction IDs and review warnings.
- Turnover selection accepted a 1% discrepancy in the gross-income reconciliation, erasing small corrections. Decimal arithmetic now requires the supplied gross revenue less supplied financial and extraordinary income to equal operating revenue. Invalid excluded income does not become zero. Legacy omitted excluded-income categories remain zero for this import convention.
- Partial/fractional fiscal-year labels could become financial periods. Restored periods must be integer years in the supported 2000–2100 interval.
- The report's financial-change comparison ignored direct FCFF, cash, debt, depreciation, tax and other supporting annual fields. Submitted and reopened snapshots now retain and compare the same observations, including zero, clearing a value and deleting all rows. Later partial company edits no longer reset an outstanding financial change. Forecast earnings do not become the current-year comparison baseline.
- The normalization context could attach an older current row to the calendar filing year or revive normalized EBITDA through a top-level mirror. It now retains the row's actual period and reported basis.

## Verification

The initial restoration counterexample suite failed 14 of 18 cases before the fixes. The expanded focused suite passed 148 tests across 11 files; a separate React hook test verifies financial changes persist across partial form updates. The PR quality workflow must additionally pass full type, lint, test, build, dependency/security and bundle checks before merge. No guard or allowance was relaxed.

## Interpretation and limits

These changes establish tested software contracts, not empirical valuation accuracy or a certification of underlying accounts, market multiples or engine methodology. No backend valuation models, market-data feeds, live customer records or deployed environment were changed. This pass uses regression and hook tests; it does not claim a fresh authenticated browser-to-PDF journey.

The existing persisted-form parser still supports Belgian/Dutch display strings; ambiguous numeric strings need explicit source-format metadata for a broader migration. Legacy unconfirmed zero-only seed rows have no explicit observation marker: a matching empty grid is still repaired from historical evidence, while confirmed or source-marked rows retain priority. Historical duplicates beyond the canonical current row still use the first saved observation; upstream conflict resolution remains a separate validation concern.

The accounting rationale for retaining distinguishable financial observations is consistent with the IFRS Foundation's discussion of presentation, materiality and offsetting in [IAS 1](https://www.ifrs.org/issued-standards/list-of-standards/ias-1-presentation-of-financial-statements.html/). This is contextual support, not a claim that all SME source accounts apply IFRS or that this frontend is IFRS-certified.
