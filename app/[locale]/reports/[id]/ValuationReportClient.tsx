'use client'

import { ValuationReport } from '../../../../src/components/ValuationReport'

interface ValuationReportClientProps {
  reportId: string
  locale: string
  initialMode: 'edit' | 'view'
  initialVersion?: number
  urlParams: Record<string, string>
}

/**
 * ValuationReportClient - Client Component Wrapper
 *
 * This Client Component receives fully serialized props from the Server Component parent.
 * It handles all client-side rendering and state management.
 *
 * Benefits of this pattern:
 * - Clean Server/Client boundary
 * - No serialization issues with undefined values
 * - Proper handling of async params
 * - Works consistently across all locales
 */
export default function ValuationReportClient({
  reportId,
  locale,
  initialMode,
  initialVersion,
  urlParams,
}: ValuationReportClientProps) {
  // locale is passed but ValuationReport doesn't need it (i18n handled by NextIntlClientProvider in layout)
  return (
    <ValuationReport
      reportId={reportId}
      initialMode={initialMode}
      initialVersion={initialVersion}
      urlParams={urlParams}
    />
  )
}
