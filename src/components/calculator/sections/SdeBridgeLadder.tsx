'use client'

/**
 * SDE Bridge Ladder
 * -----------------
 * Renders the canonical Reported Net Income → SDE reconciliation as an
 * audit-trail style table. Consumes the `sde_bridge` payload returned
 * from the Step 2.7 SDE orchestrator (see step_2_7_orchestrator._build_sde_bridge).
 *
 * Each row shows the line label, signed amount, and running cumulative
 * total — the same artefact a buyer-side accountant would expect to see
 * before signing off on the headline SDE number.
 */

import { useMemo } from 'react'
import { useManualPreviewFormatters } from '@/lib/omniPreview'

export type SdeBridgeRow = {
  label: string
  amount: number
  running_total: number
  kind?: 'anchor' | 'addback' | 'subtract' | 'total'
}

export interface SdeBridgeLadderProps {
  rows: SdeBridgeRow[] | null | undefined
  ownerRole?: 'working' | 'passive'
  className?: string
}

export function SdeBridgeLadder({ rows, ownerRole, className }: SdeBridgeLadderProps) {
  const { currency } = useManualPreviewFormatters()
  const hasRows = Array.isArray(rows) && rows.length > 0

  const totalRow = useMemo(
    () => (hasRows ? rows!.find((r) => r.kind === 'total') : null),
    [rows, hasRows]
  )

  if (!hasRows) {
    return (
      <div
        className={`rounded-xl border border-dashed border-foreground/[0.12] px-4 py-5 text-center text-[12px] text-foreground/45 ${className ?? ''}`}
      >
        Run a calculation to see the Reported Net Income → SDE reconciliation.
      </div>
    )
  }

  return (
    <section
      className={`rounded-xl border border-foreground/[0.08] bg-background ${className ?? ''}`}
      aria-label="SDE reconciliation bridge"
    >
      <header className="flex items-center justify-between gap-3 border-b border-foreground/[0.06] px-4 py-3">
        <div>
          <h4 className="text-[12px] font-semibold uppercase tracking-wide text-foreground/65">
            Reported Net Income → SDE
          </h4>
          <p className="mt-0.5 text-[11px] leading-snug text-foreground/50">
            Audit trail of every add-back and adjustment used to derive the headline SDE.
          </p>
        </div>
        {ownerRole ? (
          <span className="rounded-full bg-primary/[0.08] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary/80">
            {ownerRole === 'passive' ? 'Passive investor' : 'Working owner'}
          </span>
        ) : null}
      </header>
      <ol className="divide-y divide-foreground/[0.06]">
        {rows!.map((row, idx) => {
          const isAnchor = row.kind === 'anchor'
          const isTotal = row.kind === 'total'
          const isNeg = row.amount < 0
          return (
            <li
              key={`${row.label}-${idx}`}
              className={`flex items-center justify-between gap-3 px-4 py-2.5 text-[12px] ${
                isTotal
                  ? 'bg-primary/[0.04] font-semibold text-foreground'
                  : isAnchor
                    ? 'bg-foreground/[0.02] text-foreground/80'
                    : 'text-foreground/75'
              }`}
            >
              <span className="flex-1 truncate">{row.label}</span>
              <span
                className={`tabular-nums ${
                  isNeg ? 'text-rose-500' : isTotal ? 'text-primary' : 'text-foreground/80'
                }`}
              >
                {currency.format(row.amount)}
              </span>
              <span
                className="w-28 text-right text-[11px] tabular-nums text-foreground/50"
                aria-label="Running total"
              >
                {currency.format(row.running_total)}
              </span>
            </li>
          )
        })}
      </ol>
      {totalRow ? (
        <footer className="flex items-center justify-between gap-3 border-t border-foreground/[0.06] px-4 py-2.5 text-[11px] text-foreground/50">
          <span>SDE</span>
          <span className="font-semibold tabular-nums text-foreground/80">
            {currency.format(totalRow.amount)}
          </span>
        </footer>
      ) : null}
    </section>
  )
}
