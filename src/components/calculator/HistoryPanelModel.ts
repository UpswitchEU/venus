import { dateLikeToUnixMs, formatDateLikeToLocaleString } from '@/utils/date-like'
import type { ValuationVersion, VersionChanges } from '../../types/ValuationVersion'
import { formatVersionAuthor } from '../../utils/formatters'
import {
  getEquityValueHigh,
  getEquityValueLow,
  getFinalValuation,
  getNormalizedEbitda,
  getValuationMultiple,
} from '../../utils/valuationResultAccess'
import type { HistoryVersion } from './VersionCompareModal'

export type HistoryLocale = 'nl' | 'en' | 'fr'

export type HistoryTranslator = (key: string, values?: Record<string, number>) => string

type VersionAuthorUser = Parameters<typeof formatVersionAuthor>[1]

// Generic report type - works with both ValuationReportPanel and ValuationChat reports
export interface ReportLike {
  id?: string
  companyName?: string
  valuation?: number
  valuationLow?: number
  valuationHigh?: number
  ebitda?: number
  multiple?: number
}

export interface BuildHistoryVersionsParams {
  activeVersionNumber?: number
  now?: Date
  report: ReportLike | null
  storeVersions: ValuationVersion[]
  translate: HistoryTranslator
  user: VersionAuthorUser
}

export function deriveHistoryVersionType(v: ValuationVersion): HistoryVersion['type'] {
  const label = (v.versionLabel || '').toLowerCase()
  if (label.includes('normalis')) return 'normalization'
  if (label.includes('methodo') || label.includes('multiple')) return 'methodology'
  if (label.includes('data') || label.includes('financ') || label.includes('jaarrekening')) {
    return 'data_update'
  }
  if (v.versionNumber === 1) return 'initial'
  return 'revision'
}

function isFieldChange(value: unknown): value is { from: unknown; to: unknown } {
  return !!value && typeof value === 'object' && 'from' in value && 'to' in value
}

export function deriveHistoryChanges(
  v: ValuationVersion,
  changedLabel: string
): HistoryVersion['changes'] {
  if (!v.changesSummary) return []

  const changesSummary: VersionChanges = v.changesSummary
  const changes: HistoryVersion['changes'] = []
  for (const [field, change] of Object.entries(changesSummary)) {
    if (field === 'totalChanges' || field === 'significantChanges') continue
    if (!isFieldChange(change)) continue
    changes.push({ field, newValue: changedLabel })
    if (changes.length >= 5) break
  }
  return changes
}

export const currencyLocaleFor = (locale: HistoryLocale) =>
  locale === 'fr' ? 'fr-BE' : locale === 'nl' ? 'nl-BE' : 'en-BE'

export const formatHistoryCurrency = (amount: number, locale: HistoryLocale) => {
  if (amount >= 1000000) return `€${(amount / 1000000).toFixed(2)}M`
  return new Intl.NumberFormat(currencyLocaleFor(locale), {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export const formatHistoryTime = (
  date: Date | string | number,
  translate: HistoryTranslator,
  locale: HistoryLocale
) => {
  const nowMs = Date.now()
  const pastMs = dateLikeToUnixMs(date)
  const diff = pastMs === null ? 0 : nowMs - pastMs
  const loc = currencyLocaleFor(locale)
  if (diff < 1000 * 60) return translate('timeJustNow')
  if (diff < 1000 * 60 * 60) {
    return translate('timeMinutesAgo', { count: Math.floor(diff / (1000 * 60)) })
  }
  if (diff < 1000 * 60 * 60 * 24) {
    return translate('timeHoursAgo', { count: Math.floor(diff / (1000 * 60 * 60)) })
  }
  if (diff < 1000 * 60 * 60 * 24 * 7) {
    return translate('timeDaysAgo', { count: Math.floor(diff / (1000 * 60 * 60 * 24)) })
  }
  if (pastMs === null) return translate('timeJustNow')
  return formatDateLikeToLocaleString(date, loc, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const formatHistoryDate = (date: Date | string | number, locale: HistoryLocale) => {
  return formatDateLikeToLocaleString(date, currencyLocaleFor(locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function finiteReportNumber(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

function positiveFiniteNumber(value: unknown): number | undefined {
  const numeric = finiteReportNumber(value)
  return numeric != null && numeric > 0 ? numeric : undefined
}

function positiveSnapshotOrCurrent(
  snapshotValue: number | null,
  reportValue: unknown,
  isCurrent: boolean
): number | undefined {
  return (
    positiveFiniteNumber(snapshotValue) ??
    (isCurrent ? positiveFiniteNumber(reportValue) : undefined)
  )
}

function createdAtDateOrFallback(createdAt: unknown, fallback: Date): Date {
  const createdAtMs = dateLikeToUnixMs(createdAt as Date | string | number)
  return createdAtMs === null ? new Date(fallback.getTime()) : new Date(createdAtMs)
}

function sortVersionsByNewest(versions: ValuationVersion[]): ValuationVersion[] {
  return [...versions].sort((a, b) => {
    const versionDelta = (b.versionNumber || 0) - (a.versionNumber || 0)
    if (versionDelta !== 0) return versionDelta

    return (
      (dateLikeToUnixMs(b.createdAt) ?? Number.NEGATIVE_INFINITY) -
      (dateLikeToUnixMs(a.createdAt) ?? Number.NEGATIVE_INFINITY)
    )
  })
}

export function buildHistoryVersions({
  activeVersionNumber,
  now = new Date(),
  report,
  storeVersions,
  translate,
  user,
}: BuildHistoryVersionsParams): HistoryVersion[] {
  if (storeVersions.length === 0) {
    if (!report) return []
    return [
      {
        id: 'current',
        version: 1,
        timestamp: new Date(now.getTime()),
        author: translate('user'),
        authorInitials: 'V1',
        type: 'initial',
        summary: translate('versionN', { number: 1 }),
        changes: [],
        valuation: report.valuation,
        valuationLow: report.valuationLow,
        valuationHigh: report.valuationHigh,
        ebitda: report.ebitda,
        multiple: report.multiple,
        isCurrent: true,
      },
    ]
  }

  const sortedVersions = sortVersionsByNewest(storeVersions)
  return sortedVersions.map((v, index) => {
    const valuationResult = v.valuationResult
    const authorDisplay = formatVersionAuthor(v.createdBy, user, {
      user: translate('user'),
      guest: translate('guest'),
    })
    const authorInitials = authorDisplay.substring(0, 2).toUpperCase().replace(/\s/g, '') || '??'
    const isCurrent =
      activeVersionNumber != null
        ? v.versionNumber === activeVersionNumber
        : v.isActive || (sortedVersions.length === 1 && index === 0)

    return {
      id: v.id || String(v.versionNumber),
      version: v.versionNumber || 1,
      timestamp: createdAtDateOrFallback(v.createdAt, now),
      author: authorDisplay,
      authorInitials,
      type: deriveHistoryVersionType(v),
      summary: v.versionLabel || translate('versionN', { number: v.versionNumber ?? 1 }),
      changes: deriveHistoryChanges(v, translate('changed')),
      valuation: positiveSnapshotOrCurrent(
        getFinalValuation(valuationResult),
        report?.valuation,
        isCurrent
      ),
      valuationLow: positiveSnapshotOrCurrent(
        getEquityValueLow(valuationResult),
        report?.valuationLow,
        isCurrent
      ),
      valuationHigh: positiveSnapshotOrCurrent(
        getEquityValueHigh(valuationResult),
        report?.valuationHigh,
        isCurrent
      ),
      ebitda:
        getNormalizedEbitda(valuationResult) ??
        (isCurrent ? finiteReportNumber(report?.ebitda) : undefined),
      multiple:
        positiveFiniteNumber(getValuationMultiple(valuationResult)) ??
        (isCurrent ? positiveFiniteNumber(report?.multiple) : undefined),
      isCurrent,
    }
  })
}
