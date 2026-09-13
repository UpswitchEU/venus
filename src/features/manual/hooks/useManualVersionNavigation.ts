import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { VersionAPI } from '../../../services/api/version/VersionAPI'
import { reportAccessScope, watchReportAccessScope } from '../../../utils/reportAccessScope'
import type { ValuationReportData } from '../../../components/calculator'
import { useVersionHistoryStore } from '../../../store/useVersionHistoryStore'
import type { ValuationResponse } from '../../../types/valuation'
import { getFirstRenderableReportHtml } from '../../../utils/safetyNetReportHtml'
import { buildManualVersionHistoryForNav } from '../utils/manualVersionNav'

interface VersionControlFeatures {
  version_control?: boolean
}

export interface UseManualVersionNavigationParams {
  currentValuationSummary?: {
    priceRange: { min: number; max: number }
    askPrice: number
  } | null
  currentVersionLabel: string
  onVersionHistoryLocked: () => void
  planFeatures?: VersionControlFeatures | null
  report: ValuationReportData | null
  reportId: string
  resolvedReportId?: string | null
  selectedMethod: string
  setResult: (result: ValuationResponse | null) => void
  showVersionLoadedToast: (label: string) => void
}

export interface UseManualVersionNavigationResult {
  handleSelectVersion: (id: string) => void
  selectedVersionId: string
  versionHistoryForNav: ReturnType<typeof buildManualVersionHistoryForNav>
}

export function useManualVersionNavigation({
  currentValuationSummary,
  currentVersionLabel,
  onVersionHistoryLocked,
  planFeatures,
  report,
  reportId,
  resolvedReportId,
  selectedMethod,
  setResult,
  showVersionLoadedToast,
}: UseManualVersionNavigationParams): UseManualVersionNavigationResult {
  const t = useTranslations()
  const versionLookupId = resolvedReportId || reportId
  const scope = reportAccessScope()
  const target = `${scope}:${versionLookupId}`
  const targetRef = useRef(target)
  const sequence = useRef(0)
  const pending = useRef<{ id: string; promise: Promise<void> } | null>(null)
  if (targetRef.current !== target) {
    targetRef.current = target
    sequence.current += 1
    pending.current = null
  }
  const versions = useVersionHistoryStore((s) => s.versions[versionLookupId] || [])
  const activeVersionNumber = useVersionHistoryStore((s) => s.activeVersions[versionLookupId])
  const [selectedVersionId, setSelectedVersionId] = useState<string>('current')
  useEffect(() => {
    setSelectedVersionId('current')
    return () => {
      sequence.current += 1
    }
  }, [target])
  const hasReport = !!report
  useEffect(() => {
    if (!hasReport || !versionLookupId) return
    // Persisted history contains metadata only. Hydrate it in the background
    // instead of presenting those cached entries as zero-valued reports.
    const refresh = () => {
      if (document.visibilityState === 'hidden') return
      const store = useVersionHistoryStore.getState()
      const entries = store.versions[versionLookupId] ?? []
      const lastSync = store.syncStatus[versionLookupId]?.lastSyncedAt ?? 0
      if (entries.some((v) => !v.valuationResult) || Date.now() - lastSync > 30000) {
        void store.fetchVersions(versionLookupId)
      }
    }
    refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [hasReport, scope, versionLookupId])

  const versionHistoryForNav = useMemo(() => {
    return buildManualVersionHistoryForNav({
      versions,
      report,
      selectedMethod,
      currentVersionLabel,
      currentValuationSummary,
      activeVersionNumber,
    })
  }, [
    activeVersionNumber,
    currentValuationSummary,
    currentVersionLabel,
    report,
    selectedMethod,
    versions,
  ])

  const handleSelectVersion = useCallback(
    (id: string) => {
      if (planFeatures && !planFeatures.version_control && id !== 'current') {
        onVersionHistoryLocked()
        return
      }
      const version = versions.find((v) => v.id === id)
      if (!version) return
      if (pending.current?.id === id) return pending.current.promise
      const revision = ++sequence.current
      const access = watchReportAccessScope()
      const isCurrent = () =>
        access.isCurrent() && revision === sequence.current && targetRef.current === target
      const operation = Promise.resolve().then(async () => {
        try {
          const cachedHtml = getFirstRenderableReportHtml(
            version.valuationResult?.html_report,
            version.htmlReport
          )
          const loaded =
            version.valuationResult && cachedHtml
              ? version
              : await new VersionAPI().getVersion(versionLookupId, version.versionNumber)
          if (!isCurrent()) return
          const html = getFirstRenderableReportHtml(
            loaded?.valuationResult?.html_report,
            loaded?.htmlReport
          )
          if (!loaded?.valuationResult || !html) throw new Error('Version report unavailable')
          useVersionHistoryStore.setState((state) => ({
            versions: {
              ...state.versions,
              [versionLookupId]: (state.versions[versionLookupId] ?? []).map((v) =>
                v.id === loaded.id ? loaded : v
              ),
            },
          }))
          setResult({ ...loaded.valuationResult, html_report: html })
          setSelectedVersionId(id)
          useVersionHistoryStore.getState().setActiveVersion(versionLookupId, loaded.versionNumber)
          const url = new URL(window.location.href)
          url.searchParams.set('version', String(loaded.versionNumber))
          window.history.replaceState(window.history.state, '', url)
          showVersionLoadedToast(loaded.versionLabel)
        } catch {
          if (isCurrent()) toast.error(t('common.states.loadFailed'))
        } finally {
          access.dispose()
          if (pending.current?.promise === operation) pending.current = null
        }
      })
      pending.current = { id, promise: operation }
      return operation
    },
    [
      onVersionHistoryLocked,
      planFeatures,
      setResult,
      showVersionLoadedToast,
      versions,
      versionLookupId,
      target,
      t,
    ]
  )

  return {
    handleSelectVersion,
    selectedVersionId,
    versionHistoryForNav,
  }
}
