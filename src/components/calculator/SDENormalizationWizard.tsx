'use client'

import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from 'lucide-react'
import { AuroraButton as Button } from '@/design-system/components/Button'
import { cn } from '@/design-system/utils'
import type { AccountingSdeFlag } from '@/services/api/accounting'

export interface SDENormalizationWizardProps {
  flags: AccountingSdeFlag[]
  decisions: Record<string, 'accepted' | 'rejected' | undefined>
  onDecision: (flag: AccountingSdeFlag, decision: 'accepted' | 'rejected') => void
}

function flagKey(flag: AccountingSdeFlag) {
  return `${flag.year ?? 'current'}:${flag.ledger_code}:${flag.ledger_name}`
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value)
}

export function SDENormalizationWizard({
  flags,
  decisions,
  onDecision,
}: SDENormalizationWizardProps) {
  if (flags.length === 0) return null

  return (
    <section className="space-y-3 rounded-2xl border border-warning/20 bg-warning/[0.04] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-warning/10">
          <HelpCircle className="h-5 w-5 text-warning" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">SDE normalization wizard</h3>
          <p className="mt-1 text-sm text-foreground/65">
            ValuationIQ flagged these imported MAR 61/62 items as unusual against Belgian benchmarks. Confirm
            which ones should be added back to normalized EBITDA.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {flags.map((flag) => {
          const key = flagKey(flag)
          const decision = decisions[key]
          return (
            <div
              key={key}
              className={cn(
                'rounded-2xl border p-4 transition-colors',
                decision === 'accepted'
                  ? 'border-success/25 bg-success/[0.05]'
                  : decision === 'rejected'
                    ? 'border-foreground/10 bg-background/70'
                    : 'border-foreground/10 bg-background/60'
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/55">
                    <span className="rounded-full bg-background px-2.5 py-1 font-medium">
                      FY {flag.year ?? 'latest'}
                    </span>
                    <span className="rounded-full bg-background px-2.5 py-1 font-medium">
                      MAR {flag.ledger_code}
                    </span>
                    <span className="rounded-full bg-background px-2.5 py-1 font-medium">
                      {formatCurrency(flag.amount)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">{flag.suggested_question}</p>
                  <p className="mt-1 text-xs text-foreground/60">
                    {flag.rationale ||
                      `${flag.ledger_name} is ${flag.actual_pct_of_revenue?.toFixed(1) ?? flag.deviation_pct.toFixed(1)}% of revenue versus a ${flag.benchmark_median_pct.toFixed(1)}% benchmark median.`}
                  </p>
                </div>
                <div className="text-right text-xs text-foreground/55">
                  <div className="flex items-center justify-end gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                    <span>{flag.deviation_pct.toFixed(1)}pp above benchmark</span>
                  </div>
                  {flag.confidence != null ? (
                    <div className="mt-1">Confidence {(flag.confidence * 100).toFixed(0)}%</div>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" onClick={() => onDecision(flag, 'accepted')} variant="primary">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Yes, add back
                </Button>
                <Button type="button" onClick={() => onDecision(flag, 'rejected')} variant="secondary">
                  <XCircle className="mr-2 h-4 w-4" />
                  No, keep as reported
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default SDENormalizationWizard
