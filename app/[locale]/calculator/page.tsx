import { redirect } from 'next/navigation'

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
  const rest = Object.entries(sp).filter(([k]) => k !== 'reportId')
  const qs =
    rest.length > 0
      ? '?' +
        rest
          .map(([k, v]) => {
            const val = Array.isArray(v) ? v[0] : v
            return val != null ? `${encodeURIComponent(k)}=${encodeURIComponent(String(val))}` : ''
          })
          .filter(Boolean)
          .join('&')
      : ''

  if (reportId && typeof reportId === 'string' && reportId.trim().length > 0) {
    redirect(`/${locale}/reports/${encodeURIComponent(reportId.trim())}${qs}`)
  }

  redirect(`/${locale}/reports/new${qs}`)
}
