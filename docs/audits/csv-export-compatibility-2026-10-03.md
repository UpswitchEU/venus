# Valuation CSV compatibility and spreadsheet text safety

The financial reconciliation release changed the Zero Draft method-table header,
which could break existing EUR-equity imports. The exporter now retains the first
ten legacy columns in their original order and appends `currency`, `value_basis`,
`value`, `range_low` and `range_high`. Legacy price columns are populated only for
available EUR equity results; enterprise, other-currency, unknown-basis and
unavailable prices leave those columns empty. They are never converted or
relabelled. New consumers should use the explicit currency and basis columns.

All numeric columns keep their validated numeric precision, including negative
amounts and explicit zero. No valuation calculation or API schema changes.
Additional trailing columns require consumers that enforce an exact column count
to accept additive schema evolution. Existing header names and their leading
positions are retained; the prior implicit-EUR assumption is not restored.

External text such as company names, method labels and unavailable reasons could
previously become spreadsheet formulas. Formula-like text now receives a tab
prefix inside a quoted CSV field, including whitespace-prefixed and full-width
formula markers. Quotes, commas and newlines remain within the same cell.
Validated numeric cells follow a separate path so negative financial amounts
remain numeric. Metadata and method keys receive the same text treatment.

This follows the Excel-oriented guidance in
[OWASP's CSV injection reference](https://community.owasp.org/attacks/CSV_Injection).
The protective tab is part of the exported text and may be visible to programmatic
consumers. Spreadsheet applications differ, and later editing/re-saving can alter
text handling; the tests verify serialization, not universal spreadsheet safety.

Regression tests cover legacy EUR columns, explicit currency and value basis,
missing data, malformed numbers, signed ranges, formula prefixes and quoted
multiline input. Before the repair, all 21 initial combined contract/security
cases fail. Run:

```sh
pnpm exec vitest run src/utils/zeroDraftCsv.test.ts src/utils/omniCalcRange.test.ts src/utils/methodComparisonFinancials.test.ts
pnpm type-check
pnpm lint
```

The normal full CI suite, build, dependency, secret and bundle gates remain
required before release. Authenticated report generation, save/reload and
external spreadsheet import are separate acceptance checks.
