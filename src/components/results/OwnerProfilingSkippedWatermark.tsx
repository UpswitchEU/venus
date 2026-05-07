'use client'

import { useTranslations } from 'next-intl'
import { memo } from 'react'

interface Props {
  /** Optional: deep link to the wizard. When omitted no CTA renders. */
  ctaHref?: string
}

/**
 * Renders an amber dashed-border watermark on the report cover when the
 * Owner Profiling 9-question wizard hasn't been completed (OWNER-PROFILING-1
 * OP-6). Mirrors the Python-side `pages/owner_profiling.html` "skipped"
 * branch so the same CTA fires on both server-rendered HTML and the React
 * cover band.
 *
 * The CTA is intentionally optional: Venus is also rendered embedded in
 * accountant flows where the wizard target lives in Mercury and the calling
 * surface owns the navigation. Pass `ctaHref` from the host page.
 */
function OwnerProfilingSkippedWatermarkInner({ ctaHref }: Props) {
  const t = useTranslations('reportPreview.ownerProfiling.skipped')
  return (
    <div
      role="note"
      aria-label={t('title')}
      className="rounded-xl border border-dashed border-amber-500/55 bg-amber-500/10 px-3 py-2.5 text-amber-950"
    >
      <p className="text-[10px] font-bold uppercase tracking-wide leading-snug">
        {t('title')}
      </p>
      <p className="mt-1 text-[12px] leading-snug text-amber-900/85">
        {t('body')}
      </p>
      {ctaHref ? (
        <a
          href={ctaHref}
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold underline decoration-amber-700/60 underline-offset-2 hover:decoration-amber-900"
        >
          {t('cta')} →
        </a>
      ) : null}
    </div>
  )
}

export const OwnerProfilingSkippedWatermark = memo(
  OwnerProfilingSkippedWatermarkInner
)
OwnerProfilingSkippedWatermark.displayName = 'OwnerProfilingSkippedWatermark'
