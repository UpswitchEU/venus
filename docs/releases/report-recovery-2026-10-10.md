# Coordinated report recovery — 10 October 2026

## Behavior

Venus owns one recovery sequence: acknowledge inputs and every year’s normalization mutation, resume an unfinished calculation, acknowledge its result, then allow the matching PDF. A retained result-save continuation never calls the calculator again. Version creation stays after result acknowledgement. The report status suppresses downstream PDF warnings while a prerequisite is unresolved, and all manual export entry points respect the prerequisite gate.

Temporary failures retry after 8, 16 and 32 seconds (or a longer `Retry-After`), then retain a manual action. Session PATCH and normalization persistence no longer add independent retry loops. Confirmed 402 subscription denial offers a new-tab Mercury billing link to authorized managers, or asks a member to contact the owner. A 503 verification outage never offers a purchase flow. Mercury reuses its dashboard entry/focus/30-second access check and now gates calculator handoff and explicit valuation launch on fresh access.

Normalization recovery retains updates and removals for all pending years. Revisions prevent old responses from clearing newer edits. The existing 24-hour, 500 kB recovery envelope is verified after writing, checked against the authorized browser identity before restoration, and read without consumption. Only acknowledged matching items with no pending year mutations clear it. Manual figures remain in the mounted session; they are not advertised as durably saved by local storage.

Titan retains authorization, atomic writes, CAS and database-pressure protection. Advisory verification outages return `ADVISORY_VERIFICATION_UNAVAILABLE` (503); normalization lock/transaction contention returns `NORMALIZATION_PERSISTENCE_UNAVAILABLE` (503), with retry timing. Lock acquisition and transaction checkout are bounded to two seconds. Request-scoped access reuses the resolved billing owner.

PDF progress stops blocking after 60 seconds. A published artifact can complete an active/retrying job or a job reaped for worker loss only if publication follows that job’s start and the existing fingerprint, freshness, export-policy and access checks pass. Ordinary failed/cancelled jobs cannot borrow an older PDF. A changed report revision invalidates the client’s PDF-ready state. Historical PDFs are not offered without an authorized historical-version target.

## Incident evidence and retained edits

Read-only Stripe and Titan checks agree: the affected firm has active complimentary Pro through 28 September 2027. No billing, tax or subscription settings were changed.

The existing browser tab still displays the 2024 manual override (revenue €11,000,000; EBITDA €2,000,000), while the inspected server session lacks that historical year. Its current-year values are revenue €12,484,755.94 and reported EBITDA €2,399,239.12, with a €225,851.15 adjustment. A local JSON capture of those visible rows was saved outside the repository. It is not a complete session export.

The PDF was published before its durable job was subsequently marked failed with `reaper: worker lost or restarted before completion`. Do not infer that this PDF contains the unsaved 2024 override.

**Keep the original tab open.** Before reloading into a new deployment, acknowledge its complete retained draft through the existing save action and read it back from Titan. Confirm the 2024 override, 2025 figures and adjustment set. Do not reconstruct or overwrite a complete session from the partial JSON capture.

## Release order and acceptance

Local verification: 294 Venus tests (37 files), 84 Titan tests (3 suites), and 57 Mercury tests (4 files) passed. TypeScript checks passed in all three applications. Venus browser-persistence, store-cycle and file-size guards passed, as did the browser-persistence guard's own regression check. These are local unit/contract checks, not a production end-to-end certification.

1. Release the additive Titan contracts, lock bounds and PDF reconciliation first. No schema migration is required. Confirm structured 402/403/503 responses and `Retry-After` pass through the BFF.
2. Release Venus and Mercury together after their focused checks. The local Titan/Mercury checkouts also contain unrelated work; isolate the recovery changes before making a release commit.
3. Save and read back the retained incident draft before refreshing its old browser tab. Resume the unfinished calculation once, persist its result, then verify a coherent downloadable PDF against the saved two-year inputs. A successful old PDF download alone is not acceptance.
4. Exercise a synthetic verification outage, confirmed expired subscription, two failed years including a removal, result-save failure after successful calculation, storage-write failure, report/account switch, and a worker loss after PDF publication. Every spinner must settle or expose a retry; calculation and version counts must remain unchanged when retrying only persistence/PDF.
5. Observe `report_save_recovery_completed`, `report_save_recovery_deferred`, `advisory_verification_unavailable`, normalization 503 codes/latency and reaped/stalled PDF jobs. Correlate by report/request identity without recording financial inputs. Stop rollout if repeat calculations, inconsistent input/PDF revisions, rising contention, or premature buffer clearing appear.

The implementation has been tested locally; production recovery and deployment are separate acceptance steps. No production report data or subscription changes were made during implementation.
