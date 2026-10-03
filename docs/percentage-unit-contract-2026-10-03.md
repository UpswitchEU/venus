# Percentage input units — coordinated backend release required

Newly authored adaptive percentage inputs carry `business_context.percentage_input_contract`, schema `percentage_inputs.v1`, with per-field `percentage_points` units. The shared conformance fixture covers all 30 supported adaptive fields. For example, an entered WACC of `0.5` means 0.5%, whose engine fraction is `0.005`.

Unmarked inherited values keep their existing interpretation. Existing fraction tags survive unless that field is authored by this percent-input surface. No historical snapshot is silently relabelled. Titan and ValuationIQ validate the contract; the engine records the raw input, explicit unit and exact interpreted fraction.

Deployment dependency: ship the matching Titan and ValuationIQ readers before enabling this frontend release. The production engine currently does not implement this contract. This PR also contains the earlier cash-tax input repairs and remains held until the coordinated backend release is verified.

Verification: percentage contract, business-context construction, request construction, advisor DCF, input parity and business forecast suites. The audit packet records exact commands and results. This does not certify market calibration or every accounting connector.

Session restoration and optional prefill convert explicitly tagged fractional context values into percentage points before populating percent controls. For example `.122` becomes `12.2`, and a saved NRR fraction `1.2` becomes `120`. Canonical decimal strings bypass locale grouping interpretation; `12.200` remains 12.2 percentage points. Existing top-level form edits take precedence. Repeated save/reload does not scale a second time. The source context is retained unchanged. The first 18-case restoration reproducer failed 16 cases on `043f8cb4`; the expanded request/restoration suite passes 267 cases after correction.

The new contract removes ambiguity for declared inputs. Untagged historical UI promotion still uses legacy behavior and does not establish the original author's intended units; it remains a migration/reconciliation limitation. Existing immutable reports are preserved. Frontend controls use JavaScript numbers; arbitrary-precision rate editing is not certified by the backend Decimal persistence checks.
