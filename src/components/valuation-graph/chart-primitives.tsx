'use client'

/**
 * Shared chart visual vocabulary — ported from Mercury
 * (`shared/components/charts/chart-primitives.tsx`).
 *
 * Gradients, legend swatches and the popover surface for the valuation trend
 * chart. One difference from Mercury: Venus exposes its theme tokens as HSL
 * channel triplets (`--primary: 172 55% 45%`) consumed via `hsl(var(--token))`,
 * where Mercury stores full color values. So inline SVG fills/strokes here wrap
 * the token in `hsl(...)`; Tailwind class names (`bg-popover`, `border-border`)
 * already resolve through the same `hsl(var(--token))` mapping and are unchanged.
 */

import type { ReactNode } from 'react'

/**
 * The popover/readout surface — token-driven so it adapts to the active theme.
 * Used by the trend chart's hover tooltip.
 */
export const chartSurfaceClass =
  'rounded-lg border border-border/70 bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md'

/** Deterministic gradient ids from a `useId()` prefix (avoids cross-instance collisions). */
export function chartGradientIds(idPrefix: string) {
  return {
    band: `${idPrefix}-band`,
    line: `${idPrefix}-line`,
    surface: `${idPrefix}-surface`,
  }
}

/**
 * The confidence-band fill, line stroke and plot-surface gradients. Render inside
 * an SVG `<defs>`; reference via {@link chartGradientIds}.
 */
export function ChartGradientDefs({ idPrefix }: { idPrefix: string }) {
  const ids = chartGradientIds(idPrefix)
  return (
    <>
      <linearGradient id={ids.band} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
        <stop offset="55%" stopColor="hsl(var(--primary))" stopOpacity={0.12} />
        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
      </linearGradient>
      <linearGradient id={ids.line} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.85} />
        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={1} />
      </linearGradient>
      <linearGradient id={ids.surface} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.02} />
        <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
      </linearGradient>
    </>
  )
}

export type LegendTone = 'line' | 'band' | 'asking' | 'forecast'

/** Legend key shared across the trend chart's surfaces. */
export function LegendSwatch({ tone, children }: { tone: LegendTone; children: ReactNode }) {
  if (tone === 'forecast') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <svg width={20} height={4} aria-hidden focusable={false}>
          <title>Forecast</title>
          <line
            x1={0}
            y1={2}
            x2={20}
            y2={2}
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            strokeDasharray="4 3"
            strokeLinecap="round"
          />
        </svg>
        {children}
      </span>
    )
  }
  if (tone === 'asking') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <svg width={20} height={4} aria-hidden focusable={false}>
          <title>Asking price</title>
          <line
            x1={0}
            y1={2}
            x2={20}
            y2={2}
            stroke="hsl(var(--chart-3))"
            strokeWidth={2}
            strokeDasharray="3 3"
            strokeLinecap="round"
          />
        </svg>
        {children}
      </span>
    )
  }
  if (tone === 'band') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span
          className="h-2 w-5 rounded-full"
          style={{
            background:
              'linear-gradient(90deg, color-mix(in srgb, hsl(var(--primary)) 32%, transparent), color-mix(in srgb, hsl(var(--primary)) 14%, transparent))',
          }}
        />
        {children}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-[3px] w-5 rounded-full" style={{ background: 'hsl(var(--primary))' }} />
      {children}
    </span>
  )
}
