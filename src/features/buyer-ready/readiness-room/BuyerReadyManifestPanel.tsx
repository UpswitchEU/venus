'use client'

/**
 * Compact Aurora sidebar panel summarising the buyer-ready transaction
 * package state. Mirrors Mercury's `BuyerPackageStatusCard` shape so
 * advisor & owner stay in lockstep about "what's in my package?" across
 * both apps.
 *
 * Pure presentational: caller supplies the `BuyerReadinessPackage`
 * payload (typically resolved by `BuyerReadyRoomClient` via
 * `GET /api/buyer-ready/room/[entityId]`). The panel is safe to mount
 * inside any Studio sidebar / advisor dashboard without its own fetch.
 *
 * For chat-driven flows the Venus `ChatAssistantDrawer` already routes
 * transaction-package questions through Titan's read tools — this
 * component is the "always-on" out-of-chat surface the user asked for.
 */

import { ArrowUpRight, FileCheck2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge, Progress } from '@/design-system'
import { cn } from '@/lib/utils'
import type {
  BuyerReadinessPackage,
  BuyerReadyChecklistTrafficStatus,
  BuyerReadinessOverallStatus,
} from './types'

export interface BuyerReadyManifestPanelProps {
  /**
   * The `buyerReadiness` slice of `BuyerReadyRoomPayload`. `null` when
   * the room has not been generated yet — the panel renders an empty
   * state with a CTA back to the full room.
   */
  readiness: BuyerReadinessPackage | null
  /** Entity UUID — required to deep-link into the full readiness room. */
  entityId: string
  /** EN / NL. Defaults to en. */
  locale?: 'en' | 'nl'
  /**
   * Where the "Open package" CTA navigates. Defaults to the Venus
   * readiness room screen. Callers can swap to an advisor-side route
   * when embedded in a different surface.
   */
  href?: string
  /** Optional slot rendered below the header — e.g. an advisor co-brand chip. */
  header?: ReactNode
  className?: string
}

function overallTone(
  status: BuyerReadinessOverallStatus | null | undefined,
): 'success' | 'warning' | 'destructive' | 'neutral' {
  if (!status) return 'neutral'
  if (status === 'ready') return 'success'
  if (status === 'blocked') return 'destructive'
  return 'warning'
}

function checklistTone(
  status: BuyerReadyChecklistTrafficStatus | null | undefined,
): 'success' | 'warning' | 'destructive' | 'neutral' {
  if (!status) return 'neutral'
  if (status === 'green') return 'success'
  if (status === 'red') return 'destructive'
  return 'warning'
}

function humanise(value: string | null | undefined): string {
  if (!value) return '—'
  return value.replace(/_/g, ' ')
}

export function BuyerReadyManifestPanel({
  readiness,
  entityId,
  locale = 'en',
  href,
  header,
  className,
}: BuyerReadyManifestPanelProps) {
  const copy =
    locale === 'en'
      ? {
          title: 'Transaction package',
          subtitle: 'Buyer-ready artefacts',
          empty: 'Package not generated yet.',
          openRoom: 'Open package',
          ready: 'ready',
          needsAttention: 'review',
          missing: 'missing',
          checklist: 'Diligence checklist',
          notReady: 'Pending generation',
        }
      : {
          title: 'Transactiepakket',
          subtitle: 'Klaar-voor-koper artefacten',
          empty: 'Pakket nog niet gegenereerd.',
          openRoom: 'Open pakket',
          ready: 'klaar',
          needsAttention: 'beoordelen',
          missing: 'ontbreekt',
          checklist: 'Diligence checklist',
          notReady: 'Wacht op generatie',
        }

  const safeEntity =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      entityId,
    )
      ? entityId
      : null
  const targetHref =
    href ?? (safeEntity ? `/buyer-ready/${safeEntity}` : null)

  if (!readiness) {
    return (
      <div
        className={cn(
          'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm',
          className,
        )}
      >
        <div className='flex items-start justify-between gap-3'>
          <div>
            <p className='text-sm font-semibold text-slate-900'>{copy.title}</p>
            <p className='text-xs text-slate-500'>{copy.subtitle}</p>
          </div>
          <Badge variant='neutral'>{copy.notReady}</Badge>
        </div>
        <p className='mt-3 text-xs text-slate-500'>{copy.empty}</p>
        {targetHref ? (
          <a
            href={targetHref}
            className='mt-3 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800'
          >
            {copy.openRoom}
            <ArrowUpRight className='h-3 w-3' />
          </a>
        ) : null}
      </div>
    )
  }

  const checklist = readiness.missingDocChecklist
  const completion = Math.max(0, Math.min(readiness.completionPct, 100))

  return (
    <div
      className={cn(
        'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3',
        className,
      )}
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <div className='flex items-center gap-1.5'>
            <FileCheck2 className='h-3.5 w-3.5 text-emerald-700' />
            <p className='text-sm font-semibold text-slate-900'>{copy.title}</p>
          </div>
          <p className='text-xs text-slate-500'>{copy.subtitle}</p>
        </div>
        <Badge variant={overallTone(readiness.status)}>
          {humanise(readiness.status)}
        </Badge>
      </div>

      {header}

      <div>
        <div className='flex items-baseline justify-between text-xs text-slate-500 mb-1'>
          <span>
            {readiness.summary.complete} / {readiness.summary.requiredTotal}{' '}
            {copy.ready}
          </span>
          <span>{Math.round(completion)}%</span>
        </div>
        <Progress value={completion} max={100} />
      </div>

      <div className='grid grid-cols-3 gap-2 text-xs'>
        <div className='rounded-lg bg-emerald-50 px-2 py-1.5 text-emerald-800'>
          <p className='text-[10px] uppercase tracking-wide text-emerald-700/70'>
            {copy.ready}
          </p>
          <p className='text-sm font-semibold'>{readiness.summary.complete}</p>
        </div>
        <div className='rounded-lg bg-amber-50 px-2 py-1.5 text-amber-800'>
          <p className='text-[10px] uppercase tracking-wide text-amber-700/70'>
            {copy.needsAttention}
          </p>
          <p className='text-sm font-semibold'>
            {readiness.summary.needsAttention}
          </p>
        </div>
        <div className='rounded-lg bg-rose-50 px-2 py-1.5 text-rose-800'>
          <p className='text-[10px] uppercase tracking-wide text-rose-700/70'>
            {copy.missing}
          </p>
          <p className='text-sm font-semibold'>{readiness.summary.missing}</p>
        </div>
      </div>

      {checklist ? (
        <div className='rounded-lg border border-slate-200 px-3 py-2'>
          <div className='flex items-center justify-between text-xs'>
            <span className='text-slate-500'>{copy.checklist}</span>
            <Badge variant={checklistTone(checklist.overall_status)}>
              {humanise(checklist.overall_status)}
            </Badge>
          </div>
          <div className='mt-1 flex gap-3 text-[11px] text-slate-600'>
            <span className='text-emerald-700'>
              {checklist.green_count} {copy.ready}
            </span>
            <span className='text-amber-700'>
              {checklist.yellow_count} {copy.needsAttention}
            </span>
            <span className='text-rose-700'>
              {checklist.red_count} {copy.missing}
            </span>
          </div>
        </div>
      ) : null}

      {targetHref ? (
        <a
          href={targetHref}
          className='inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800'
        >
          {copy.openRoom}
          <ArrowUpRight className='h-3 w-3' />
        </a>
      ) : null}
    </div>
  )
}
