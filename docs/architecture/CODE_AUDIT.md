# Venus code audit — 1 October 2026

Baseline: `0ac39520f0913eb7776245124a6743172ec8c836` (main, matched remote). Source audit only.

## Reproduce

Node **20.19.6**, pnpm **10.26.2**, using the repository pins:

```sh
corepack enable
corepack prepare pnpm@10.26.2 --activate
pnpm install --frozen-lockfile
pnpm run guard:repo-hygiene
pnpm run verify:shared-contracts
pnpm run type-check
pnpm run lint
pnpm run test:run
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:3002 NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3002 pnpm run build
pnpm run guard:bundle-budget
pnpm run audit
```

The loopback values are compilation-only inputs for an isolated check. Deployed builds require the intended public API URL. Missing production configuration correctly fails; this audit did not change that behavior.

## Boundaries and repairs

`ValuationAPI.ts` owns HTTP request assembly, including a 120-second calculation timeout and no automatic retry for credit-consuming calculations. SessionAPI/restoration own saved-session reload; stream recovery is separate. `mercuryParentMessaging.ts` and the Mercury auth bootstrap implement cross-application handoffs.

Vendored packages remain local. Removed the unused platform-scripts wrapper and unavailable workspace sync aliases; real test groups now run through `scripts/platform-checks.mjs`. Added provenance/checksums and runner failure tests. The method registry accepts `holding_sotp` as a result only. Updated Axios/DOMPurify and consolidated native-build permissions in `pnpm-workspace.yaml`.

The isolated baseline passed **718 files / 5,380 tests**. The configured isolated production build passed. The final targeted contract suite passed **93 tests**, including compiled-versus-source registry parity; a baseline pass is not represented as a final dependency-version full-suite pass.

## Contract updates

ValuationIQ owns `contracts/valuation-methods.v1.json`. Copy a reviewed export, reconcile the local registry and verify with the producer's `export_method_contract.py --consumer /absolute/venus/tests/contracts/valuation-methods.v1.json`. Run `pnpm verify:shared-contracts` and update reviewed hashes only. Other pinned contract sources are listed in `scripts/platform-checks.json` and `vendor/contracts/manifest.json`.

Historical `sync:*`, AI-dock shell and sellability workspace commands were removed because their implementation was absent. No equivalent full-workspace coverage is claimed. Intentional vendored build outputs and fixtures remain tracked.

## Remaining verification

The browser-persistence guard blocks on 38 expired review entries dated 2026-09-30. These need individual retention/scope reviews, not a global date bump. Production dependency audit is clean; the full audit retains one low-severity development-tool advisory for esbuild.

Live expired authentication, cross-tenant denial, stream interruption and persistence/reload need a disposable Titan/engine environment. Existing hermetic suites exercise these policies at adapter/store boundaries. No public endpoint, response shape or database schema was changed.
