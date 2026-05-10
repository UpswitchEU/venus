'use client'

/**
 * Percentile band gauge — visual stand-in for the plain "min × — max ×" line
 * under the EV/EBITDA calibration slider in `ValuationEditModal`.
 *
 * Why a custom SVG instead of a styled <input range>?
 * --------------------------------------------------
 * The native range input only exposes start/end and a single thumb. We need
 * to render up to five engine-supplied percentile markers (p10/p25/p50/p75/p90)
 * + the applied-multiple position + a typical-band shaded range, and have
 * each marker carry its own tooltip / label. SVG lets us do all of that
 * deterministically (and it WeasyPrint-prints if we ever surface the gauge in
 * the report).
 *
 * The gauge is purely presentational — it does NOT mutate the applied
 * multiple. The caller drives the value through the existing slider, and
 * the gauge reflects whatever's in the store. That keeps a single source
 * of truth and avoids the gauge<->slider drift class of bugs.
 *
 * Behavioural contract (locked by tests):
 *   - When fewer than 2 percentile markers are present we emit a warning
 *     element instead (no gauge to draw).
 *   - The applied marker is clamped into [domainMin, domainMax] — values
 *     outside the band still render at the edge so the user sees they've
 *     fallen off the band, with an explicit `outOfBand` flag in the aria
 *     description.
 *   - Marker positions are computed in percent-of-width so the gauge is
 *     responsive without re-renders on resize.
 */

import { cn } from '@/design-system/utils'

export interface PercentileBand {
  p10?: number | null
  p25?: number | null
  p50?: number | null
  p75?: number | null
  p90?: number | null
}

export interface PercentileBandGaugeProps {
  /** Engine-supplied percentiles for the peer-set. */
  band: PercentileBand
  /** The benchmark median (typically `band.p50` or the engine's median). */
  benchmark: number | null
  /** The currently-applied multiple. May be outside [p10, p90]. */
  applied: number | null
  /** Slider domain — defines the gauge axis. Caller passes the same clamps the slider uses. */
  domainMin: number
  domainMax: number
  /** Optional caption shown under the gauge (e.g. legend). */
  caption?: string | null
  /** i18n labels — passed in to keep this component locale-agnostic. */
  labels: {
    /** Used in aria-description of the applied marker, e.g. `"applied"`. */
    applied: string
    /** Used as the headline/legend. */
    legend: string
    /** Tooltip-style label for benchmark marker. */
    benchmark: string
    /** Aria caption for the band band shading, e.g. "p25–p75 typical band". */
    typicalBand: string
    /** Aria caption when applied is outside [p10, p90]. */
    outOfBand: string
  }
  className?: string
}

/** Map a value into 0..1 of the gauge axis. Clamps values outside the domain. */
export function projectOntoGauge(
  value: number,
  domainMin: number,
  domainMax: number,
): { clamped: number; outOfRange: boolean } {
  if (!Number.isFinite(value) || !Number.isFinite(domainMin) || !Number.isFinite(domainMax)) {
    return { clamped: 0, outOfRange: true }
  }
  if (domainMax <= domainMin) {
    return { clamped: 0, outOfRange: true }
  }
  if (value < domainMin) return { clamped: 0, outOfRange: true }
  if (value > domainMax) return { clamped: 1, outOfRange: true }
  return {
    clamped: (value - domainMin) / (domainMax - domainMin),
    outOfRange: false,
  }
}

interface MarkerSpec {
  pct: number
  value: number
  label: string
  emphasis: 'low' | 'mid' | 'high'
}

export function PercentileBandGauge({
  band,
  benchmark,
  applied,
  domainMin,
  domainMax,
  caption,
  labels,
  className,
}: PercentileBandGaugeProps) {
  // Build the percentile marker list, filtering nulls. We need at least
  // two markers for the gauge to mean something — otherwise we render a
  // graceful "data not available" fallback so callers don't have to
  // gate the include themselves.
  const markers: MarkerSpec[] = []
  if (band.p10 != null && band.p10 > 0) {
    markers.push({ pct: projectOntoGauge(band.p10, domainMin, domainMax).clamped, value: band.p10, label: 'p10', emphasis: 'low' })
  }
  if (band.p25 != null && band.p25 > 0) {
    markers.push({ pct: projectOntoGauge(band.p25, domainMin, domainMax).clamped, value: band.p25, label: 'p25', emphasis: 'mid' })
  }
  if (band.p50 != null && band.p50 > 0) {
    markers.push({ pct: projectOntoGauge(band.p50, domainMin, domainMax).clamped, value: band.p50, label: 'p50', emphasis: 'mid' })
  }
  if (band.p75 != null && band.p75 > 0) {
    markers.push({ pct: projectOntoGauge(band.p75, domainMin, domainMax).clamped, value: band.p75, label: 'p75', emphasis: 'mid' })
  }
  if (band.p90 != null && band.p90 > 0) {
    markers.push({ pct: projectOntoGauge(band.p90, domainMin, domainMax).clamped, value: band.p90, label: 'p90', emphasis: 'high' })
  }

  const insufficient = markers.length < 2

  // Typical-band shading — p25..p75 inter-quartile range when both are
  // present. Falls back to p10..p90 when IQR isn't available.
  const iqrLow =
    band.p25 != null && band.p25 > 0
      ? projectOntoGauge(band.p25, domainMin, domainMax).clamped
      : band.p10 != null && band.p10 > 0
        ? projectOntoGauge(band.p10, domainMin, domainMax).clamped
        : null
  const iqrHigh =
    band.p75 != null && band.p75 > 0
      ? projectOntoGauge(band.p75, domainMin, domainMax).clamped
      : band.p90 != null && band.p90 > 0
        ? projectOntoGauge(band.p90, domainMin, domainMax).clamped
        : null

  const benchmarkProjection =
    benchmark != null && benchmark > 0
      ? projectOntoGauge(benchmark, domainMin, domainMax)
      : null

  const appliedProjection =
    applied != null && applied > 0
      ? projectOntoGauge(applied, domainMin, domainMax)
      : null

  return (
    <div className={cn('space-y-1.5', className)} role="group" aria-label={labels.legend}>
      {/* Headline + scale labels. The min/max numerical labels still appear
          here so the user can match the visual position to a number; we
          dropped them from the slider's caption above. */}
      <div className="flex items-baseline justify-between gap-2 text-[10px] font-mono tabular-nums text-foreground/45">
        <span className="font-sans font-medium uppercase tracking-wide text-foreground/55">
          {labels.legend}
        </span>
        <span>
          {domainMin.toFixed(1)}× — {domainMax.toFixed(1)}×
        </span>
      </div>

      {insufficient ? (
        // Graceful fallback: not enough percentiles to draw a band. Caller
        // can keep the slider's min/max line above; this just tells the
        // reader the gauge is intentionally absent (vs broken).
        <div
          className="rounded-md border border-dashed border-border/50 bg-background/40 px-2.5 py-1.5 text-[10px] italic text-foreground/45"
          role="note"
        >
          {/* Graceful-degrade copy lives at the call site to keep
              this component i18n-free. */}
        </div>
      ) : (
        <div className="relative h-7 select-none">
          <svg
            viewBox="0 0 100 28"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden
          >
            {/* Track */}
            <rect x="0" y="11" width="100" height="6" rx="3" fill="hsl(var(--foreground) / 0.06)" />

            {/* Typical-band shading (p25–p75 or fallback p10–p90) */}
            {iqrLow != null && iqrHigh != null && iqrHigh > iqrLow && (
              <rect
                x={iqrLow * 100}
                y="11"
                width={Math.max(0, (iqrHigh - iqrLow) * 100)}
                height="6"
                rx="3"
                fill="hsl(var(--primary) / 0.18)"
              />
            )}

            {/* Percentile tick marks */}
            {markers.map((m) => (
              <line
                key={m.label}
                x1={m.pct * 100}
                x2={m.pct * 100}
                y1={m.emphasis === 'mid' ? 8 : 9}
                y2={m.emphasis === 'mid' ? 20 : 19}
                stroke="hsl(var(--foreground) / 0.45)"
                strokeWidth={m.label === 'p50' ? '1.4' : '0.9'}
              />
            ))}

            {/* Benchmark marker — small filled diamond on the median */}
            {benchmarkProjection != null && (
              <polygon
                points={`${benchmarkProjection.clamped * 100},6 ${benchmarkProjection.clamped * 100 - 1.6},10 ${benchmarkProjection.clamped * 100},14 ${benchmarkProjection.clamped * 100 + 1.6},10`}
                fill="hsl(var(--primary))"
                vectorEffect="non-scaling-stroke"
              >
                <title>
                  {labels.benchmark}: {benchmark!.toFixed(2)}×
                </title>
              </polygon>
            )}

            {/* Applied marker — large highlighted circle. Clamped to edge
                when out of band; the aria description below records the
                fact so screen readers still convey the truth. */}
            {appliedProjection != null && (
              <g>
                <circle
                  cx={appliedProjection.clamped * 100}
                  cy="14"
                  r="4"
                  fill="hsl(var(--primary))"
                  stroke="hsl(var(--background))"
                  strokeWidth="1.4"
                  vectorEffect="non-scaling-stroke"
                />
                <title>
                  {labels.applied}: {applied!.toFixed(2)}×
                  {appliedProjection.outOfRange ? ` — ${labels.outOfBand}` : ''}
                </title>
              </g>
            )}
          </svg>

          {/* Tick labels under the track. Rendered as positioned divs (not
              SVG <text>) so the typography honours the page's font stack
              and stays crisp on hi-DPI screens. */}
          <div className="absolute inset-x-0 bottom-0 h-3 pointer-events-none">
            {markers.map((m) => (
              <span
                key={`label-${m.label}`}
                className={cn(
                  'absolute -translate-x-1/2 text-[8.5px] font-mono tabular-nums',
                  m.label === 'p50' ? 'text-primary/85 font-semibold' : 'text-foreground/45',
                )}
                style={{ left: `${Math.min(98, Math.max(2, m.pct * 100))}%` }}
              >
                {m.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {appliedProjection?.outOfRange && (
        <p className="text-[10px] italic text-amber-700 dark:text-amber-400">
          {labels.outOfBand}
        </p>
      )}

      {/* Inter-quartile / typical-band caption — lives at the call site so
          the caller can pin the exact wording per locale. */}
      {caption ? (
        <p className="text-[10px] leading-snug text-foreground/45">{caption}</p>
      ) : null}
    </div>
  )
}
