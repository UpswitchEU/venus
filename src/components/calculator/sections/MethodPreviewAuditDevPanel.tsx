'use client'

/** Narrow import: avoid pulling `lib/saas` + `lib/sde` re-exports into the lazy dev chunk. */
import { METHOD_PREVIEW_AUDIT } from '@/lib/omniPreview/methodPreviewAudit'

/**
 * Collapsible registry of which methods have client-side preview helpers vs server-only calibration.
 * Only mounted from `ManualInputPanel` when `NODE_ENV === 'development'` (lazy + Suspense).
 */
export function MethodPreviewAuditDevPanel() {
  const entries = Object.entries(METHOD_PREVIEW_AUDIT) as [
    string,
    { bonusSections: readonly string[]; clientPreview: string },
  ][]

  return (
    <details className="mt-4 rounded-lg border border-dashed border-foreground/15 bg-foreground/[0.02] px-3 py-2 text-[11px] text-foreground/55">
      <summary className="cursor-pointer font-medium text-foreground/60 select-none">
        Method preview audit (dev)
      </summary>
      <dl className="mt-2 space-y-2">
        {entries.map(([key, meta]) => (
          <div key={key}>
            <dt className="font-mono text-[10px] text-primary/80">{key}</dt>
            <dd className="pl-1 leading-snug">
              <span className="text-foreground/45">
                [
                {meta.bonusSections.length > 0 ? meta.bonusSections.join(', ') : '—'}]
              </span>{' '}
              {meta.clientPreview}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
