# M&A Workflow Architecture

**Status:** Retired historical architecture note.

The previous version of this document described an early client-side workflow and referenced retired save-status, audit-log, and comparison components. Keeping that content would make the documentation disagree with the active code.

Current architecture anchors:

- `src/features/manual/components/ManualValuationWorkspace.tsx`
- `src/features/manual/hooks/useManualSubmitController.ts`
- `src/features/manual/hooks/useManualVersionNavigation.ts`
- `src/features/manual/utils/manualVersioningDecision.ts`
- `src/store/useVersionHistoryStore.ts`
- `src/store/SESSION_STORES.md`
