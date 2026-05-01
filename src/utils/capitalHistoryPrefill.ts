/**
 * Studio → SaaS hand-off for the capital-history block.
 *
 * The Studio v2 wizard collects the founder's intended round size and
 * total dilution-to-exit assumption.  When a Series A founder (or a
 * seed-with-revenue founder) clicks the amber/sky banner in
 * ``CompanyCardStep`` to redirect to the standard SaaS valuation method
 * (`/{locale}/reports/new?selected_method=arr_multiple`), they shouldn't
 * have to re-type those numbers on the SaaS form's
 * ``CapitalHistorySection``.
 *
 * Mechanism: the banner's onClick writes a small JSON snapshot into
 * sessionStorage right before the navigation.  ``CapitalHistorySection``
 * consumes-and-clears the snapshot once on mount so the prefill is
 * one-shot — refreshing the SaaS page after editing fields never
 * re-overwrites the founder's typed values.
 *
 * Why sessionStorage and not the URL query string?
 *   - Round size and dilution percentage in a URL invite copy/paste
 *     leaks (they end up in browser history and any analytics that
 *     captures full URLs).
 *   - The redirect lives inside the same browser tab, so sessionStorage
 *     is the natural scope: it survives the navigation and dies when
 *     the tab closes.
 *
 * The shape is deliberately minimal — only the two fields whose absence
 * was concretely complained about in the audit ("round being raised"
 * and "total dilution to exit").  We never carry SAFE notes through
 * because the SaaS path renders its own SAFE editor and double-seeding
 * would silently merge two source-of-truths.
 */

const STORAGE_KEY = 'venus_studio_to_saas_capital_prefill'

/**
 * Snapshot written by the Studio banners and read by
 * ``CapitalHistorySection``.  Numbers are stored as ``number | null``
 * so a missing field doesn't mistakenly overwrite a typed value.
 */
export interface CapitalHistoryPrefill {
  /** Round being raised (€).  Maps to ``formData.capital_round_amount``. */
  round_amount: number | null
  /**
   * Total dilution from now → exit (%).  Not consumed by the SaaS form
   * directly but kept on the snapshot for symmetry: a future iteration
   * may surface a dilution-to-exit hint above the cap-table simulator
   * card on the SaaS path.  Including it now means we don't churn the
   * snapshot shape later.
   */
  dilution_pct: number | null
  /**
   * Source of the prefill ("studio" today; reserved for future
   * "wizard"-style hand-offs from other surfaces).  Drives observability
   * and lets the consuming side branch on intent if it ever needs to.
   */
  source: 'studio'
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

/**
 * Persist a Studio → SaaS prefill snapshot.  Silently no-ops on the
 * server (Next.js SSR pass) or when sessionStorage is locked down by
 * the user agent (Safari private mode).  We never throw — the user
 * still gets to the SaaS page; the only loss is a typed re-entry.
 */
export function writeCapitalHistoryPrefill(prefill: CapitalHistoryPrefill): void {
  if (!isBrowser()) return
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prefill))
  } catch {
    // QuotaExceededError, security errors, third-party-cookies-disabled —
    // any of these shouldn't block the redirect.
  }
}

/**
 * Read-and-clear the Studio → SaaS prefill snapshot.  Returns ``null``
 * when nothing was queued, when sessionStorage is unavailable, or when
 * the snapshot is malformed (drops it on the floor in that case so a
 * corrupted entry from an older client doesn't sit forever).
 *
 * The "consume" semantic is critical: callers run this once on mount,
 * apply the values, and drop the snapshot in the same atomic step.
 * That way a refresh of the SaaS page after the user has edited fields
 * never re-overwrites their typed values.
 */
export function consumeCapitalHistoryPrefill(): CapitalHistoryPrefill | null {
  if (!isBrowser()) return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    // Always clear, even on parse failure — never leave a corrupt entry.
    window.sessionStorage.removeItem(STORAGE_KEY)
    const parsed = JSON.parse(raw) as Partial<CapitalHistoryPrefill> | null
    if (!parsed || typeof parsed !== 'object') return null
    const round = typeof parsed.round_amount === 'number' && Number.isFinite(parsed.round_amount)
      ? parsed.round_amount
      : null
    const dilution =
      typeof parsed.dilution_pct === 'number' && Number.isFinite(parsed.dilution_pct)
        ? parsed.dilution_pct
        : null
    if (round === null && dilution === null) return null
    return {
      round_amount: round,
      dilution_pct: dilution,
      source: 'studio',
    }
  } catch {
    return null
  }
}
