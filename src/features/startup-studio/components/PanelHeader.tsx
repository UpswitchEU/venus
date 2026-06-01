'use client'

/**
 * PanelHeader
 * -----------
 *
 * Minimal brand strip at the top of the startup-valuation input
 * panel. The left panel is for **data input** — accurate prefilled
 * defaults plus user overrides. Output (live blend, range, method
 * mix, advisory) lives on the ValuationIQ report on the right rail.
 *
 * Earlier iterations of this header carried a live cap-summary pill
 * (running blended pre-money + range), the EV/Revenue formula line,
 * a methodology subtitle paragraph, and a section-progress chip. All
 * of that was output / advisory content that bled the report's job
 * into the input panel — removed 2026-05-10 to keep the input/output
 * separation clean. The brand chip stays so an M&A reader scanning
 * the page sees what method they're looking at; everything else
 * moved to the report.
 */

import { useTranslations } from 'next-intl'

interface PanelHeaderProps {
  /** @deprecated kept so existing call-sites compile; ignored. */
  jumpAnchor?: string
  /** @deprecated section completion lives on the report side now. */
  sectionsComplete?: number
  /** @deprecated section completion lives on the report side now. */
  sectionsPartial?: number
  /** @deprecated section completion lives on the report side now. */
  sectionsTotal?: number
}

export function PanelHeader(_props: PanelHeaderProps) {
  const t = useTranslations('startupStudio.panelHeader')
  return (
    <header className="-mx-4 -mt-4 mb-2 border-b border-foreground/10 bg-background/85 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:-mt-6 sm:px-6">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
          {t('badge')}
        </span>
        <h1 className="text-base font-semibold leading-tight text-foreground">{t('title')}</h1>
      </div>
    </header>
  )
}

export default PanelHeader
