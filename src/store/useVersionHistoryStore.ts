/**
 * Version History Store
 *
 * Single Responsibility: Manage version history state and operations
 * Client-side first implementation, will migrate to backend later
 *
 * @module store/useVersionHistoryStore
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { VersionAPI } from '../services/api/version/VersionAPI'
import type {
  CreateVersionRequest,
  UpdateVersionRequest,
  ValuationVersion,
  VersionChanges,
  VersionComparison,
} from '../types/ValuationVersion'
import { createContextLogger } from '../utils/logger'
import { useNormalizationStore } from './useNormalizationStore'

const versionLogger = createContextLogger('VersionHistoryStore')
const versionAPI = new VersionAPI()

// ✅ FIX: Track pending version creations to prevent duplicates
const pendingVersionCreations = new Set<string>()

export interface VersionHistoryStore {
  // State
  versions: Record<string, ValuationVersion[]> // Keyed by reportId
  activeVersions: Record<string, number> // Currently selected version per report
  loading: boolean
  error: string | null

  // ✅ NEW: Sync status tracking
  syncStatus: Record<
    string,
    {
      lastSyncedAt: number | null
      isSyncing: boolean
      syncError: string | null
    }
  > // Keyed by reportId

  // Actions
  fetchVersions: (reportId: string) => Promise<void>
  createVersion: (request: CreateVersionRequest) => Promise<ValuationVersion>
  updateVersion: (
    reportId: string,
    versionNumber: number,
    updates: UpdateVersionRequest
  ) => Promise<void>
  deleteVersion: (reportId: string, versionNumber: number) => Promise<void>
  setActiveVersion: (reportId: string, versionNumber: number) => void
  getVersion: (reportId: string, versionNumber: number) => ValuationVersion | null
  getActiveVersion: (reportId: string) => ValuationVersion | null
  getLatestVersion: (reportId: string) => ValuationVersion | null
  compareVersions: (
    reportId: string,
    versionA: number,
    versionB: number
  ) => VersionComparison | null
  clearVersions: (reportId: string) => void
  syncVersions: (reportId: string) => Promise<void> // ✅ NEW: Explicit sync method
}

/**
 * Generate version ID
 */
function generateVersionId(): string {
  return `version_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
}

/**
 * Detect changes between two data objects
 */
function detectChanges(oldData: any, newData: any): VersionChanges {
  const changes: VersionChanges = {
    totalChanges: 0,
    significantChanges: [],
  }

  const timestamp = new Date()

  // Financial changes
  if (oldData.current_year_data?.revenue !== newData.current_year_data?.revenue) {
    const oldVal = oldData.current_year_data?.revenue || 0
    const newVal = newData.current_year_data?.revenue || 0
    changes.revenue = {
      from: oldVal,
      to: newVal,
      percentChange: oldVal > 0 ? ((newVal - oldVal) / oldVal) * 100 : 0,
      timestamp,
    }
    changes.totalChanges++
    if (Math.abs(changes.revenue.percentChange || 0) > 10) {
      changes.significantChanges.push('revenue')
    }
  }

  if (oldData.current_year_data?.ebitda !== newData.current_year_data?.ebitda) {
    const oldVal = oldData.current_year_data?.ebitda || 0
    const newVal = newData.current_year_data?.ebitda || 0
    changes.ebitda = {
      from: oldVal,
      to: newVal,
      percentChange: oldVal > 0 ? ((newVal - oldVal) / oldVal) * 100 : 0,
      timestamp,
    }
    changes.totalChanges++
    if (Math.abs(changes.ebitda.percentChange || 0) > 10) {
      changes.significantChanges.push('ebitda')
    }
  }

  // Business profile changes
  if (oldData.company_name !== newData.company_name) {
    changes.companyName = {
      from: oldData.company_name || '',
      to: newData.company_name || '',
      timestamp,
    }
    changes.totalChanges++
  }

  if (oldData.founding_year !== newData.founding_year) {
    changes.foundingYear = {
      from: oldData.founding_year,
      to: newData.founding_year,
      timestamp,
    }
    changes.totalChanges++
  }

  return changes
}

/**
 * Version History Store
 *
 * Manages version history with client-side storage (interim solution).
 * Will be enhanced with backend persistence in Phase 2.
 */
export const useVersionHistoryStore = create<VersionHistoryStore>()(
  persist(
    (set, get) => ({
      // Initial state
      versions: {},
      activeVersions: {},
      loading: false,
      error: null,
      syncStatus: {}, // ✅ NEW: Sync status tracking

      /**
       * Fetch versions for report
       *
       * World-Class Version Sync:
       * - Tries backend first, falls back to local storage
       * - Handles conflicts gracefully
       * - Shows sync status
       */
      fetchVersions: async (reportId: string) => {
        set({ loading: true, error: null })

        // Update sync status
        set((state) => ({
          syncStatus: {
            ...state.syncStatus,
            [reportId]: {
              ...state.syncStatus[reportId],
              isSyncing: true,
              syncError: null,
            },
          },
        }))

        try {
          versionLogger.info('Fetching versions', { reportId })

          // ✅ FIX: Get existing local versions BEFORE fetching to merge properly
          const existingLocalVersions = get().versions[reportId] || []

          // Try backend API first
          const response = await versionAPI.listVersions(reportId)

          // ✅ FIX: Deduplicate versions by versionNumber to prevent duplicates
          // Use a Map to ensure unique versions by versionNumber
          // Backend versions are source of truth, but merge with local if backend is missing any
          const versionMap = new Map<number, ValuationVersion>()

          // First, add existing local versions (in case backend hasn't synced yet)
          existingLocalVersions.forEach((version) => {
            versionMap.set(version.versionNumber, version)
          })

          // Then, add backend versions (these override local versions - backend is source of truth)
          response.versions.forEach((version) => {
            versionMap.set(version.versionNumber, version)
          })

          // Convert back to array and sort by versionNumber
          const deduplicatedVersions = Array.from(versionMap.values()).sort(
            (a, b) => a.versionNumber - b.versionNumber
          )

          set((state) => ({
            versions: {
              ...state.versions,
              [reportId]: deduplicatedVersions,
            },
            activeVersions: {
              ...state.activeVersions,
              [reportId]: response.activeVersion,
            },
            loading: false,
            syncStatus: {
              ...state.syncStatus,
              [reportId]: {
                lastSyncedAt: Date.now(),
                isSyncing: false,
                syncError: null,
              },
            },
          }))

          versionLogger.info('Versions loaded from backend', {
            reportId,
            count: response.versions.length,
            deduplicatedCount: deduplicatedVersions.length,
            hadLocalVersions: existingLocalVersions.length > 0,
          })
        } catch (error) {
          // Fallback to local storage (already populated from persist middleware)
          const localVersions = get().versions[reportId] || []

          // ✅ FIX: Deduplicate local versions too (in case of duplicates)
          const localVersionMap = new Map<number, ValuationVersion>()
          localVersions.forEach((version) => {
            const existing = localVersionMap.get(version.versionNumber)
            // Keep the version with the latest createdAt if duplicates exist
            if (
              !existing ||
              (version.createdAt && existing.createdAt && version.createdAt > existing.createdAt)
            ) {
              localVersionMap.set(version.versionNumber, version)
            }
          })
          const deduplicatedLocalVersions = Array.from(localVersionMap.values()).sort(
            (a, b) => a.versionNumber - b.versionNumber
          )

          const errorMessage = error instanceof Error ? error.message : String(error)
          versionLogger.warn('Backend unavailable, using local versions', {
            reportId,
            count: localVersions.length,
            deduplicatedCount: deduplicatedLocalVersions.length,
            error: errorMessage,
          })

          set((state) => ({
            versions: {
              ...state.versions,
              [reportId]: deduplicatedLocalVersions,
            },
            loading: false,
            syncStatus: {
              ...state.syncStatus,
              [reportId]: {
                lastSyncedAt: state.syncStatus[reportId]?.lastSyncedAt || null,
                isSyncing: false,
                syncError: errorMessage,
              },
            },
          }))
        }
      },

      /**
       * Create new version
       */
      createVersion: async (request: CreateVersionRequest) => {
        // ✅ FIX: Prevent concurrent version creation for same reportId
        const creationKey = `${request.reportId}_${request.versionLabel || 'auto'}`
        if (pendingVersionCreations.has(creationKey)) {
          versionLogger.warn('Version creation already in progress, skipping duplicate', {
            reportId: request.reportId,
            creationKey,
          })
          // Return existing version if available, otherwise throw
          const existingVersions = get().versions[request.reportId] || []
          const latestVersion = existingVersions[existingVersions.length - 1]
          if (latestVersion) {
            return latestVersion
          }
          throw new Error('Version creation already in progress')
        }

        pendingVersionCreations.add(creationKey)

        try {
          versionLogger.info('Creating version', { reportId: request.reportId })

          // ✅ ENHANCEMENT: Capture normalization data from store if not provided
          let enrichedRequest = { ...request }

          if (!enrichedRequest.normalization_data) {
            const normStore = useNormalizationStore.getState()
            const normalizationData: ValuationVersion['normalization_data'] = {}

            // Build year-keyed normalization data from unified store
            const accepted = normStore.items.filter((n) => n.status === 'accepted')
            const yearGroups: Record<number, typeof accepted> = {}
            for (const n of accepted) {
              if (!yearGroups[n.year]) yearGroups[n.year] = []
              yearGroups[n.year].push(n)
            }

            Object.entries(yearGroups).forEach(([year, items]) => {
              const totalAdj = items.reduce((sum, n) => sum + n.adjustment, 0)
              normalizationData[year] = {
                reported_ebitda: 0, // Not tracked in unified store
                normalized_ebitda: totalAdj,
                total_adjustments: totalAdj,
                adjustments: items.map((n) => ({
                  category: n.category,
                  amount: n.adjustment,
                  note: n.reason,
                })),
                custom_adjustments: [],
                confidence_score: items[0]?.confidence || 'medium',
                adjustment_percentage: 0,
              }
            })

            // Only add if we have normalization data
            if (Object.keys(normalizationData).length > 0) {
              enrichedRequest.normalization_data = normalizationData
              versionLogger.info('Captured normalization data for version', {
                reportId: request.reportId,
                years: Object.keys(normalizationData),
                totalYears: Object.keys(normalizationData).length,
              })
            }
          }

          // Try backend first
          try {
            const version = await versionAPI.createVersion(enrichedRequest)

            // ✅ FIX: Check if version already exists before adding to prevent duplicates
            // Also deduplicate existing versions in case of race conditions
            set((state) => {
              const reportVersions = state.versions[request.reportId] || []

              // ✅ FIX: Deduplicate existing versions first (in case duplicates were already added)
              const existingVersionMap = new Map<number, ValuationVersion>()
              reportVersions.forEach((v) => {
                const existing = existingVersionMap.get(v.versionNumber)
                // Keep the version with the latest createdAt if duplicates exist
                if (
                  !existing ||
                  (v.createdAt && existing.createdAt && v.createdAt > existing.createdAt)
                ) {
                  existingVersionMap.set(v.versionNumber, v)
                }
              })
              const deduplicatedVersions = Array.from(existingVersionMap.values())

              // Check if version with same versionNumber already exists
              const versionExists = deduplicatedVersions.some(
                (v) => v.versionNumber === version.versionNumber
              )

              if (versionExists) {
                versionLogger.warn('Version already exists in local state, skipping add', {
                  reportId: request.reportId,
                  versionNumber: version.versionNumber,
                  note: 'Version will be synced via fetchVersions',
                })
                // Don't add duplicate, but update active version and return deduplicated list
                return {
                  versions: {
                    ...state.versions,
                    [request.reportId]: deduplicatedVersions,
                  },
                  activeVersions: {
                    ...state.activeVersions,
                    [request.reportId]: version.versionNumber,
                  },
                }
              }

              // Add new version and ensure no duplicates
              const updatedVersions = [...deduplicatedVersions, version].sort(
                (a, b) => a.versionNumber - b.versionNumber
              )

              return {
                versions: {
                  ...state.versions,
                  [request.reportId]: updatedVersions,
                },
                activeVersions: {
                  ...state.activeVersions,
                  [request.reportId]: version.versionNumber,
                },
              }
            })

            pendingVersionCreations.delete(creationKey)
            return version
          } catch (backendError) {
            // Backend unavailable - create locally
            versionLogger.warn('Backend unavailable, creating local version', {
              reportId: request.reportId,
              backendError:
                backendError instanceof Error ? backendError.message : String(backendError),
            })

            try {
              const reportVersions = get().versions[request.reportId] || []
              const nextVersionNumber =
                Math.max(0, ...reportVersions.map((v) => v.versionNumber)) + 1

              // Generate auto-label
              const autoLabel =
                request.changesSummary && request.changesSummary.significantChanges.length > 0
                  ? `v${nextVersionNumber} - Adjusted ${request.changesSummary.significantChanges.join(', ')}`
                  : `Version ${nextVersionNumber}`

              const localVersion: ValuationVersion = {
                id: generateVersionId(),
                reportId: request.reportId,
                versionNumber: nextVersionNumber,
                versionLabel: request.versionLabel || autoLabel,
                createdAt: new Date(),
                createdBy: null,
                formData: request.formData,
                valuationResult: request.valuationResult || null,
                htmlReport: request.htmlReport || null,
                infoTabHtml: request.infoTabHtml || null,
                changesSummary: request.changesSummary || {
                  totalChanges: 0,
                  significantChanges: [],
                },
                isActive: true,
                isPinned: false,
                tags: request.tags || [],
                notes: request.notes,
              }

              // Mark previous versions as inactive
              const updatedVersions = reportVersions.map((v) => ({
                ...v,
                isActive: false,
              }))

              set((state) => ({
                versions: {
                  ...state.versions,
                  [request.reportId]: [...updatedVersions, localVersion],
                },
                activeVersions: {
                  ...state.activeVersions,
                  [request.reportId]: nextVersionNumber,
                },
              }))

              versionLogger.info('Local version created successfully (fallback)', {
                reportId: request.reportId,
                versionNumber: nextVersionNumber,
                note: 'Backend unavailable, using local storage',
              })

              pendingVersionCreations.delete(creationKey)
              return localVersion
            } catch (localError) {
              // Local version creation also failed - this is a real error
              pendingVersionCreations.delete(creationKey)
              versionLogger.error(
                'Failed to create version (both backend and local fallback failed)',
                {
                  reportId: request.reportId,
                  backendError:
                    backendError instanceof Error ? backendError.message : String(backendError),
                  localError: localError instanceof Error ? localError.message : String(localError),
                }
              )
              throw localError
            }
          }
        } catch (error) {
          // This catch should only handle unexpected errors (not backend or local creation errors)
          pendingVersionCreations.delete(creationKey)
          versionLogger.error('Failed to create version (unexpected error)', {
            reportId: request.reportId,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorType: error instanceof Error ? error.constructor.name : typeof error,
          })
          throw error
        }
      },

      /**
       * Generate auto-label from changes (Note: This is internal, use versionDiffDetection.generateAutoLabel for consistency)
       */
      generateAutoLabel(versionNumber: number, changes?: VersionChanges): string {
        if (!changes || changes.totalChanges === 0) {
          return `Version ${versionNumber}`
        }

        const significant = changes.significantChanges || []
        if (significant.length > 0) {
          return `v${versionNumber} - Adjusted ${significant.join(', ')}`
        }

        return `v${versionNumber} - Updated`
      },

      /**
       * Update version metadata
       */
      updateVersion: async (
        reportId: string,
        versionNumber: number,
        updates: UpdateVersionRequest
      ) => {
        try {
          // Try backend first
          await versionAPI.updateVersion(reportId, versionNumber, updates)

          // Update local state
          set((state) => {
            const reportVersions = state.versions[reportId] || []
            const updatedVersions = reportVersions.map((v) =>
              v.versionNumber === versionNumber
                ? {
                    ...v,
                    versionLabel: updates.versionLabel || v.versionLabel,
                    notes: updates.notes !== undefined ? updates.notes : v.notes,
                    tags: updates.tags || v.tags,
                    isPinned: updates.isPinned !== undefined ? updates.isPinned : v.isPinned,
                  }
                : v
            )

            return {
              versions: {
                ...state.versions,
                [reportId]: updatedVersions,
              },
            }
          })

          versionLogger.info('Version updated', { reportId, versionNumber })
        } catch (error) {
          versionLogger.error('Failed to update version', {
            reportId,
            versionNumber,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
          throw error
        }
      },

      /**
       * Delete version
       */
      deleteVersion: async (reportId: string, versionNumber: number) => {
        try {
          // Try backend first
          await versionAPI.deleteVersion(reportId, versionNumber)

          // Remove from local state
          set((state) => {
            const reportVersions = state.versions[reportId] || []
            const filteredVersions = reportVersions.filter((v) => v.versionNumber !== versionNumber)

            return {
              versions: {
                ...state.versions,
                [reportId]: filteredVersions,
              },
            }
          })

          versionLogger.info('Version deleted', { reportId, versionNumber })
        } catch (error) {
          versionLogger.error('Failed to delete version', {
            reportId,
            versionNumber,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
          throw error
        }
      },

      /**
       * Set active version (which version user is viewing/editing)
       */
      setActiveVersion: (reportId: string, versionNumber: number) => {
        set((state) => ({
          activeVersions: {
            ...state.activeVersions,
            [reportId]: versionNumber,
          },
        }))

        versionLogger.info('Active version changed', { reportId, versionNumber })
      },

      /**
       * Get specific version
       */
      getVersion: (reportId: string, versionNumber: number) => {
        const reportVersions = get().versions[reportId] || []
        return reportVersions.find((v) => v.versionNumber === versionNumber) || null
      },

      /**
       * Get currently active version
       */
      getActiveVersion: (reportId: string) => {
        const activeVersionNumber = get().activeVersions[reportId]
        if (!activeVersionNumber) return null

        return get().getVersion(reportId, activeVersionNumber)
      },

      /**
       * Get latest version (highest version number)
       */
      getLatestVersion: (reportId: string) => {
        const reportVersions = get().versions[reportId] || []
        if (reportVersions.length === 0) return null

        return reportVersions.reduce((latest, current) =>
          current.versionNumber > latest.versionNumber ? current : latest
        )
      },

      /**
       * Compare two versions (client-side)
       */
      compareVersions: (reportId: string, versionA: number, versionB: number) => {
        const vA = get().getVersion(reportId, versionA)
        const vB = get().getVersion(reportId, versionB)

        if (!vA || !vB) return null

        // Detect changes between versions
        const changes = detectChanges(vA.formData, vB.formData)

        // Calculate valuation delta
        const valuationDelta =
          vA.valuationResult &&
          typeof vA.valuationResult === 'object' &&
          vB.valuationResult &&
          typeof vB.valuationResult === 'object'
            ? {
                absoluteChange:
                  ((vB.valuationResult as any).valuation_summary?.final_valuation || 0) -
                  ((vA.valuationResult as any).valuation_summary?.final_valuation || 0),
                percentChange:
                  ((((vB.valuationResult as any).valuation_summary?.final_valuation || 0) -
                    ((vA.valuationResult as any).valuation_summary?.final_valuation || 0)) /
                    ((vA.valuationResult as any).valuation_summary?.final_valuation || 1)) *
                  100,
                direction:
                  ((vB.valuationResult as any).valuation_summary?.final_valuation || 0) >
                  ((vA.valuationResult as any).valuation_summary?.final_valuation || 0)
                    ? ('increase' as const)
                    : ((vB.valuationResult as any).valuation_summary?.final_valuation || 0) <
                        ((vA.valuationResult as any).valuation_summary?.final_valuation || 0)
                      ? ('decrease' as const)
                      : ('unchanged' as const),
              }
            : null

        // Generate highlights
        const highlights = []
        if (changes.revenue) {
          highlights.push({
            field: 'revenue',
            label: 'Revenue',
            oldValue: changes.revenue.from,
            newValue: changes.revenue.to,
            impact: `${changes.revenue.percentChange! > 0 ? '+' : ''}${changes.revenue.percentChange!.toFixed(1)}%`,
          })
        }
        if (changes.ebitda) {
          highlights.push({
            field: 'ebitda',
            label: 'EBITDA',
            oldValue: changes.ebitda.from,
            newValue: changes.ebitda.to,
            impact: `${changes.ebitda.percentChange! > 0 ? '+' : ''}${changes.ebitda.percentChange!.toFixed(1)}%`,
          })
        }

        const comparison: VersionComparison = {
          versionA: vA,
          versionB: vB,
          changes,
          valuationDelta,
          highlights,
        }

        return comparison
      },

      /**
       * Sync versions for report (explicit sync method)
       * This is an alias for fetchVersions for clarity
       */
      syncVersions: async (reportId: string) => {
        await get().fetchVersions(reportId)
      },

      /**
       * Clear versions for report
       */
      clearVersions: (reportId: string) => {
        set((state) => {
          const newVersions = { ...state.versions }
          delete newVersions[reportId]

          const newActiveVersions = { ...state.activeVersions }
          delete newActiveVersions[reportId]

          return {
            versions: newVersions,
            activeVersions: newActiveVersions,
          }
        })

        versionLogger.info('Versions cleared', { reportId })
      },
    }),
    {
      name: 'version-history-storage',
      partialize: (state) => {
        // ✅ BANK-GRADE: Exclude HTML reports from localStorage to prevent quota exceeded errors
        // HTML reports are stored in backend and fetched on demand
        // ✅ FIX: Preserve metadata flags to indicate HTML reports exist in backend for fallback recovery
        const versionsWithoutHtml: Record<string, ValuationVersion[]> = {}

        for (const [reportId, versions] of Object.entries(state.versions)) {
          versionsWithoutHtml[reportId] = versions.map((version) => ({
            ...version,
            htmlReport: null, // Don't store large HTML reports in localStorage
            infoTabHtml: null, // Don't store large info tab HTML in localStorage
            // ✅ BANK-GRADE: Keep metadata flags to indicate HTML reports exist in backend
            // These flags enable the restoration service to know it should fetch from backend
            _hasHtmlReport: !!(version as any)._hasHtmlReport || !!version.htmlReport,
            _hasInfoTabHtml: !!(version as any)._hasInfoTabHtml || !!version.infoTabHtml,
          }))
        }

        return {
          versions: versionsWithoutHtml,
          activeVersions: state.activeVersions,
        }
      },
    }
  )
)
