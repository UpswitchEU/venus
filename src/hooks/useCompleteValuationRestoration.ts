/**
 * Complete Valuation Restoration Hook
 * 
 * @deprecated This hook is DEPRECATED and will be removed in a future version.
 * 
 * Session restoration is now handled centrally by SessionRestorationService,
 * which is automatically invoked when useSessionStore.loadSession() is called.
 * 
 * The centralized restoration service provides:
 * - Atomic hydration of ALL stores (form, results, versions, EBITDA normalizations)
 * - Idempotent restoration (safe to call multiple times)
 * - No race conditions (single source of truth)
 * - Complete asset restoration for existing sessions
 * 
 * Migration: Remove usage of this hook. The session store will automatically
 * restore all data when the session is loaded.
 * 
 * @see SessionRestorationService - The centralized replacement
 * @see useSessionStore.loadSession - Entry point for session loading
 * 
 * @module hooks/useCompleteValuationRestoration
 */

import { useEffect, useRef, useState } from 'react'
import { useManualFormStore } from '../store/manual'
import { useManualResultsStore } from '../store/manual/useManualResultsStore'
// import { useConversationalResultsStore } from '../store/conversational/useConversationalResultsStore'
// import { useConversationalChatStore } from '../store/conversational/useConversationalChatStore'
import { useVersionHistoryStore } from '../store/useVersionHistoryStore'
import { useSessionStore } from '../store/useSessionStore'
import { useLoadingCoordinator } from '../store/useLoadingCoordinator'
import { sessionService } from '../services'
import { generalLogger } from '../utils/logger'

// Global state machine to prevent duplicate restorations
const restorationState = new Map<string, 'idle' | 'loading' | 'complete'>()

/**
 * @deprecated See module-level deprecation notice above.
 */
export function useCompleteValuationRestoration(reportId: string | null) {
  // DEPRECATION WARNING: Log warning on first use
  if (process.env.NODE_ENV === 'development') {
    console.warn(
      '[DEPRECATED] useCompleteValuationRestoration is deprecated. ' +
      'Session restoration is now handled centrally by SessionRestorationService. ' +
      'Remove this hook usage - restoration happens automatically via useSessionStore.loadSession().'
    )
  }
  
  const [isRestoring, setIsRestoring] = useState(false)
  const [restorationComplete, setRestorationComplete] = useState(false)
  const hasAttemptedRef = useRef(false)
  
  const { setLoading } = useLoadingCoordinator()

  useEffect(() => {
    if (!reportId || hasAttemptedRef.current) return

    // Check if restoration is already in progress or complete
    const currentState = restorationState.get(reportId)
    if (currentState === 'loading' || currentState === 'complete') {
      generalLogger.debug('Restoration already in progress or complete', {
        reportId,
        state: currentState,
      })
      return
    }

    hasAttemptedRef.current = true
    
    const restore = async () => {
      setIsRestoring(true)
      restorationState.set(reportId, 'loading')

      try {
        generalLogger.info('Starting complete valuation restoration', { reportId })

        // 1. Load session data
        setLoading('session', true)
        const data = await sessionService.loadCompleteValuationData(reportId)
        setLoading('session', false)

        if (!data || !data.session) {
          generalLogger.warn('No data to restore', { reportId })
          setRestorationComplete(true)
          restorationState.set(reportId, 'complete')
          return
        }

        // 2. Restore form data (priority: sessionData)
        setLoading('form', true)
        if (data.session.sessionData) {
          const flowType = data.session.currentView || 'manual'
          
          if (flowType === 'manual') {
            // Restore manual form data
            useManualFormStore.getState().updateFormData(data.session.sessionData as any)
            generalLogger.info('Restored manual form data', {
              reportId,
              fieldsCount: Object.keys(data.session.sessionData).length,
            })
          } else if (flowType === 'conversational') {
            // CONVERSATIONAL STORE REMOVED: Conversational flow restoration disabled
            // The conversational stores have been removed from the codebase
            // This code block is commented out to prevent errors
            /*
            // Restore conversational flow data
            const chatStore = useConversationalChatStore.getState()
            
            // Restore collected data from session
            if (data.session.sessionData) {
              chatStore.updateCollectedData(data.session.sessionData as any)
              generalLogger.info('Restored conversational collected data', {
                reportId,
                fieldsCount: Object.keys(data.session.sessionData).length,
              })
            }
            
            // Note: Chat messages are typically restored separately via conversation history
            // This restoration focuses on the collected business data
            */
            generalLogger.debug('Skipping conversational form restoration - stores removed', { reportId })
          }
        }
        setLoading('form', false)

        // 3. Restore results (for both manual and conversational flows)
        setLoading('results', true)
        if (data.currentReport && data.session) {
          const flowType = data.session.currentView || 'manual'
          
          if (flowType === 'manual') {
            const resultsStore = useManualResultsStore.getState()
            
            if (data.currentReport.valuation_result) {
              resultsStore.setResult(data.currentReport.valuation_result)
            }
            
            if (data.currentReport.html_report) {
              resultsStore.setHtmlReport(data.currentReport.html_report)
            }
            
            if (data.currentReport.info_tab_html) {
              resultsStore.setInfoTabHtml(data.currentReport.info_tab_html)
            }
            
            generalLogger.info('Restored manual valuation results', {
              reportId,
              hasResult: !!data.currentReport.valuation_result,
              hasHtmlReport: !!data.currentReport.html_report,
              hasInfoTab: !!data.currentReport.info_tab_html,
            })
          } else if (flowType === 'conversational') {
            // CONVERSATIONAL STORE REMOVED: Conversational results restoration disabled
            // The conversational stores have been removed from the codebase
            // This code block is commented out to prevent errors
            /*
            const resultsStore = useConversationalResultsStore.getState()
            
            if (data.currentReport.valuation_result) {
              resultsStore.setResult(data.currentReport.valuation_result)
            }
            
            if (data.currentReport.html_report) {
              resultsStore.setHtmlReport(data.currentReport.html_report)
            }
            
            if (data.currentReport.info_tab_html) {
              resultsStore.setInfoTabHtml(data.currentReport.info_tab_html)
            }
            
            generalLogger.info('Restored conversational valuation results', {
              reportId,
              hasResult: !!data.currentReport.valuation_result,
              hasHtmlReport: !!data.currentReport.html_report,
              hasInfoTab: !!data.currentReport.info_tab_html,
            })
            */
            generalLogger.debug('Skipping conversational results restoration - stores removed', { reportId })
          }
        }
        setLoading('results', false)

        // 4. Restore versions
        setLoading('versions', true)
        if (data.versions && data.versions.length > 0) {
          try {
            // Restore versions to version history store using proper Zustand setState
            // This ensures React components subscribed to the store will re-render
            const versionStore = useVersionHistoryStore.getState()
            
            // Find active version
            const activeVersion = data.versions.find((v: any) => v.isActive)?.versionNumber || 
                                 data.versions[data.versions.length - 1]?.versionNumber
            
            // Use setState to properly update Zustand store (triggers re-renders)
            // Type assertion: data.versions is already ValuationVersion[] from backend
            useVersionHistoryStore.setState((state) => ({
              versions: {
                ...state.versions,
                [reportId]: data.versions as any, // Type assertion needed due to backend response typing
              },
              activeVersions: {
                ...state.activeVersions,
                ...(activeVersion ? { [reportId]: activeVersion } : {}),
              },
            }))
            
            generalLogger.info('Restored version history', {
              reportId,
              versionsCount: data.versions.length,
              activeVersion,
            })
          } catch (error) {
            generalLogger.warn('Failed to restore version history', {
              reportId,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        } else {
          // Try to fetch versions from backend if not in data
          try {
            const versionStore = useVersionHistoryStore.getState()
            await versionStore.fetchVersions(reportId)
            generalLogger.info('Fetched version history from backend', { reportId })
          } catch (error) {
            generalLogger.debug('No version history available', { reportId })
          }
        }
        setLoading('versions', false)

        // 5. Restore pricing range
        setLoading('pricing', true)
        if (data.pricingRange) {
          try {
            // Store pricing range in session for easy access
            // Pricing range is derived from valuation result (equity_value_low, equity_value_high, equity_value_mid)
            const sessionStore = useSessionStore.getState()
            if (sessionStore.session && sessionStore.session.reportId === reportId) {
              // Store pricing range in session metadata
              const updatedSession = {
                ...sessionStore.session,
                sessionData: {
                  ...sessionStore.session.sessionData,
                  _pricingRange: data.pricingRange,
                },
              }
              sessionStore.updateSession(updatedSession)
              
              generalLogger.info('Restored pricing range', {
                reportId,
                min: data.pricingRange.min,
                max: data.pricingRange.max,
                suggested: data.pricingRange.suggested,
              })
            }
          } catch (error) {
            generalLogger.warn('Failed to restore pricing range', {
              reportId,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        } else if (data.currentReport?.valuation_result) {
          // Derive pricing range from valuation result if not explicitly provided
          try {
            const result = data.currentReport.valuation_result
            if (result.equity_value_low && result.equity_value_high) {
              const pricingRange = {
                min: result.equity_value_low,
                max: result.equity_value_high,
                suggested: result.equity_value_mid || result.recommended_asking_price || 
                          (result.equity_value_low + result.equity_value_high) / 2,
              }
              
              const sessionStore = useSessionStore.getState()
              if (sessionStore.session && sessionStore.session.reportId === reportId) {
                const updatedSession = {
                  ...sessionStore.session,
                  sessionData: {
                    ...sessionStore.session.sessionData,
                    _pricingRange: pricingRange,
                  },
                }
                sessionStore.updateSession(updatedSession)
                
                generalLogger.info('Derived pricing range from valuation result', {
                  reportId,
                  ...pricingRange,
                })
              }
            }
          } catch (error) {
            generalLogger.debug('Could not derive pricing range', { reportId })
          }
        }
        setLoading('pricing', false)

        // 6. Restore previous packages
        setLoading('packages', true)
        if (data.previousPackages && data.previousPackages.length > 0) {
          try {
            // Store previous packages in session for easy access
            // Previous packages are previous valuations for the same user/business
            const sessionStore = useSessionStore.getState()
            if (sessionStore.session && sessionStore.session.reportId === reportId) {
              const updatedSession = {
                ...sessionStore.session,
                sessionData: {
                  ...sessionStore.session.sessionData,
                  _previousPackages: data.previousPackages,
                },
              }
              sessionStore.updateSession(updatedSession)
              
              generalLogger.info('Restored previous packages', {
                reportId,
                packagesCount: data.previousPackages.length,
              })
            }
          } catch (error) {
            generalLogger.warn('Failed to restore previous packages', {
              reportId,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        }
        setLoading('packages', false)

        setRestorationComplete(true)
        restorationState.set(reportId, 'complete')
        
        generalLogger.info('Complete valuation restoration finished', {
          reportId,
          hasSession: !!data.session,
          hasReport: !!data.currentReport,
          versionsCount: data.versions?.length || 0,
          hasPricing: !!data.pricingRange,
          packagesCount: data.previousPackages?.length || 0,
        })
      } catch (error) {
        generalLogger.error('Complete restoration failed', {
          reportId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        })
        restorationState.set(reportId, 'idle') // Allow retry
      } finally {
        setIsRestoring(false)
      }
    }

    restore()
  }, [reportId, setLoading])

  return { isRestoring, restorationComplete }
}
