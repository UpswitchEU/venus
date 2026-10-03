# Percentage input units — coordinated backend release required

Newly authored adaptive percentage inputs carry `business_context.percentage_input_contract`, schema `percentage_inputs.v1`, with per-field `percentage_points` units. The shared conformance fixture covers all 30 supported adaptive fields. For example, an entered WACC of `0.5` means 0.5%, whose engine fraction is `0.005`.

Unmarked inherited values keep their existing interpretation. Existing fraction tags survive unless that field is authored by this percent-input surface. No historical snapshot is silently relabelled. Titan and ValuationIQ validate the contract; the engine records the raw input, explicit unit and exact interpreted fraction.

Deployment dependency: ship the matching Titan and ValuationIQ readers before enabling this frontend release. The production engine currently does not implement this contract. This PR also contains the earlier cash-tax input repairs and remains held until the coordinated backend release is verified.

Verification: percentage contract, business-context construction, request construction, advisor DCF, input parity and business forecast suites. The audit packet records exact commands and results. This does not certify market calibration or every accounting connector.
