# Browser Persistence Policy

Venus may use browser storage only for narrow recovery and UI-continuity cases. It must not be treated as durable persistence or an authorization boundary.

## Allowed

- Short-lived workflow recovery buffers for in-flight valuation edits when a tab closes before the backend persist finishes.
- Navigation handoff state needed across redirects.
- Anonymous feature bucketing or non-sensitive UI preferences.

## Required Controls

- Workflow recovery buffers must use `src/utils/browserRecoveryStorage.ts`.
- Recovery buffers must be wrapped in a classified `workflow-recovery` envelope.
- Default TTL is 24 hours.
- Stale, malformed, or type-invalid entries must be removed on read.
- Retry queues must be bounded.
- Auth secrets, access decisions, API tokens, cookies, report HTML, and long-lived client/company data are not allowed in browser storage.
- Every direct browser-storage writer, recovery-buffer caller, and third-party local-storage surface must be listed in `scripts/guard-browser-persistence.mjs`.
- Every approved surface must declare owner, review date, classification, retention class, allowed keys or key prefixes, and `sensitivePayload: "forbidden"`.
- Long-lived `localStorage` surfaces must declare a TTL, a narrow non-sensitive exemption, or a migration target.
- Session-only handoffs may carry workflow data only when they are one-shot, bounded, and strip identity/report HTML before restore.

## Guard

Run:

```bash
pnpm run guard:browser-persistence
```

The guard fails when:

- A new file writes to `localStorage`, `sessionStorage`, a `Storage` object, Zustand `persist`, browser recovery helpers, or approved third-party local-storage persistence without policy review.
- A storage key or prefix is not declared in the approved policy.
- A policy review date expires.
- A local/TTL retention surface lacks an explicit TTL, exemption, or migration target.
- A literal storage key contains token, secret, password, credential, access, or refresh terminology.

## Encryption

Browser-side encryption is not a substitute for server persistence because keys available to JavaScript are also available to an attacker with script execution. Data that requires confidentiality at rest must be persisted server-side behind HttpOnly session auth and backend access checks. Client recovery buffers are for loss prevention only and must expire.
