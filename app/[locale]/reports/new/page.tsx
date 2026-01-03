import { redirect } from 'next/navigation'
import { generateReportId } from '../../../../src/utils/reportIdGenerator'

interface NewReportPageProps {
  params: Promise<{ locale: string }> | { locale: string }
}

export default async function NewReportPage({ params }: NewReportPageProps) {
  // Handle both Promise and plain object params
  const resolvedParams = params instanceof Promise ? await params : params
  const { locale } = resolvedParams
  
  // Generate new report ID and redirect with locale
  const newReportId = generateReportId()
  redirect(`/${locale}/reports/${newReportId}`)
}
