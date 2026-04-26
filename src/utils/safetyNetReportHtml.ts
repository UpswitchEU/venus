export function isSafetyNetReportHtml(html: string | null | undefined): boolean {
  if (!html) return false
  const normalized = html.toLowerCase()
  const hasSummaryClass = /class\s*=\s*["'][^"']*\bvaluation-summary\b[^"']*["']/.test(normalized)
  return (
    hasSummaryClass ||
    normalized.includes('waardeschatting — samenvatting') ||
    normalized.includes('valuation — summary')
  )
}

export function getRenderableReportHtml(html: string | null | undefined): string | undefined {
  if (!html || isSafetyNetReportHtml(html)) return undefined
  return html
}
