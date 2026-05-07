import { redirect } from 'next/navigation'
import { buildPreservedReportBootstrapQueryString } from '@/lib/cross-app/preservedReportBootstrapParams'

export const dynamic = 'force-dynamic'

interface CalculatorPageProps {
  params: Promise<{ locale: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

/**
 * /calculator — Clarity Aurora parity route.
 * - With `reportId` (UUID): open that valuation workspace (Mercury deep link).
 * - Otherwise: same as /reports/new (preserve bootstrap query params).
 */
export default async function CalculatorPage({ params, searchParams }: CalculatorPageProps) {
  let locale = 'en'
  try {
    const p = await params
    locale = p.locale
  } catch {
    // fallback
  }

  const sp = searchParams ? await searchParams : {}
  const rid = sp.reportId
  const reportId = Array.isArray(rid) ? rid[0] : rid
  const suffix = buildPreservedReportBootstrapQueryString(sp)

  if (reportId && typeof reportId === 'string' && reportId.trim().length > 0) {
    redirect(`/${locale}/reports/${encodeURIComponent(reportId.trim())}${suffix}`)
  }

  redirect(`/${locale}/reports/new${suffix}`)
}
