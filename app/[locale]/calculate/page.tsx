import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * /calculate — Clarity Aurora parity route
 * Redirects to new report creation (same as /reports/new)
 */
export default async function CalculatePage({ params }: { params: Promise<{ locale: string }> }) {
  let locale = 'en'
  try {
    const p = await params
    locale = p.locale
  } catch {
    // fallback
  }
  redirect(`/${locale}/reports/new`)
}
