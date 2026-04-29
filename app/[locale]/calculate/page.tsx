import { redirect } from 'next/navigation'
import { buildPreservedReportBootstrapQueryString } from '@/lib/cross-app/preservedReportBootstrapParams'

export const dynamic = 'force-dynamic'

interface CalculatePageProps {
  params: Promise<{ locale: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

/**
 * /[locale]/calculate — legacy alias for the valuation entry surface.
 * Forwards the same bootstrap allowlist as `/calculator` and `/reports/new`
 * so deep links never lose prefill, auth token handoff, or advisor context.
 */
export default async function CalculatePage({ params, searchParams }: CalculatePageProps) {
  let locale = 'en'
  try {
    const p = await params
    locale = p.locale
  } catch {
    // fallback
  }
  const sp = searchParams ? await searchParams : {}
  const suffix = buildPreservedReportBootstrapQueryString(sp)
  redirect(`/${locale}/reports/new${suffix}`)
}
