/**
 * useBootstrapSync Hook
 *
 * Syncs bootstrap state with existing Venus stores.
 * This is the bridge between the new bootstrap system and existing store architecture.
 *
 * Syncs:
 * - Bootstrap identity → Auth store
 * - Bootstrap prefill → Form store
 * - Bootstrap report → Session store
 * - Bootstrap client context → Client context store
 *
 * @module hooks/useBootstrapSync
 */

import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../lib/auth'
import { useBootstrapSafe } from '../lib/bootstrap'
import type { SessionBootstrapState } from '../lib/bootstrap/types'
import { useManualFormStore } from '../store/manual/useManualFormStore'
import { useSessionStore } from '../store/useSessionStore'
import { useClientContext } from '../stores/clientContext'
import type { ValuationSession } from '../types/valuation'
import { createContextLogger } from '../utils/logger'

const logger = createContextLogger('BootstrapSync')

type PrefillDataParam = SessionBootstrapState['prefillData']

/**
 * Builds flat session data fields from prefill data.
 * Single source of truth for prefill → sessionData mapping.
 */
function buildPrefillSessionFields(prefillData: PrefillDataParam): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  if (prefillData.companyInfo?.companyName)
    fields.company_name = prefillData.companyInfo.companyName
  if (prefillData.companyInfo?.countryCode)
    fields.country_code = prefillData.companyInfo.countryCode
  if (prefillData.companyInfo?.foundingYear)
    fields.founding_year = prefillData.companyInfo.foundingYear
  if (prefillData.companyInfo?.kboNumber) fields.kbo_number = prefillData.companyInfo.kboNumber
  if (prefillData.companyInfo?.vatNumber) fields.vat_number = prefillData.companyInfo.vatNumber
  if (prefillData.companyInfo?.legalForm) fields.legal_form = prefillData.companyInfo.legalForm
  if (prefillData.companyInfo?.city) fields.city = prefillData.companyInfo.city
  if (prefillData.companyInfo?.postalCode) fields.postal_code = prefillData.companyInfo.postalCode
  if (prefillData.companyInfo?.naceCode) fields.nace_code = prefillData.companyInfo.naceCode
  if (prefillData.companyInfo?.naceDescription)
    fields.nace_description = prefillData.companyInfo.naceDescription
  if (prefillData.businessType?.id) fields.business_type_id = prefillData.businessType.id
  if (prefillData.businessType?.industry) fields.industry = prefillData.businessType.industry
  if (prefillData.financials?.revenue !== undefined) fields.revenue = prefillData.financials.revenue
  if (prefillData.financials?.ebitda !== undefined) fields.ebitda = prefillData.financials.ebitda
  if (prefillData.financials?.employeeCount !== undefined)
    fields.number_of_employees = prefillData.financials.employeeCount
  return fields
}

/**
 * Builds form data fields from prefill data, including business_context.
 * Single source of truth for prefill → formData mapping.
 */
function buildPrefillFormFields(prefillData: PrefillDataParam): Record<string, unknown> {
  const fields = buildPrefillSessionFields(prefillData)
  const kboNum = prefillData.companyInfo?.kboNumber || prefillData.kboData?.kboNumber
  if (kboNum) {
    fields.business_context = {
      kbo_registration: kboNum,
      kbo_registration_number: kboNum,
      legal_form: prefillData.companyInfo?.legalForm || prefillData.kboData?.legalForm,
      company_id: kboNum,
      company_address: [prefillData.companyInfo?.postalCode, prefillData.companyInfo?.city]
        .filter(Boolean)
        .join(' '),
      company_status: 'Active',
      kbo_verified: true,
    }
  }
  return fields
}

interface SyncStatus {
  identity: boolean
  session: boolean
  prefill: boolean
  clientContext: boolean
}

/**
 * Sync bootstrap state with existing stores
 *
 * This hook is the key integration point that bridges the new bootstrap system
 * with the existing store architecture. It ensures all stores are populated
 * with bootstrap data when bootstrap completes.
 */
// Module-level ref used by sync functions (shared across hook instances)
const syncStatusRef = {
  current: { identity: false, session: false, prefill: false, clientContext: false } as SyncStatus,
}

export function useBootstrapSync(): {
  isSynced: boolean
  syncStatus: SyncStatus
} {
  const bootstrap = useBootstrapSafe()
  const [isSynced, setIsSynced] = useState(false)
  const hasSyncedRef = useRef(false)

  useEffect(() => {
    // Skip if no bootstrap context or already synced
    if (!bootstrap || hasSyncedRef.current) {
      return
    }

    // Skip if still bootstrapping
    if (bootstrap.isBootstrapping) {
      return
    }

    // Skip if bootstrap failed
    if (bootstrap.bootstrapError) {
      logger.warn('Bootstrap failed, skipping sync', {
        error: bootstrap.bootstrapError,
      })
      return
    }

    const state = bootstrap.state

    // Perform sync
    syncIdentity(state)
    syncSession(state)
    syncClientContext(state)

    // CRITICAL: For new reports, syncSession creates session in store synchronously.
    // completeInitialization sets status='loaded' so UI exits loading state.
    // For existing reports, syncSession triggers async loadSession - don't override.
    if (state.report.mode === 'new') {
      useSessionStore.getState().completeInitialization()
    }

    hasSyncedRef.current = true
    setIsSynced(true)

    logger.info('Bootstrap sync complete', {
      syncStatus: syncStatusRef.current,
      identityType: state.identity.type,
      reportMode: state.report.mode,
      prefillConfidence: state.prefillData.confidence.toFixed(2),
    })
  }, [bootstrap])

  return {
    isSynced,
    syncStatus: { ...syncStatusRef.current },
  }
}

/**
 * Sync identity from bootstrap to auth store
 */
function syncIdentity(state: SessionBootstrapState): void {
  try {
    const { identity } = state
    const authStore = useAuthStore.getState()

    // Only sync if we have user data that auth store doesn't have
    if (identity.type === 'authenticated' && identity.userId) {
      // Check if auth store already has the user
      if (!authStore.user || authStore.user.id !== identity.userId) {
        // Auth store handles its own initialization via cookies
        // We don't override it, but we can trigger a refresh if needed
        logger.debug('Bootstrap identity differs from auth store', {
          bootstrapUserId: identity.userId?.substring(0, 8),
          authStoreUserId: authStore.user?.id?.substring(0, 8),
        })
      }
    }

    syncStatusRef.current.identity = true
  } catch (error) {
    logger.error('Failed to sync identity', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Sync session state from bootstrap to session store
 *
 * WORLD CLASS: Creates or updates session in store with bootstrap data.
 * This prevents redundant API calls when bootstrap has already resolved the session.
 */
function syncSession(state: SessionBootstrapState): void {
  try {
    const { report, prefillData, identity } = state
    const sessionStore = useSessionStore.getState()

    // Check if session store already has this report
    const storeHasSession = sessionStore.session?.reportId === report.reportId

    if (storeHasSession) {
      logger.debug('Session already in store, checking for prefill updates', {
        reportId: report.reportId.substring(0, 20),
      })

      // If bootstrap has prefill data, merge it into session and hydrate form store
      if (prefillData.confidence >= 0.05 && (prefillData.companyInfo || prefillData.kboData)) {
        const currentSession = sessionStore.session!
        const currentSessionData = currentSession.sessionData || {}
        const formStore = useManualFormStore.getState()
        const formHasData = !!(
          formStore.formData.company_name?.trim() || formStore.formData.kbo_number
        )

        // Update session if it doesn't already have this data
        if (!currentSessionData.company_name && prefillData.companyInfo?.companyName) {
          const updatedSessionData = {
            ...currentSessionData,
            ...buildPrefillSessionFields(prefillData),
            _bootstrapPrefill: true,
          }

          sessionStore.updateSession({
            ...currentSession,
            sessionData: updatedSessionData,
          })

          logger.info('Updated session with bootstrap prefill data', {
            reportId: report.reportId.substring(0, 20),
            fieldsAdded: prefillData.fieldsPopulated.length,
          })
        }

        // Hydrate form store when form is empty but we have prefill (e.g. re-render before first paint)
        if (!formHasData) {
          const formDataUpdate = buildPrefillFormFields(prefillData)
          if (Object.keys(formDataUpdate).length > 0) {
            useManualFormStore.getState().updateFormData(formDataUpdate as any)
            logger.info('Hydrated form store (session already in store, form was empty)', {
              reportId: report.reportId.substring(0, 20),
              formFieldsCount: Object.keys(formDataUpdate).length,
            })
          }
        }
      }
    } else if (report.mode === 'new') {
      // CRITICAL FIX: Create minimal session for new reports so form can render
      // This avoids 404 errors when SessionManager tries to load a non-existent session
      // The session will be created on the backend when the user first saves
      // We mark it with _bootstrapCreated: true to indicate it hasn't been saved yet
      if (!storeHasSession) {
        const now = new Date()

        const sessionData: Record<string, any> = {
          _bootstrapCreated: true,
          _bootstrapPrefill: prefillData.confidence > 0,
          ...buildPrefillSessionFields(prefillData),
        }

        const minimalSession: Partial<ValuationSession> = {
          reportId: report.reportId,
          currentView: 'manual' as const,
          dataSource: 'manual' as const,
          createdAt: now,
          updatedAt: now,
          partialData: {},
          sessionData: sessionData as any, // Cast to any since these are internal flags not part of ValuationRequest
        }

        sessionStore.updateSession(minimalSession)

        if (prefillData.confidence >= 0.05) {
          const formDataUpdate = buildPrefillFormFields(prefillData)
          if (Object.keys(formDataUpdate).length > 0) {
            useManualFormStore.getState().updateFormData(formDataUpdate as any)
            logger.info('Hydrated form store from bootstrap prefill (new report)', {
              reportId: report.reportId.substring(0, 20),
              formFieldsCount: Object.keys(formDataUpdate).length,
            })
          }
        }

        logger.info('Created minimal session for new report from bootstrap', {
          reportId: report.reportId.substring(0, 20),
          prefillConfidence: prefillData.confidence.toFixed(2),
          hasCompanyName: !!prefillData.companyInfo?.companyName,
          prefillFieldsCount: Object.keys(sessionData).length - 2, // Exclude _bootstrapCreated and _bootstrapPrefill flags
          identityType: identity.type,
          // AUTH-FIRST: All users are authenticated
          note: 'Session will be created on backend when user first saves (via saveSession with _bootstrapCreated flag)',
        })
      } else {
        logger.debug('New report - session already exists in store', {
          reportId: report.reportId.substring(0, 20),
        })
      }
    } else if (report.mode === 'existing') {
      // MERCURY FIX: Merge prefill AND valuationPackage into session store IMMEDIATELY before loadSession
      // loadSession is async - without this, form stays blank until it completes.
      // valuationPackage enables instant report display on refresh (htmlReport, versions, pdf).
      const hasPrefill = prefillData.confidence >= 0.05
      const pkg = state.valuationPackage
      const hasPackage = pkg && (pkg.htmlReport || pkg.pricingRange)
      const now = new Date()
      const sessionData: Record<string, any> = {
        _bootstrapPrefill: hasPrefill,
      }
      if (hasPackage) {
        sessionData._htmlReport = pkg.htmlReport
        sessionData._infoTabHtml = pkg.infoTabHtml
        sessionData._pricingRange = pkg.pricingRange
        if (pkg.pdf?.url) sessionData.pdfUrl = pkg.pdf.url
        // Merge formData for restore() when loadSession is skipped (hasAssetsInSession path)
        if (pkg.formData && Object.keys(pkg.formData).length > 0) {
          Object.assign(sessionData, pkg.formData)
        }
      }
      if (hasPrefill) {
        Object.assign(sessionData, buildPrefillSessionFields(prefillData))
      }

      // Phase 1.3: Always create minimal session for existing reports (even when package empty)
      // Enables ValuationSessionManager to detect session and trigger loadSession when assets missing
      {
        const minimalSession: Partial<ValuationSession> = {
          reportId: report.reportId,
          currentView: 'manual' as const,
          dataSource: 'manual' as const,
          createdAt: now,
          updatedAt: now,
          partialData: {},
          sessionData: sessionData as any,
        }
        // Merge valuationPackage into session for instant display (htmlReport, pdfUrl, etc.)
        if (hasPackage && pkg.htmlReport) {
          ;(minimalSession as any).htmlReport = pkg.htmlReport
          ;(minimalSession as any).infoTabHtml = pkg.infoTabHtml
          if (pkg.pdf?.url) (minimalSession as any).pdfUrl = pkg.pdf.url
          if (pkg.pricingRange) {
            ;(minimalSession as any).valuationResult = {
              equity_value_low: pkg.pricingRange.min,
              equity_value_mid: pkg.pricingRange.mid,
              equity_value_high: pkg.pricingRange.max,
              currency: pkg.pricingRange.currency,
            }
          }
        }
        sessionStore.updateSession(minimalSession)

        if (hasPrefill) {
          const formDataUpdate = buildPrefillFormFields(prefillData)
          if (Object.keys(formDataUpdate).length > 0) {
            useManualFormStore.getState().updateFormData(formDataUpdate as any)
            logger.info('Hydrated form store from bootstrap prefill (existing report)', {
              reportId: report.reportId.substring(0, 20),
              formFieldsCount: Object.keys(formDataUpdate).length,
            })
          }
        }

        logger.info('Merged bootstrap into session for existing report (before loadSession)', {
          reportId: report.reportId.substring(0, 20),
          hasPrefill,
          hasPackage,
          prefillFieldsCount: Object.keys(sessionData).length - 1,
        })
      }

      // SINGLE-OWNER: Do NOT call loadSession here.
      // ValuationSessionManager is the sole owner of session loading for existing reports.
      // Calling loadSession from both useBootstrapSync AND ValuationSessionManager creates
      // a race condition: both start concurrent loads, and VSM's needsFullLoad path resets
      // session state (session=null) while useBootstrapSync's load is in-flight, causing
      // a visual flash and unpredictable state machine transitions.
      // VSM will detect the minimal session and trigger loadSession on its own next cycle.
      logger.info(
        'Bootstrap sync created minimal session — delegating full load to ValuationSessionManager',
        {
          reportId: report.reportId.substring(0, 20),
          hasExistingData: report.hasExistingData,
          hasValuationResult: report.hasValuationResult,
        }
      )
    }

    syncStatusRef.current.session = true
  } catch (error) {
    logger.error('Failed to sync session', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Sync client context from bootstrap to client context store
 */
function syncClientContext(state: SessionBootstrapState): void {
  try {
    const { identity } = state

    // Only sync if we have accountant flow
    if (identity.type !== 'accountant_for_client' || !identity.clientContext) {
      syncStatusRef.current.clientContext = true
      return
    }

    const clientContextStore = useClientContext.getState()
    const currentClient = clientContextStore.client

    // Check if context is already set correctly
    if (
      currentClient?.id === identity.clientContext.clientUserId &&
      clientContextStore.accountant?.id === identity.clientContext.accountantUserId
    ) {
      logger.debug('Client context already synced')
      syncStatusRef.current.clientContext = true
      return
    }

    // Set client context with required fields for ClientContextResponseDto
    // Note: Bootstrap may not have all fields, so we use defaults where needed
    const clientCompanyName = identity.clientContext.clientCompanyName || 'Client'

    clientContextStore.setClientContext({
      accountantUser: {
        id: identity.clientContext.accountantUserId,
        email: identity.clientContext.accountantEmail || '',
        full_name: '', // Bootstrap doesn't have this, but field is required
      },
      clientUser: {
        id: identity.clientContext.clientUserId,
        email: identity.clientContext.clientEmail || '',
        full_name: clientCompanyName, // Use company name as fallback
        avatar_url: null,
      },
      relationship: {
        id: identity.clientContext.relationshipId,
        customer_name: clientCompanyName,
      },
    })

    logger.info('Client context synced from bootstrap', {
      clientUserId: identity.clientContext.clientUserId.substring(0, 8),
      accountantUserId: identity.clientContext.accountantUserId.substring(0, 8),
    })

    syncStatusRef.current.clientContext = true
  } catch (error) {
    logger.error('Failed to sync client context', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export default useBootstrapSync
