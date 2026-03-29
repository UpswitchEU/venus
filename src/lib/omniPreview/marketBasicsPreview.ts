/**
 * Cross-method financial ratios from latest complete year (aligns inputs used by omni multiples).
 */

export function computeEbitdaMarginPct(
  revenue: number | undefined,
  ebitda: number | undefined
): number | null {
  if (
    revenue == null ||
    ebitda == null ||
    !Number.isFinite(revenue) ||
    !Number.isFinite(ebitda) ||
    revenue <= 0
  ) {
    return null
  }
  return (ebitda / revenue) * 100
}
