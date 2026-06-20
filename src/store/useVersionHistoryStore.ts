/**
 * Version History Store
 *
 * Single Responsibility: Manage version history state and operations
 * Client-side first implementation, will migrate to backend later
 *
 * @module store/useVersionHistoryStore
 */

import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { VersionAPI } from '../services/api/version/VersionAPI'
import type {
  CreateVersionRequest,
  UpdateVersionRequest,
  ValuationVersion,
  VersionChanges,
  VersionComparison,
  VersionListResponse,
} from '../types/ValuationVersion'
import type { ValuationRequest } from '../types/valuation'
import { createContextLogger } from '../utils/logger'
import { getFinalValuation as getAccessibleFinalValuation } from '../utils/valuationResultAccess'
import { resolveFormEbitda, resolveFormRevenue } from '../utils/versionDiffDetection'
import {
  appendVersionIfMissing,
  createLocalVersionSnapshot,
  deduplicateVersionsByNumber,
  markVersionsInactive,
  mergeBackendVersionsByNumber,
  partializeVersionHistoryState,
} from './versionHistoryModel'
import { enrichCreateVersionRequestFromStores } from './versionHistoryRequestEnrichment'

const versionLogger = createContextLogger('VersionHistoryStore')
const versionAPI = new VersionAPI()

/**
 * Storage adapter that catches QuotaExceededError and gracefully degrades.
 * Prevents "Failed to execute 'setItem' on 'Storage'" from breaking the app.
 */
function createQuotaSafeStorage(): StateStorage {
  return {
    getItem: (name: string): string | null => {
      try {
        return localStorage.getItem(name)
      } catch {
        return null
      }
    },
    setItem: (name: string, value: string): void => {
      try {
        localStorage.setItem(name, value)
      } catch (e) {
        const isQuotaError =
          e instanceof DOMException &&
          (e.code === 22 ||
            e.code === 1014 ||
            e.name === 'QuotaExceededError' ||
            e.name === 'NS_ERROR_DOM_QUOTA_REACHED')
        if (isQuotaError) {
          versionLogger.warn('Version history storage quota exceeded, clearing to free space', {
            key: name,
          })
          try {
            localStorage.removeItem(name)
          } catch {
            // Ignore
          }
          // Don't retry - avoid loop. Next persist will use fresh partialize.
        }
      }
    },
    removeItem: (name: string): void => {
      try {
        localStorage.removeItem(name)
      } catch {
        // Ignore
      }
    },
  }
}

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
 * Detect changes between two data objects
 */
function detectChanges(
  oldData: Partial<ValuationRequest>,
  newData: Partial<ValuationRequest>
): VersionChanges {
  const changes: VersionChanges = {
    totalChanges: 0,
    significantChanges: [],
  }

  const timestamp = new Date()

  // Financial changes (same resolution as buildValuationRequest / detectVersionChanges)
  const oldRev = resolveFormRevenue(oldData)
  const newRev = resolveFormRevenue(newData)
  if (oldRev !== newRev) {
    const percentChange = oldRev !== 0 ? ((newRev - oldRev) / Math.abs(oldRev)) * 100 : 0
    changes.revenue = {
      from: oldRev,
      to: newRev,
      percentChange,
      timestamp,
    }
    changes.totalChanges++
    if (Math.abs(percentChange) > 10) {
      changes.significantChanges.push('revenue')
    }
  }

  const oldEbit = resolveFormEbitda(oldData)
  const newEbit = resolveFormEbitda(newData)
  if (oldEbit !== newEbit) {
    const percentChange = oldEbit !== 0 ? ((newEbit - oldEbit) / Math.abs(oldEbit)) * 100 : 0
    changes.ebitda = {
      from: oldEbit,
      to: newEbit,
      percentChange,
      timestamp,
    }
    changes.totalChanges++
    if (Math.abs(percentChange) > 10) {
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
      from: oldData.founding_year ?? 0,
      to: newData.founding_year ?? 0,
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

        const applyBackendResponse = (response: VersionListResponse) => {
          const existingLocalVersions = get().versions[reportId] || []
          const deduplicatedVersions = mergeBackendVersionsByNumber({
            localVersions: existingLocalVersions,
            backendVersions: response.versions,
          })

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
        }

        const fallbackToLocal = (error: unknown) => {
          const localVersions = get().versions[reportId] || []
          const deduplicatedLocalVersions = deduplicateVersionsByNumber(localVersions)

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

        const fetchWithRetry = async (): Promise<VersionListResponse> => {
          try {
            return await versionAPI.listVersions(reportId)
          } catch (_firstError) {
            versionLogger.info('Retrying version fetch after 1s', { reportId })
            await new Promise((r) => setTimeout(r, 1000))
            return await versionAPI.listVersions(reportId)
          }
        }

        try {
          versionLogger.info('Fetching versions', { reportId })
          const response = await fetchWithRetry()
          applyBackendResponse(response)
        } catch (error) {
          fallbackToLocal(error)
        } finally {
          set({ loading: false })
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

          const enrichedRequest = enrichCreateVersionRequestFromStores(request, {
            onNormalizationCaptured: ({ reportId, years }) => {
              versionLogger.info('Captured normalization data for version', {
                reportId,
                years,
                totalYears: years.length,
              })
            },
            onTaxLatencyCaptured: ({ count, reportId }) => {
              versionLogger.info('Captured tax latency data for version', {
                reportId,
                count,
              })
            },
          })

          // Try backend first
          try {
            const version = await versionAPI.createVersion(enrichedRequest)

            // ✅ FIX: Check if version already exists before adding to prevent duplicates
            // Also deduplicate existing versions in case of race conditions
            set((state) => {
              const reportVersions = state.versions[request.reportId] || []
              const { versionExists, versions: updatedVersions } = appendVersionIfMissing({
                versions: reportVersions,
                version,
              })

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
                    [request.reportId]: updatedVersions,
                  },
                  activeVersions: {
                    ...state.activeVersions,
                    [request.reportId]: version.versionNumber,
                  },
                }
              }

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
              const reportVersions = deduplicateVersionsByNumber(
                get().versions[request.reportId] || []
              )
              const nextVersionNumber =
                Math.max(0, ...reportVersions.map((v) => v.versionNumber)) + 1

              const localVersion = createLocalVersionSnapshot({
                request: enrichedRequest,
                versionNumber: nextVersionNumber,
              })

              // Mark previous versions as inactive
              const updatedVersions = markVersionsInactive(reportVersions)

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
            ? (() => {
                const vAVal = getAccessibleFinalValuation(vA.valuationResult)
                const vBVal = getAccessibleFinalValuation(vB.valuationResult)
                if (vAVal == null || vBVal == null) return null
                const absoluteChange = vBVal - vAVal
                const denom = Math.abs(vAVal) > 1e-9 ? Math.abs(vAVal) : null
                return {
                  absoluteChange,
                  percentChange: denom != null ? (absoluteChange / denom) * 100 : 0,
                  direction:
                    vBVal > vAVal
                      ? ('increase' as const)
                      : vBVal < vAVal
                        ? ('decrease' as const)
                        : ('unchanged' as const),
                }
              })()
            : null

        // Generate highlights
        const highlights = []
        if (changes.revenue) {
          const percentChange = changes.revenue.percentChange ?? 0
          highlights.push({
            field: 'revenue',
            label: 'Revenue',
            oldValue: changes.revenue.from,
            newValue: changes.revenue.to,
            impact: `${percentChange > 0 ? '+' : ''}${percentChange.toFixed(1)}%`,
          })
        }
        if (changes.ebitda) {
          const percentChange = changes.ebitda.percentChange ?? 0
          highlights.push({
            field: 'ebitda',
            label: 'EBITDA',
            oldValue: changes.ebitda.from,
            newValue: changes.ebitda.to,
            impact: `${percentChange > 0 ? '+' : ''}${percentChange.toFixed(1)}%`,
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
      storage: createJSONStorage(() => createQuotaSafeStorage()),
      partialize: (state: VersionHistoryStore) => partializeVersionHistoryState(state),
    }
  )
)
