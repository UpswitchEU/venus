# Venus Recent Valuations Dropdown & Delete Logic Audit

**Date:** 2025-03-04  
**Scope:** Recent valuations dropdown, 3-dot menu, delete action

---

## Summary

Fixes applied to address "Geen recente schattingen" when viewing a report and 3-dot menu accessibility:

1. **Prepend logic** – Current report is always shown when viewing one
2. **ID matching** – `resolvedReportId` included in matching so session keys and UUIDs align
3. **3-dot menu** – `onMouseDown` stopPropagation added so nested dropdown stays open
4. **Refetch after delete** – Reports list is refetched after deleting a non-current report

---

## 1. Recent Valuations Dropdown

**Location:** `CalculatorNav.tsx` (lines 332–435), `ManualLayout.tsx` (lines 1935–2040)

| Fix | Description |
|-----|-------------|
| **Prepend condition** | `shouldPrepend` now uses `(currentId \|\| reportId \|\| report) && !inList` so the current report is shown when viewing one |
| **ID matching** | `inList` checks `idForMatch` (resolvedReportId \|\| currentId) and all ID variants (session.reportId, session.key, reportId, resolvedReportId) |
| **Company name** | Uses `report?.companyName` when available |
| **UpdatedAt** | Uses `report?.generatedAt` when session dates are missing |
| **Prepend ID** | Uses `session?.reportId \|\| resolvedReportId \|\| currentId \|\| reportId` for consistency |

---

## 2. 3-Dot Context Menu

**Location:** `CalculatorNav.tsx` (lines 378–426)

| Item | Status |
|------|--------|
| **Visibility** | Shown when `onDeleteValuation` is passed (always from ManualLayout) |
| **Icon** | `MoreVertical` (3-dot) |
| **Propagation** | `onClick` and `onMouseDown` stopPropagation so parent dropdown stays open when opening the menu |
| **aria-label** | Uses `t('valuation.deleteReportTitle')` |

---

## 3. Delete Action

**Location:** `CalculatorNav.tsx` (lines 404–416), `ManualLayout.tsx` (lines 2075–2115)

| Step | Behavior |
|------|----------|
| **Confirmation** | `window.confirm` with `t('valuation.deleteReportConfirm', { name })` |
| **API** | `reportService.deleteReport(id)` → `DELETE /api/v2/valuations/reports/{id}` |
| **Current report** | Clears session, navigates to most recent remaining or Mercury/new |
| **Other report** | Filters local list and calls `fetchRecentValuations()` |
| **Error** | Toast with `tReport('deleteReportFailed')` |
| **Loading** | `deletingValuationId` shows spinner on the 3-dot button |

---

## 4. Data Flow

```
ManualLayout
  ├── fetchRecentValuations() → /api/reports
  ├── rawRecentValuations (state)
  ├── recentValuations (useMemo: prepend current when not in list)
  └── CalculatorNav
        ├── recentValuations
        ├── activeReportId={resolvedReportId || reportId}
        ├── onSelectValuation → router.push(/reports/{id})
        ├── onDeleteValuation → handleDeleteValuation
        └── deletingValuationId
```

---

## 5. Edge Cases

| Case | Handling |
|------|----------|
| API returns empty | Prepend current report when we have reportId or report |
| Session key vs UUID | `resolvedReportId` used for matching and prepend |
| Delete current report | Redirect to remaining or Mercury/new |
| Delete other report | Filter local list + refetch |
| Nested dropdown | stopPropagation on 3-dot wrapper |
| Session key in isCurrentReport | `(session as any)?.key` included for robustness |

---

## 6. Launch-Readiness for Accountants

| Item | Status |
|------|--------|
| **Client context** | fetchRecentValuations forwards X-Client-User-Id etc. when accountant views client |
| **Accountant redirect** | Delete last report → Mercury dashboard (`/advisor/dashboard`) |
| **Client redirect** | Delete last report → Venus `/reports/new` |
| **Locale** | Mercury redirect uses `currentLocale` (nl/en) |
| **3-dot aria** | `valuation.deleteReportTitle` for screen readers |
| **Loading state** | Spinner on 3-dot during delete |
| **Error handling** | Toast with retry context on delete failure |
| **Confirmation** | Native confirm with company name (quick, reliable) |
