# Venus Dirty State & Version Increment Audit (V1 → V2)

**Date:** 2025-03-04  
**Scope:** Dirty state tracking, CTA interceptor, RecalculateConfirmationPopup, version increment

---

## Summary

The dirty state and version-increment flow is **implemented and wired correctly**. The main CTA ("Bereken Schatting" / "Calculate Estimate") intercepts when `report && isDirty`, shows `RecalculateConfirmationPopup`, and on confirm submits to create V2. A robustness fix was added for type coercion in the dirty comparison (form inputs can send strings).

---

## 1. Dirty State Tracker

**Location:** `ManualLayout.tsx` (lines 678–726)

| Component | Purpose |
|-----------|---------|
| `isDirty` | `useState(false)` – true when user edits financial inputs after a report exists |
| `lastSubmittedFinancialSnapshotRef` | Stores `{ revenue, ebitda, yearlyFinancials }` from last successful submit |
| `handleFormDataChange` | Compares incoming form data with snapshot; sets `isDirty` when `result` exists and data differs |

**Logic:**
- Only runs when `result` exists (report has been generated).
- Compares `revenue`, `ebitda`, and `yearlyFinancials` (sorted by year) with the snapshot.
- Uses `Number()` coercion so string inputs (e.g. `"1000000"`) match numeric snapshot values.
- If `snapshot` is null (e.g. report restored from URL before first submit), marks dirty until baseline is set.

**Baseline on restore:** `useEffect` (lines 729–754) sets the snapshot from `formStoreData` when `result` exists but `lastSubmittedFinancialSnapshotRef` is null (report loaded from URL/session).

**Reset on report switch:** `useEffect` (lines 756–759) clears the snapshot and `isDirty` when `reportId` changes.

---

## 2. Form Data Change Wiring

**Location:** `ManualInputPanel.tsx` (lines 391–424)

- `onFormDataChange` is called from a debounced `useEffect` (300ms) when `formData` changes.
- Sends: `companyName`, `industry`, `country`, `yearFounded`, `ownerManagers`, `equityStake`, `businessType`, `revenue`, `ebitda`, `yearlyFinancials`, `current_year_data`.
- `ManualLayout` passes `handleFormDataChange` as `onFormDataChange` (line 2613).

---

## 3. CTA Button & Interceptor

**Location:** `ManualInputPanel.tsx` (lines 1502–1512), `ManualLayout.tsx` (lines 1314–1379)

| Step | Behavior |
|------|----------|
| CTA | "Bereken Schatting" (`mi('calculateEstimate')`) – `AuroraButton` with `type="submit"` |
| Submit handler | `handleSubmit` → `onSubmit(formData)` |
| Parent `onSubmit` | `wrappedOnSubmit` (ManualLayout) |

**`wrappedOnSubmit` flow:**
1. If `!reportId` → submit directly (new report).
2. **Dirty interceptor:** If `report && isDirty` → show `RecalculateConfirmationPopup`, store pending data, return.
3. Fetch versions (non-blocking).
4. If no existing valuation (V1) → submit directly.
5. Build request, detect changes vs previous version.
6. If `hasFormChanges || hasAnyNormalization` → show popup, return.
7. Otherwise → submit directly.

---

## 4. RecalculateConfirmationPopup

**Location:** `RecalculateConfirmationPopup.tsx`, `ManualLayout.tsx` (lines 2755, 3043)

- Title: "Nieuwe versie van bedrijfsschatting maken?" (nl) / "Create new version of valuation?" (en).
- Descriptions vary by `hasFormChanges` / `hasNormalizations`.
- On confirm: `handleConfirmRecalculate` → `handleManualSubmit(pendingSubmitDataRef.current)`.
- On cancel: `setShowRecalculateConfirmation(false)`, clear pending.

---

## 5. Version Increment (V1 → V2)

**Location:** `ManualLayout.tsx` – `handleManualSubmit` (lines 1085–1225)

| Step | Action |
|------|--------|
| Request | `reportId` (or `resolvedReportId`) sent to backend; Titan creates new version server-side |
| After success | `setIsDirty(false)`, update `lastSubmittedFinancialSnapshotRef` |
| Venus version | If `previousVersion` existed and changes are significant, `createVersion()` snapshots the new version in Venus |

`resolvedReportId` maps session keys to UUIDs so Titan receives the correct report ID.

---

## 6. Robustness Fix Applied

**Type coercion in dirty comparison:**
- `revenue` / `ebitda` from the form can be strings; snapshot uses numbers.
- Comparison now uses `Number()` for both sides.
- `yearlyFinancials` comparison normalizes `revenue` and `ebitda` with `Number()` before `JSON.stringify`.

---

## 7. Edge Cases

| Case | Handling |
|------|----------|
| Report loaded from URL | Snapshot set from `formStoreData` when `result` exists and snapshot is null |
| User on `/reports/new` with generated report | `report` and `result` exist; dirty interceptor applies |
| Session key vs UUID | `resolvedReportId` used for version API and Titan |
| Empty `yearlyFinancials` | `yfMatch` uses `!yf?.length` so empty array does not force dirty |
| Add/remove years | Full `yearlyFinancials` comparison catches structural changes |

---

## 8. Verification Checklist

- [x] `isDirty` set when user edits EBITDA/revenue after report exists
- [x] CTA intercepts when `report && isDirty`
- [x] RecalculateConfirmationPopup shown instead of silent overwrite
- [x] On confirm: submit → V2 created → `isDirty` reset → UI unlocked
- [x] `onFormDataChange` invoked for financial edits (debounced 300ms)
- [x] Type coercion for string vs number comparison

---

## 9. Launch-Readiness for Accountants

| Item | Status |
|------|--------|
| **Accessibility** | Escape key cancels popup (when not creating) |
| **Accessibility** | `role="dialog"` `aria-modal="true"` `aria-labelledby` `aria-describedby` |
| **Accessibility** | Focus moves to confirm button when popup opens |
| **UX** | Backdrop click cancels (when not creating) |
| **UX** | Loading state during creation (`isCreating`) disables cancel/confirm |
| **UX** | Clear copy: "Create Version v{nextVersion}" / "Versie v{nextVersion} maken" |
| **Robustness** | Type coercion for revenue/EBITDA (string vs number) |
| **Robustness** | `resolvedReportId` maps session keys to UUIDs for Titan |
| **Robustness** | Cancel clears `pendingSubmitDataRef` to avoid stale submit |
