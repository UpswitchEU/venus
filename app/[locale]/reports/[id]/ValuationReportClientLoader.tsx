'use client'

import nextDynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { CalculatorShellSkeleton } from '../../../../src/components/calculator/CalculatorShellSkeleton'
import {
  getCanonicalReportAlias,
  REPORT_IDENTITY_PROMOTED_EVENT,
  type ReportIdentityPromotedDetail,
} from '../../../../src/utils/reportIdentityPromotion'

const ValuationReportClient = nextDynamic(() => import('./ValuationReportClient'), {
  ssr: false,
  loading: () => <CalculatorShellSkeleton />,
})

interface ValuationReportClientLoaderProps {
  reportId: string
  locale: string
  initialMode: 'edit' | 'view'
  initialVersion?: number
  urlParams: Record<string, string>
}

export function ValuationReportClientLoader(props: ValuationReportClientLoaderProps) {
  const router = useRouter()

  useEffect(() => {
    const replaceWithCanonicalReport = (canonicalReportId: string) => {
      if (canonicalReportId === props.reportId) return
      const search = typeof window === 'undefined' ? '' : window.location.search
      router.replace(
        `/${encodeURIComponent(props.locale)}/reports/${encodeURIComponent(canonicalReportId)}${search}`,
        { scroll: false }
      )
    }

    const storedAlias = getCanonicalReportAlias(props.reportId)
    if (storedAlias) replaceWithCanonicalReport(storedAlias)

    const onPromoted = (event: Event) => {
      const detail = (event as CustomEvent<ReportIdentityPromotedDetail>).detail
      if (!detail?.reportId) return
      if (detail.previousId !== props.reportId && detail.sessionKey !== props.reportId) return
      replaceWithCanonicalReport(detail.reportId)
    }

    window.addEventListener(REPORT_IDENTITY_PROMOTED_EVENT, onPromoted)
    return () => window.removeEventListener(REPORT_IDENTITY_PROMOTED_EVENT, onPromoted)
  }, [props.locale, props.reportId, router])

  return <ValuationReportClient {...props} />
}
