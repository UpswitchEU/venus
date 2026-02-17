import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * /calculator — Clarity Aurora parity route (Clarity uses /calculator)
 * Redirects to new report creation (same as /reports/new)
 */
export default async function CalculatorPage({ params }: { params: Promise<{ locale: string }> }) {
  let locale = 'en'
  try {
    const p = await params
    locale = p.locale
  } catch {
    // fallback
  }
  redirect(`/${locale}/reports/new`)
}
