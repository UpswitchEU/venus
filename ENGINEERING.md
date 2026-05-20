# Venus Engineering Guide

## Ownership

Venus owns the client-facing valuation readiness experience: guided input, normalization UX, founder startup valuation flow, report viewing, and external-facing product experience.

Venus must not own backend authorization, valuation formulas, provider ingestion, or server-side persistence policy. Those belong in Titan, ValuationIQ, or Hermes.

## Local Setup

1. Install Node `20.19.6`.
2. Enable pnpm `10.26.2`.
3. Run `pnpm install --frozen-lockfile`.
4. Copy `.env.example` to `.env.local` and fill only local development values.
5. Run `pnpm dev`.

## Required Gates

- `pnpm exec tsc --noEmit --pretty false`
- `pnpm run guard:repo-hygiene`
- `pnpm run guard:auth-surface`
- `pnpm run guard:type-debt`
- `pnpm run guard:file-size`
- `pnpm run guard:debug-surface`
- Focused Vitest coverage for edited stores, hooks, API routes, and critical UI flows.

## Config And Security

No client component may make an authentication decision from a public env var. Cookies used for access control must be server-issued with `HttpOnly`, `Secure`, and `SameSite` settings. Public env vars are feature/config flags only.

## High-Risk Modules

- `app/api/ai/chat/route.ts`
- `app/api/ai/history/route.ts`
- `src/components/calculator/ChatAssistantDrawer.tsx`
- `src/components/calculator/UnifiedNormalizationModal.tsx`
- `src/components/calculator/ValuationEditModal.tsx`
- `src/features/manual/components/ManualLayout.tsx`
- `src/lib/auth/**`

## Refactor Backlog

- Continue extracting `ManualLayout.tsx` until the manual flow shell is mostly orchestration.
- Split normalization modal state and rendering.
- Reduce report/session service `any` debt by replacing dynamic response objects with typed API contracts.
- Keep file-size, type-debt, and debug-surface baselines moving down; do not re-add `useStartupValuationStore.ts` to oversized debt.

## Adding A Feature Safely

Prefer feature-owned hooks and components over global store expansion. If state becomes cross-flow, first create a typed domain contract, then wire persistence/actions around it.
