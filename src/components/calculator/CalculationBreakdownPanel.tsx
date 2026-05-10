'use client'

/**
 * Calculation Breakdown Panel
 *
 * @deprecated Renders only the empty state.
 *
 * The previous implementation included a hardcoded demo EBITDA waterfall
 * (€680k base, €60k owner-salary normalisation, "Industrial Manufacturing"
 * comparables) that would leak into any view as if it were real client data.
 * Because the panel has no callers in the Venus app today (`grep -rn
 * CalculationBreakdownPanel` returns only the export and the file itself),
 * the safe change is to neutralise the demo path here.
 *
 * Any future "Info tab" needs a method-aware implementation that consumes
 * the real `ValuationMethodResult.details`. For DCF, the canonical detail
 * card already lives in `ValuationEditModal.tsx` (`methodKey === 'dcf'`
 * branch) — model the rebuild after that, not this stub.
 */

import { BarChart3 } from 'lucide-react'
import { useTranslations } from 'next-intl'

export interface CalculationBreakdownPanelProps {
  /**
   * Kept for API compatibility with any latent caller. Ignored —
   * a real implementation must read method-specific values out of
   * `ValuationMethodResult.details`, not these abstract fields.
   */
  report?: {
    companyName: string
    valuation: number
    ebitda: number
    multiple: number
    metrics?: Array<{
      label: string
      value: string
      change?: number
    }>
  } | null
}

export function CalculationBreakdownPanel(_props: CalculationBreakdownPanelProps) {
  const t = useTranslations('calculationBreakdown')
  return (
    <div className="h-full flex items-center justify-center p-8 bg-background">
      <div className="text-center max-w-sm">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          <BarChart3 className="w-6 h-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">{t('noCalculationAvailable')}</h3>
        <p className="text-sm text-muted-foreground mt-2">{t('noCalculationDesc')}</p>
      </div>
    </div>
  )
}
