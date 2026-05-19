# Toolchain Decision

**Status:** intentional drift, freeze-and-document  
**Last reviewed:** 2026-05-19

Mercury and Venus are not on the same frontend stack today. Treat that as an explicit transition state, not as accidental repo entropy.

## Current Stacks

| App | Package manager | Node | Next | React | Tailwind | Biome |
| --- | --- | --- | --- | --- | --- | --- |
| Mercury | `npm@10.8.2` | `>=20.19.0 <21` | `16.2.6` | `19.2.6` | `^4` | `^1.9.4` |
| Venus | `pnpm@10.26.2` | `>=20.19.0` | `15.5.18` | `^18.2.0` | `^3.4.17` | `^2.3.8` |

## Decision

Do not force-align the apps during the raise hardening pass.

Mercury is already the newer-platform app. Venus remains on its current stack while the valuation/session core is hardened. A platform migration in Venus should happen only after the session persistence/refactor work is stable, tested, and no longer the main onboarding risk.

## Rules For New Engineers

- Use the package manager declared by the app: `npm` in Mercury, `pnpm` in Venus.
- Do not upgrade framework, React, Tailwind, or Biome versions in only one app without an architecture note.
- When touching either app, run that app's local guards before handoff.
- For oversized files, shrinking is welcome; growing an oversized file requires an accepted `guard:file-size:update` baseline change.

## Venus Commands

```bash
pnpm install
pnpm run type-check
pnpm run guard:type-debt
pnpm run guard:file-size
pnpm run guard:exact-boundary
pnpm run guard:bundle-budget
pnpm run guard:repo-hygiene
```

## Revisit Trigger

Revisit toolchain alignment once both are true:

- Venus session persistence has been split out of `SessionService` into smaller ownership modules.
- Mercury BFF route handlers over 300 lines have parser/service/client boundaries for the highest-risk routes.
