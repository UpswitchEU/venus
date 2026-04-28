/**
 * Report route `mode` query param — **orthogonal concerns overload one key:**
 *
 * 1. **Mercury embedding / persona** (`MERCURY_ADVISOR_URL_MODE`, `MERCURY_SELLER_EMBED_URL_MODE`):
 *    Calculator redirects and `VenusEmbeddedModal` iframe URLs set `mode=accountant` or `mode=seller`
 *    plus other params (`clientId`, embedded, …). **Not** the calculator edit/view toggle.
 *
 * 2. **UI editing** (`edit` | `view`): Toolbar shell read/write vs preview HTML report.
 *
 * Parse UI separately — use `parseReportModeSearchParam` / `parseReportModeForInitialUi`.
 *
 * **URL preservation:** When `useUrlState` collapses redundant UI `edit`, it must not strip
 * Mercury persona modes (`accountant` / `seller`); dropping them breaks iframe / refresh semantics.
 */

/** Calculator redirect + standalone links — advisor-for-client marker (paired with `clientId`). */
export const MERCURY_ADVISOR_URL_MODE = 'accountant' as const

/** Mercury → Venus iframe embed — seller edition vs advisor (`VenusEmbeddedModal`). */
export const MERCURY_SELLER_EMBED_URL_MODE = 'seller' as const

const NON_UI_EMBED_MODE_VALUES: ReadonlySet<string> = new Set([
  MERCURY_ADVISOR_URL_MODE,
  MERCURY_SELLER_EMBED_URL_MODE,
])

export function isMercuryAdvisorModeParam(raw: string | null | undefined): boolean {
  return raw?.trim() === MERCURY_ADVISOR_URL_MODE
}

/** Mercury uses `mode` for iframe/cross-app persona; preserve when syncing UI `mode=edit`. */
export function shouldPreserveMercuryEmbedMode(raw: string | null | undefined): boolean {
  const v = raw?.trim()
  return v != null && v !== '' && NON_UI_EMBED_MODE_VALUES.has(v)
}

/** UI-only modes read from URL for Radix shell / Titan bootstrap body. */
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
