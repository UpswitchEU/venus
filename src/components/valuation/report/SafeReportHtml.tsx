'use client'

import { memo, useLayoutEffect, useRef } from 'react'
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
  const htmlRootRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const root = htmlRootRef.current
    if (!root) return

    root.replaceChildren(HTMLProcessor.sanitizeToFragment(html, root.ownerDocument))

    return () => {
      root.replaceChildren()
    }
  }, [html])

  return (
    <div className={wrapperClassName}>
      <div ref={htmlRootRef} className={className} />
    </div>
  )
})
