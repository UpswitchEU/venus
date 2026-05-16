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

export function getFirstRenderableReportHtml(
  ...htmlReports: Array<string | null | undefined>
): string | undefined {
  for (const html of htmlReports) {
    const renderableHtml = getRenderableReportHtml(html)
    if (renderableHtml) return renderableHtml
  }
  return undefined
}

export function getRenderableReportHtmlFromCurrentOrFallback(
  currentHtmlReports: Array<string | null | undefined>,
  fallbackHtmlReports: Array<string | null | undefined>,
  options?: {
    currentRenderFingerprint?: string | null
    fallbackRenderFingerprint?: string | null
  }
): string | undefined {
  const currentRenderableHtml = getFirstRenderableReportHtml(...currentHtmlReports)
  if (currentRenderableHtml) return currentRenderableHtml

  const currentHasSafetyNetHtml = currentHtmlReports.some(isSafetyNetReportHtml)
  if (currentHasSafetyNetHtml) return undefined

  const currentFingerprint = options?.currentRenderFingerprint?.trim()
  const fallbackFingerprint = options?.fallbackRenderFingerprint?.trim()
  if (currentFingerprint && (!fallbackFingerprint || fallbackFingerprint !== currentFingerprint)) {
    return undefined
  }

  return getFirstRenderableReportHtml(...fallbackHtmlReports)
}
