# Session Robustness Implementation

**Status:** Retired historical implementation note.

This document previously described an older session hardening pass and named components that are no longer active. The current session architecture is auth-first and has a single canonical valuation session store.

Use the current sources instead:

- `src/store/SESSION_STORES.md`
- `src/store/useSessionStore.ts`
- `src/services/session/SessionService.ts`
- `src/services/api/session/SessionAPI.ts`
- `src/lib/bootstrap/SessionBootstrapService.ts`
- `src/hooks/useBootstrapSync.ts`
