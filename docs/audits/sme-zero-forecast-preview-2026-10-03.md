# Explicit zero forecast preview — 3 October 2026

A stored forecast containing zero revenue and EBITDA was treated as empty. The forecast table could display a derived projection with revenue 1,050,000, EBITDA 105,000 and FCFF 62,250 instead of the supplied zero facts. Partial observations containing only zero revenue or EBITDA could also be replaced by a complete positive projection.

The workspace now selects a stored bridge whenever a finite earnings value is present, including zero. Genuinely absent earnings remain distinct and can use the existing derived preview. Stale FCFF is still ignored in EBITDA mode. Existing tax behavior and authoritative valuation/persistence contracts are unchanged.

Four counterexamples fail on the exact production source `022d2b212d59f2cc7104b06b4afecd756a74b9a0`; three existing behavior checks pass. Acceptance covers complete and partial zero earnings, missing rows, stale FCFF and JSON reload with reordered rows. Numerical expectations are independently stated; the zero bridge uses zero working-capital change and an explicit tax assumption. This is a presentation repair and does not certify the wider backend rollout or empirical calibration.
