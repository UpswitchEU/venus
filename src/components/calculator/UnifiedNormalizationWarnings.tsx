'use client'

import { AlertCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'

export interface AutoNormalizationCapBreach {
  year: number
  autoAddback: number
  addbackPctOfEbitda: number
  capAmount: number
}

interface AutoNormalizationCapWarningProps {
  breaches: AutoNormalizationCapBreach[]
  isDutch: boolean
  formatCurrency: (amount: number) => string
}

export function AutoNormalizationCapWarning({
  breaches,
  isDutch,
  formatCurrency,
}: AutoNormalizationCapWarningProps) {
  const nh = useTranslations('normalizationHub')

  if (breaches.length === 0) return null

  return (
    <div className="px-6 pt-3 pb-1 shrink-0">
      <div className="rounded-xl border border-warning/25 bg-warning/[0.04] p-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {isDutch
                ? 'Review vereist: auto-normalisaties overschrijden verdedigbaarheidslimiet'
                : 'Review required: auto normalizations exceed defensibility cap'}
            </p>
            <p className="mt-0.5 text-xs text-foreground/70">
              {isDutch
                ? 'Deze jaren overschrijden 50% van de gerapporteerde EBITDA met auto-toegepaste addbacks. Onderbouw of corrigeer vóór externe deling.'
                : 'These years exceed 50% of reported EBITDA via auto-applied addbacks. Substantiate or correct before external sharing.'}
            </p>
            <ul className="mt-2 space-y-1">
              {breaches.slice(0, 3).map((breach) => (
                <li key={breach.year} className="text-xs font-mono text-foreground/75 tabular-nums">
                  {nh('autoCapBreachLine', {
                    year: breach.year,
                    addback: formatCurrency(breach.autoAddback),
                    pct: breach.addbackPctOfEbitda.toFixed(1),
                    cap: formatCurrency(breach.capAmount),
                  })}
                </li>
              ))}
              {breaches.length > 3 && (
                <li className="text-xs text-foreground/60">
                  {nh('autoCapBreachMoreYears', {
                    count: breaches.length - 3,
                  })}
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

interface TaxLatencyReviewWarningProps {
  visible: boolean
  isDutch: boolean
}

export function TaxLatencyReviewWarning({ visible, isDutch }: TaxLatencyReviewWarningProps) {
  if (!visible) return null

  return (
    <div className="mb-3 shrink-0 rounded-xl border border-warning/25 bg-warning/[0.04] p-3">
      <div className="flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {isDutch
              ? 'Review vereist: belastinglatenties ontbreken'
              : 'Review required: tax latencies missing'}
          </p>
          <p className="mt-0.5 text-xs text-foreground/70">
            {isDutch
              ? 'Er zijn nog geen belastinglatenties toegepast terwijl er importsignalen beschikbaar zijn. Beoordeel en voeg de relevante regels toe voor een verdedigbare EV→Equity brug.'
              : 'No tax latencies are applied yet while import signals are available. Review and add relevant rows for a defensible EV→Equity bridge.'}
          </p>
        </div>
      </div>
    </div>
  )
}
