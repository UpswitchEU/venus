'use client'

import { ShieldCheck } from 'lucide-react'
import { memo } from 'react'
import { cn } from '@/design-system/utils'
import type { PresentationContract } from '../../types/valuation'

interface PresentationContractPanelProps {
  contract: PresentationContract | null | undefined
}

/**
 * BET-462 — the honest tier label for the valuation number rendered in the report
 * below. The headline figure itself lives in the backend-generated HTML report
 * (already contract-aware server-side); this panel sits next to it and labels it
 * by tier so the confidence + disclaimer are never lost in the React chrome. All
 * copy is the backend's brand-reviewed strings, rendered verbatim. Gated: renders
 * nothing until Titan attaches the contract, so behaviour is unchanged until then.
 */
const CONFIDENCE_TONE: Record<PresentationContract['confidence'], string> = {
  high: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800',
  medium: 'border-amber-500/35 bg-amber-500/10 text-amber-800',
  // Low confidence is an honest signal, not an error — neutral muted, not red.
  low: 'border-foreground/15 bg-foreground/[0.06] text-foreground/70',
}

function PresentationContractPanelInner({ contract }: PresentationContractPanelProps) {
  if (!contract) return null

  return (
    <section
      aria-label={contract.tierLabel}
      data-tier={contract.tier}
      className="rounded-lg border border-foreground/10 bg-background/90 px-3 py-2.5 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground/55">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {contract.tierLabel}
        </span>
        <span
          data-confidence={contract.confidence}
          className={cn(
            'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
            CONFIDENCE_TONE[contract.confidence]
          )}
        >
          {contract.confidenceLabel}
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-snug text-foreground/70">{contract.disclaimer}</p>
      {contract.tierDescription ? (
        <p className="mt-1 text-[11px] leading-snug text-foreground/45">
          {contract.tierDescription}
        </p>
      ) : null}
    </section>
  )
}

export const PresentationContractPanel = memo(PresentationContractPanelInner)

PresentationContractPanel.displayName = 'PresentationContractPanel'
