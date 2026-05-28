import { looksLikeExistingReportId } from '../utils/identifiers'

/** Quiet window after restoration on Mercury existing-report handoffs. */
export const MERCURY_DELEGATED_AUTOSAVE_DEFER_MS = 2500

const restorationObservedAtByReport = new Map<string, number>()

function isMercuryDelegatedExistingReport(reportId: string | null | undefined): boolean {
  return looksLikeExistingReportId(reportId)
}

export function getMercurySourceApp(): string | null {
  if (typeof window === 'undefined') return null
  const fromStorage = sessionStorage.getItem('upswitch_source')
  if (fromStorage?.includes('mercury')) return fromStorage
  const fromUrl = new URLSearchParams(window.location.search).get('source')
  return fromUrl?.includes('mercury') ? fromUrl : fromStorage
}

export function markRestorationObserved(
  reportId: string | null | undefined,
  observedAt: number = Date.now()
): void {
  if (!isMercuryDelegatedExistingReport(reportId)) return
  if (!restorationObservedAtByReport.has(reportId!)) {
    restorationObservedAtByReport.set(reportId!, observedAt)
  }
}

export function clearRestorationObserved(reportId: string | null | undefined): void {
  if (!reportId) return
  restorationObservedAtByReport.delete(reportId)
}

export function observeMercuryDelegatedRestoration(args: {
  reportId: string | null | undefined
  restorationComplete: boolean
  sourceApp?: string | null
  now?: number
}): void {
  const sourceApp = args.sourceApp ?? getMercurySourceApp()
  if (!args.restorationComplete || !isMercuryDelegatedExistingReport(args.reportId)) return
  if (!sourceApp?.includes('mercury')) return
  markRestorationObserved(args.reportId, args.now ?? Date.now())
}

export function getMercuryDelegatedAutosaveDeferRemainingMs(args: {
  reportId: string | null | undefined
  restorationComplete: boolean
  sourceApp?: string | null
  now?: number
}): number {
  const { reportId, restorationComplete, now = Date.now() } = args
  const sourceApp = args.sourceApp ?? getMercurySourceApp()
  if (!restorationComplete || !isMercuryDelegatedExistingReport(reportId)) return 0
  if (!sourceApp?.includes('mercury')) return 0

  observeMercuryDelegatedRestoration({ reportId, restorationComplete: true, sourceApp, now })
  const observedAt = restorationObservedAtByReport.get(reportId!)
  if (observedAt == null) return 0
  const remaining = MERCURY_DELEGATED_AUTOSAVE_DEFER_MS - (now - observedAt)
  return remaining > 0 ? remaining : 0
}

export function shouldDeferMercuryDelegatedFormAutosave(args: {
  reportId: string | null | undefined
  restorationComplete: boolean
  sourceApp?: string | null
  now?: number
}): boolean {
  return getMercuryDelegatedAutosaveDeferRemainingMs(args) > 0
}

/** Test-only reset for module-level restoration timestamps. */
export function resetRestorationObservedForTests(): void {
  restorationObservedAtByReport.clear()
}
