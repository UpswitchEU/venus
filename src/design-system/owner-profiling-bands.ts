/**
 * Owner Profiling risk-band design tokens — Venus mirror.
 *
 * Source of truth lives at
 * `apps/mercury/design-system/tokens/owner-profiling-bands.ts`.
 * THIS FILE MUST BE A LINE-FOR-LINE COPY of the Mercury module
 * (sans this header). The cross-app parity test at
 * `apps/mercury/tests/unit/design-system/op-bands-parity.test.ts`
 * imports both modules' HSL triples and asserts equality.
 *
 * If you tune a band color, edit BOTH files in the same PR. The
 * parity test will fail otherwise.
 */

/**
 * Owner Profiling risk band — drives chip chrome, headline color,
 * and section accents.
 */
export type OwnerProfilingBand = 'good' | 'caution' | 'warn' | 'neutral'

/**
 * Canonical HSL triple (no parens) per band. Mirrors the values
 * inlined in `main_report/pages/owner_profiling.html` and
 * `main_report_pdf/pages/owner_profiling.html`.
 */
export const OP_BAND_HSL: Readonly<Record<OwnerProfilingBand, string>> = {
  good: '143, 40%, 42%',
  caution: '37, 65%, 55%',
  warn: '6, 55%, 50%',
  neutral: '224, 10%, 45%',
} as const

/**
 * Pre-computed Tailwind class triples (border / background / text).
 */
export const OP_BAND_TAILWIND: Readonly<
  Record<OwnerProfilingBand, { border: string; bg: string; text: string }>
> = {
  good: {
    border: 'border-emerald-500/45',
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-950',
  },
  caution: {
    border: 'border-amber-500/50',
    bg: 'bg-amber-500/15',
    text: 'text-amber-950',
  },
  warn: {
    border: 'border-red-600/45',
    bg: 'bg-red-600/15',
    text: 'text-red-950',
  },
  neutral: {
    border: 'border-muted-foreground/40',
    bg: 'bg-muted/40',
    text: 'text-foreground',
  },
} as const

/** `hsl(<triple>)` or `hsl(<triple> / <alpha>)`. */
export function opBandHslFn(band: OwnerProfilingBand, alpha?: number): string {
  const triple = OP_BAND_HSL[band]
  if (alpha === undefined) return `hsl(${triple})`
  return `hsl(${triple} / ${alpha})`
}

export const OP_BAND_SEVERITY_ORDER: readonly OwnerProfilingBand[] = [
  'good',
  'neutral',
  'caution',
  'warn',
] as const
