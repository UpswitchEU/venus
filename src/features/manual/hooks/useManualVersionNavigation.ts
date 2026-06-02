import { useCallback, useMemo, useState } from 'react'
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
  const versionLookupId = resolvedReportId || reportId
  const versions = useVersionHistoryStore((s) => s.versions[versionLookupId] || [])
  const activeVersionNumber = useVersionHistoryStore((s) => s.activeVersions[versionLookupId])
  const [selectedVersionId, setSelectedVersionId] = useState<string>('current')

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
      setSelectedVersionId(id)
      const version = versions.find((v) => v.id === id)
      if (version?.valuationResult) {
        const enrichedResult = {
          ...version.valuationResult,
          html_report: getFirstRenderableReportHtml(
            version.valuationResult.html_report,
            version.htmlReport
          ),
        }
        setResult(enrichedResult)
        showVersionLoadedToast(version.versionLabel)
      }
    },
    [onVersionHistoryLocked, planFeatures, setResult, showVersionLoadedToast, versions]
  )

  return {
    handleSelectVersion,
    selectedVersionId,
    versionHistoryForNav,
  }
}
