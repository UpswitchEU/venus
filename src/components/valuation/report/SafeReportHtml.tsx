'use client'

import { memo, useMemo } from 'react'
import { HTMLProcessor } from '@/utils/htmlProcessor'

export interface SafeReportHtmlProps {
  html: string
  className?: string
  wrapperClassName?: string
}

export const SafeReportHtml = memo(function SafeReportHtml({
  html,
  className,
  wrapperClassName = 'valuation-report',
}: SafeReportHtmlProps) {
  const sanitizedHtml = useMemo(() => HTMLProcessor.sanitize(html), [html])

  return (
    <div className={wrapperClassName}>
      <div className={className} dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
    </div>
  )
})
