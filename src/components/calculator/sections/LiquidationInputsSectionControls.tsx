import { ChevronDown } from 'lucide-react'
import type React from 'react'

import { AuroraInput } from '@/design-system'
import { cn } from '@/design-system/utils'
import {
  formatLiquidationPercentDisplay,
  parseLiquidationPercentInput,
} from '@/lib/methods/liquidation_analysis/liquidationInputModel'

/**
 * Decimal-percent input used for the advanced WACC / uplift fields.
 *
 * The engine stores these as decimals (0.15 = 15 %) but the advisor
 * thinks in whole percent. We round to a single decimal on display so
 * the float-multiply round-trip (0.155 -> 15.500000000000002) doesn't
 * leak garbage digits on re-render.
 */
export function LiquidationPercentInput({
  name,
  label,
  description,
  placeholder,
  value,
  onChange,
  disabled,
  min = 0,
  max = 100,
  step = 0.5,
  testId,
}: {
  name: string
  label: string
  description?: string
  placeholder?: string
  value?: number
  onChange: (next: number | undefined) => void
  disabled?: boolean
  min?: number
  max?: number
  step?: number
  testId?: string
}) {
  const display = formatLiquidationPercentDisplay(value)
  return (
    <AuroraInput
      id={name}
      name={name}
      label={label}
      description={description}
      type="number"
      inputMode="decimal"
      size="sm"
      truncateLabel={false}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      value={display}
      disabled={disabled}
      onChange={(e) => {
        const raw = e.target.value
        onChange(parseLiquidationPercentInput(raw))
      }}
      rightIcon={<span className="select-none text-xs font-medium text-foreground/40">%</span>}
      data-testid={testId}
      className="tabular-nums"
    />
  )
}

/** Visual divider between grouped panels inside the section card. */
export const LIQUIDATION_PANEL_GROUP =
  'space-y-3 border-b border-foreground/[0.06] px-4 py-3 last:border-b-0'

/** Compact eyebrow heading for each panel group ("Afbouw", "Belastingbrug", ...). */
export function LiquidationPanelEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[10px] font-semibold uppercase tracking-wider text-foreground/45">
      {children}
    </h4>
  )
}

/**
 * Disclosure toggle for an inline panel inside the section card.
 *
 * Sits flush against the parent card edges (no own border) so the card
 * still reads as a single grouped surface. The chevron rotates 180deg on
 * open so the open/closed state reads at a glance.
 */
export function LiquidationCollapsibleToggle({
  open,
  onToggle,
  title,
  subtitle,
  panelId,
  testId,
}: {
  open: boolean
  onToggle: () => void
  title: string
  subtitle?: string
  panelId: string
  testId?: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={panelId}
      className={cn(
        'flex w-full items-center justify-between gap-3 border-b border-foreground/[0.06] px-4 py-3 text-left',
        'transition-colors hover:bg-foreground/[0.02]',
        'focus-visible:relative focus-visible:z-[1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-inset',
        'last:border-b-0'
      )}
      data-testid={testId}
    >
      <span className="flex min-w-0 flex-col items-start gap-0.5">
        <span className="text-xs font-medium text-foreground/80">{title}</span>
        {subtitle ? (
          <span className="text-[10px] font-normal text-foreground/50">{subtitle}</span>
        ) : null}
      </span>
      <ChevronDown
        aria-hidden="true"
        className={cn(
          'h-4 w-4 shrink-0 text-foreground/45 transition-transform duration-200',
          open && 'rotate-180'
        )}
      />
    </button>
  )
}
