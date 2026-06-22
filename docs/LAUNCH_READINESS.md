# Venus Launch Readiness — CTO Summary

**Date:** February 2025  
**Status:** Ready for launch

---

## End-to-End Flow (Launch Critical)

### 1. New Report
- **Route:** `/{locale}/reports/new` → generates report ID → redirects to `/{locale}/reports/{id}`
- **Params preserved:** `prefilledQuery`, `clientToken`, `flow`, `mode`, `source`, `return_url`, `guestSessionId`, `embedded`
- **Bootstrap:** Creates new session via Titan; session created lazily on first save

### 2. Existing Report
- **Route:** `/{locale}/reports/{id}`
- **Bootstrap:** Loads session from Titan; detects existing vs new
- **Restoration:** Hydrates form store, results store, versions, normalizations from session data
- **Recent valuations:** Dropdown loads from `/api/reports` (proxies to Titan); supports `reports`, `data`, `items` response shapes

### 3. Data Entry
- **ManualInputPanel:** Form fields with validation, KBO lookup, auto-save
- **Auto-save:** Session persisted to Titan on field changes
- **Normalization:** NormalizationHub, UnifiedNormalizationModal, Titan `/api/normalization` proxy

### 4. Calculate & Submit
- **Request:** `buildValuationRequest()` → `ValuationAPI.calculateValuation()` → Titan `/api/v2/valuations/calculate`
- **Client context:** Headers `X-Client-Context-User`, `X-Client-Context-Accountant`, `X-Client-Context-Relationship` for accountant flow
- **ValuationIQ:** Titan proxies to ValuationIQ engine; returns valuation result

### 5. Receive Report & Assets
- **Response:** `ValuationResponse` with `valuation`, `html_report`, `info_tab_html`, etc.
- **Save:** `reportAssetService.saveReportAssets()` — serialized atomic save of sessionData, valuationResult, and htmlReport
- **Display:** ValuationReportPanel renders HTML report; version history stored

### 6. PDF Export
- **Primary:** Server-side PDF via `/api/valuations/[id]/pdf`
- **Fallback:** Client-side html2pdf.js if server fails
- **Download history:** Tracked in CalculatorNav

---

## Clarity/Aurora Parity

| Area | Status |
|------|--------|
| Left panel | Fixed, layout persistence, min 25%, max 50%, `collapsible={false}` |
| Drag-to-resize | ResizableHandle with `withHandle`, `cursor-col-resize`, `hover:bg-primary/20` |
| Animations | `springDefault` + Aurora spring easing (`cubic-bezier(0.34, 1.56, 0.64, 1)`) for panel transitions, fade-in, slide-in, scale-in |
| Avatar | `user.avatar_url`/`user.avatar`, initials from `user.name`, Mercury/Titan |
| Logout | Redirects to Mercury login with `returnUrl` |
| Account settings | Mercury `/{locale}/accountant/settings` |
| ContextBar | Client/business links to Mercury |
| Locale | `useLocale()`, `LocaleHtmlSync`, Dutch `/nl/`, `/calculate` → `/{locale}/reports/new` |
| Toasts | Sonner Toaster, Aurora styling |
| Keyboard | Escape, Cmd/Ctrl+K |
| /calculate, /calculator | Clarity parity: `/{locale}/calculate`, `/{locale}/calculator`, `/calculate`, `/calculator` → new report |
| 404 page | Aurora design tokens, locale-aware links (en/nl from path) |

---

## Titan/ValuationIQ Integration

- **Valuation:** `POST /api/v2/valuations/calculate` → ValuationIQ
- **Session:** Bootstrap, session create/load/update
- **Reports:** `GET /api/v2/valuations/reports` for recent list
- **Normalization:** `/api/normalization/[...path]` proxy
- **Auth:** JWT cookies; redirect to Mercury when unauthenticated

---

## Accountant Flow

- **Bootstrap:** `clientToken` or `clientId` in URL → client context exchange
- **Context:** `useClientContext` store; headers sent with valuation requests
- **ContextBar:** Shows client, business; links to Mercury `accountant/clients/{id}`, `accountant/clients/{id}/valuations`

---

## Pre-Launch Checklist

- [x] New report creation
- [x] Existing report loading
- [x] Form data entry and auto-save
- [x] Valuation calculation (Titan → ValuationIQ)
- [x] Report display and asset save
- [x] PDF export (server + fallback)
- [x] Recent valuations dropdown
- [x] Accountant mode and client context
- [x] Avatar + Mercury/Titan auth
- [x] Dutch locale
- [x] Design parity with Clarity
