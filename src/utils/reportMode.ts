/**
 * Report route `mode` query param — **two orthogonal concerns overload one key:**
 *
 * 1. **Mercury advisor flow** (`MERCURY_ADVISOR_URL_MODE`): Mercury sets `mode=accountant` +
 *    `clientId` so Venus `auth.ts` runs `get-client-context`. This is NOT the calculator edit/view toggle.
 *
 * 2. **UI editing** (`edit` | `view`): Toolbar / valuation shell read/write vs preview HTML report.
 *
 * Valid UI values are only `edit` and `view`. Any other raw string (including `accountant`) must be
 * parsed for UI separately — use `parseReportModeSearchParam` / `parseReportModeForInitialUi`.
 *
 * **URL preservation:** When `useUrlState` syncs UI default `edit`, it must **not** strip
 * `mode=accountant`; that would break refresh-time advisor detection until metadata fallback runs.
 */

/** Cross-app Mercury → Venus advisor-for-client marker (see `CalculatorRedirectClient.tsx` → `searchParams.set('mode', …)`). */
export const MERCURY_ADVISOR_URL_MODE = 'accountant' as const

export function isMercuryAdvisorModeParam(raw: string | null | undefined): boolean {
  return raw?.trim() === MERCURY_ADVISOR_URL_MODE
}

/** UI-only modes read from URL for Radix shell / Titan bootstrap body (never `accountant`). */
export function parseReportModeSearchParam(
  raw: string | null | undefined
): 'edit' | 'view' | undefined {
  const v = raw?.trim()
  if (v === 'edit' || v === 'view') return v
  return undefined
}

/** Server page and client shell props: always concrete `edit` | `view` (unknown → `edit`). */
export function parseReportModeForInitialUi(raw: string | undefined): 'edit' | 'view' {
  return parseReportModeSearchParam(raw) ?? 'edit'
}
