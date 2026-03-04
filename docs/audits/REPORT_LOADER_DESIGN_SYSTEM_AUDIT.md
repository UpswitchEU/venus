# Report Loader Design System Audit — Sign-Off

**Date:** 2025-03-04  
**Scope:** Right panel loader ("Rapport genereren") and report container styling  
**Change:** Replaced `bg-white` with `bg-background` across report panel for design system compliance

---

## 1. Race Conditions

**Finding: No race conditions introduced.**

- Changes are purely presentational (CSS class names). No state, async logic, or side effects were modified.
- Loading state is driven by `isGenerating || isCalculating` from existing stores; logic unchanged.
- `AnimatePresence mode="wait"` ensures sequential exit/enter; no overlapping content.
- Report sync via `useEffect` (result → report) is unchanged; any placeholder flash is pre-existing and unrelated to this change.

---

## 2. Robust Functionality

**Finding: Functionality preserved.**

| Scenario | Before | After | Status |
|----------|--------|-------|--------|
| Calculate clicked | Loader + skeleton | Loader + skeleton | OK |
| Report loaded | Report HTML | Report HTML | OK |
| Empty state | Placeholder | Placeholder | OK |
| History tab | History panel | History panel | OK |
| Preview tab | Same logic | Same logic | OK |

- Conditional rendering (`report?.htmlReport`, `isGenerating`, `isCalculating`, `rightPanelView`) unchanged.
- `ReportSkeleton` and `ReportPlaceholder` unchanged; both already use design tokens.
- `Results.tsx` change is cosmetic; component still receives and renders HTML as before.

---

## 3. Design Robustness

**Finding: Design system compliant and robust.**

| Element | Token | Dark Mode | Light Mode |
|---------|-------|-----------|------------|
| Panel container | `bg-background` | Dark canvas | Light canvas |
| Loader text | `text-foreground/70` | Light on dark | Dark on light |
| Spinner | `border-primary` | Teal visible | Teal visible |
| ReportSkeleton | `bg-background`, `bg-foreground/*` | Correct | Correct |
| ReportPlaceholder | `bg-card`, `text-foreground` | Correct | Correct |

- No hardcoded `#fff` or `white` in modified areas.
- `.valuation-report` HTML keeps its own light styling (white pages, cover) from `valuation-report-print.css`; container background does not override it.
- Report content remains readable in both themes.

---

## 4. Files Modified

| File | Change |
|------|--------|
| `ManualLayout.tsx` | 7× `bg-white` → `bg-background`, `text-foreground/60` → `text-foreground/70` |
| `Results.tsx` | 1× `bg-white` → `bg-background` |

---

## 5. Sign-Off

**Audit complete.** The changes:

- Fix the white-on-white bug in dark mode
- Align with the design system
- Introduce no race conditions
- Preserve existing behavior

**Signed off for production.**
