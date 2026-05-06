/**
 * True when the URL is within the valuation product surface (calculator or reports).
 * Marks calculator/report URLs as the active “Waardering” workspace for parity with Mercury routing helpers.
 *
 * Uses segment boundaries (`/reports/` or `/reports` at end) so paths like `/en/reports-archive` do not match.
 */
export function isValuationActiveWorkspacePath(pathname: string | null | undefined): boolean {
  const p = pathname ?? ''
  return /\/calculator(\/|$)/.test(p) || /\/reports(\/|$)/.test(p)
}
