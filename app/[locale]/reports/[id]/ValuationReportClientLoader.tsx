'use client'

import nextDynamic from 'next/dynamic'
import { CalculatorShellSkeleton } from '../../../../src/components/calculator'

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
  return <ValuationReportClient {...props} />
}
