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

import { useEffect, useRef, useState } from 'react';
import { useBootstrapSafe } from '../lib/bootstrap';
import type { SessionBootstrapState } from '../lib/bootstrap/types';
import { useAuthStore } from '../lib/auth';
import { useSessionStore } from '../store/useSessionStore';
import type { ValuationSession } from '../types/valuation';
import { useManualFormStore } from '../store/manual/useManualFormStore';
import { useClientContext } from '../stores/clientContext';
import { createContextLogger } from '../utils/logger';

const logger = createContextLogger('BootstrapSync');

interface SyncStatus {
  identity: boolean;
  session: boolean;
  prefill: boolean;
  clientContext: boolean;
}

/**
 * Sync bootstrap state with existing stores
 * 
 * This hook is the key integration point that bridges the new bootstrap system
 * with the existing store architecture. It ensures all stores are populated
 * with bootstrap data when bootstrap completes.
 */
// Module-level ref used by sync functions (shared across hook instances)
const syncStatusRef = { current: { identity: false, session: false, prefill: false, clientContext: false } as SyncStatus };

export function useBootstrapSync(): {
  isSynced: boolean;
  syncStatus: SyncStatus;
} {
  const bootstrap = useBootstrapSafe();
  const [isSynced, setIsSynced] = useState(false);
  const hasSyncedRef = useRef(false);

  useEffect(() => {
    // Skip if no bootstrap context or already synced
    if (!bootstrap || hasSyncedRef.current) {
      return;
    }

    // Skip if still bootstrapping
    if (bootstrap.isBootstrapping) {
      return;
    }

    // Skip if bootstrap failed
    if (bootstrap.bootstrapError) {
      logger.warn('Bootstrap failed, skipping sync', {
        error: bootstrap.bootstrapError,
      });
      return;
    }

    const state = bootstrap.state;

    // Perform sync
    syncIdentity(state);
    syncSession(state);
    syncClientContext(state);

    // CRITICAL: For new reports, syncSession creates session in store synchronously.
    // completeInitialization sets status='loaded' so UI exits loading state.
    // For existing reports, syncSession triggers async loadSession - don't override.
    if (state.report.mode === 'new') {
      useSessionStore.getState().completeInitialization();
    }

    hasSyncedRef.current = true;
    setIsSynced(true);

    logger.info('Bootstrap sync complete', {
      syncStatus: syncStatusRef.current,
      identityType: state.identity.type,
      reportMode: state.report.mode,
      prefillConfidence: state.prefillData.confidence.toFixed(2),
    });
  }, [bootstrap]);

  return {
    isSynced,
    syncStatus: { ...syncStatusRef.current },
  };
}

/**
 * Sync identity from bootstrap to auth store
 */
function syncIdentity(state: SessionBootstrapState): void {
  try {
    const { identity } = state;
    const authStore = useAuthStore.getState();

    // Only sync if we have user data that auth store doesn't have
    if (identity.type === 'authenticated' && identity.userId) {
      // Check if auth store already has the user
      if (!authStore.user || authStore.user.id !== identity.userId) {
        // Auth store handles its own initialization via cookies
        // We don't override it, but we can trigger a refresh if needed
        logger.debug('Bootstrap identity differs from auth store', {
          bootstrapUserId: identity.userId?.substring(0, 8),
          authStoreUserId: authStore.user?.id?.substring(0, 8),
        });
      }
    }

    syncStatusRef.current.identity = true;
  } catch (error) {
    logger.error('Failed to sync identity', {
      error: error instanceof Error ? error.message : String(error),
    });
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
    const { report, prefillData, identity } = state;
    const sessionStore = useSessionStore.getState();

    // Check if session store already has this report
    const storeHasSession = sessionStore.session?.reportId === report.reportId;
    
    if (storeHasSession) {
      logger.debug('Session already in store, checking for prefill updates', {
        reportId: report.reportId.substring(0, 20),
      });

      // If bootstrap has prefill data, merge it into session
      if (prefillData.confidence > 0 && prefillData.companyInfo) {
        const currentSession = sessionStore.session!;
        const currentSessionData = currentSession.sessionData || {};
        
        // Only update if session doesn't already have this data
        if (!currentSessionData.company_name && prefillData.companyInfo.companyName) {
          const updatedSessionData = {
            ...currentSessionData,
            company_name: prefillData.companyInfo.companyName,
            kbo_number: prefillData.companyInfo.kboNumber,
            country_code: prefillData.companyInfo.countryCode,
            founding_year: prefillData.companyInfo.foundingYear,
            _bootstrapPrefill: true,
          };
          
          sessionStore.updateSession({
            ...currentSession,
            sessionData: updatedSessionData,
          });
          
          logger.info('Updated session with bootstrap prefill data', {
            reportId: report.reportId.substring(0, 20),
            fieldsAdded: prefillData.fieldsPopulated.length,
          });
        }
      }
    } else if (report.mode === 'new') {
      // CRITICAL FIX: Create minimal session for new reports so form can render
      // This avoids 404 errors when SessionManager tries to load a non-existent session
      // The session will be created on the backend when the user first saves
      // We mark it with _bootstrapCreated: true to indicate it hasn't been saved yet
      if (!storeHasSession) {
        const now = new Date();
        
        // ✅ CRITICAL: Include prefill data in sessionData so it survives session creation
        // This ensures prefill data is available when session is created on first save
        const sessionData: Record<string, any> = {
          _bootstrapCreated: true, // Flag to indicate this is a bootstrap-created session
          _bootstrapPrefill: prefillData.confidence > 0, // Flag to indicate prefill data is available
        }
        
        // Include prefill data if available
        if (prefillData.companyInfo?.companyName) {
          sessionData.company_name = prefillData.companyInfo.companyName
        }
        if (prefillData.companyInfo?.countryCode) {
          sessionData.country_code = prefillData.companyInfo.countryCode
        }
        if (prefillData.companyInfo?.foundingYear) {
          sessionData.founding_year = prefillData.companyInfo.foundingYear
        }
        if (prefillData.companyInfo?.kboNumber) {
          sessionData.kbo_number = prefillData.companyInfo.kboNumber
        }
        if (prefillData.companyInfo?.vatNumber) {
          sessionData.vat_number = prefillData.companyInfo.vatNumber
        }
        if (prefillData.companyInfo?.legalForm) {
          sessionData.legal_form = prefillData.companyInfo.legalForm
        }
        if (prefillData.companyInfo?.city) {
          sessionData.city = prefillData.companyInfo.city
        }
        if (prefillData.companyInfo?.postalCode) {
          sessionData.postal_code = prefillData.companyInfo.postalCode
        }
        if (prefillData.businessType?.id) {
          sessionData.business_type_id = prefillData.businessType.id
        }
        if (prefillData.businessType?.industry) {
          sessionData.industry = prefillData.businessType.industry
        }
        if (prefillData.financials?.revenue) {
          sessionData.revenue = prefillData.financials.revenue
        }
        if (prefillData.financials?.ebitda) {
          sessionData.ebitda = prefillData.financials.ebitda
        }
        if (prefillData.financials?.employeeCount) {
          sessionData.employee_count = prefillData.financials.employeeCount
        }
        
        const minimalSession: Partial<ValuationSession> = {
          reportId: report.reportId,
          currentView: 'manual' as const,
          dataSource: 'manual' as const,
          createdAt: now,
          updatedAt: now,
          partialData: {},
          sessionData: sessionData as any, // Cast to any since these are internal flags not part of ValuationRequest
        };
        
        sessionStore.updateSession(minimalSession);
        
        logger.info('Created minimal session for new report from bootstrap', {
          reportId: report.reportId.substring(0, 20),
          prefillConfidence: prefillData.confidence.toFixed(2),
          hasCompanyName: !!prefillData.companyInfo?.companyName,
          prefillFieldsCount: Object.keys(sessionData).length - 2, // Exclude _bootstrapCreated and _bootstrapPrefill flags
          identityType: identity.type,
          // AUTH-FIRST: All users are authenticated
          note: 'Session will be created on backend when user first saves (via saveSession with _bootstrapCreated flag)',
        });
      } else {
        logger.debug('New report - session already exists in store', {
          reportId: report.reportId.substring(0, 20),
        });
      }
    } else if (report.mode === 'existing') {
      // MERCURY FIX: Merge prefill into session store IMMEDIATELY before loadSession
      // loadSession is async - without this, form stays blank until it completes.
      // Bootstrap prefill has data from Titan's buildPrefill (session_data) - apply it now.
      const hasPrefill = prefillData.confidence >= 0.05;
      if (hasPrefill) {
        const now = new Date();
        const sessionData: Record<string, any> = {
          _bootstrapPrefill: true,
        };
        if (prefillData.companyInfo?.companyName) sessionData.company_name = prefillData.companyInfo.companyName;
        if (prefillData.companyInfo?.countryCode) sessionData.country_code = prefillData.companyInfo.countryCode;
        if (prefillData.companyInfo?.foundingYear) sessionData.founding_year = prefillData.companyInfo.foundingYear;
        if (prefillData.companyInfo?.kboNumber) sessionData.kbo_number = prefillData.companyInfo.kboNumber;
        if (prefillData.companyInfo?.vatNumber) sessionData.vat_number = prefillData.companyInfo.vatNumber;
        if (prefillData.companyInfo?.legalForm) sessionData.legal_form = prefillData.companyInfo.legalForm;
        if (prefillData.companyInfo?.city) sessionData.city = prefillData.companyInfo.city;
        if (prefillData.companyInfo?.postalCode) sessionData.postal_code = prefillData.companyInfo.postalCode;
        if (prefillData.companyInfo?.naceCode) sessionData.nace_code = prefillData.companyInfo.naceCode;
        if (prefillData.companyInfo?.naceDescription) sessionData.nace_description = prefillData.companyInfo.naceDescription;
        if (prefillData.businessType?.id) sessionData.business_type_id = prefillData.businessType.id;
        if (prefillData.businessType?.industry) sessionData.industry = prefillData.businessType.industry;
        if (prefillData.financials?.revenue !== undefined) sessionData.revenue = prefillData.financials.revenue;
        if (prefillData.financials?.ebitda !== undefined) sessionData.ebitda = prefillData.financials.ebitda;
        if (prefillData.financials?.employeeCount !== undefined) sessionData.number_of_employees = prefillData.financials.employeeCount;

        const minimalSession: Partial<ValuationSession> = {
          reportId: report.reportId,
          currentView: 'manual' as const,
          dataSource: 'manual' as const,
          createdAt: now,
          updatedAt: now,
          partialData: {},
          sessionData: sessionData as any,
        };
        sessionStore.updateSession(minimalSession);

        // CRITICAL: Also hydrate form store - form reads from useManualFormStore, not session store
        const formDataUpdate: Record<string, unknown> = {};
        if (prefillData.companyInfo?.companyName) formDataUpdate.company_name = prefillData.companyInfo.companyName;
        if (prefillData.companyInfo?.countryCode) formDataUpdate.country_code = prefillData.companyInfo.countryCode;
        if (prefillData.companyInfo?.foundingYear) formDataUpdate.founding_year = prefillData.companyInfo.foundingYear;
        if (prefillData.companyInfo?.kboNumber) formDataUpdate.kbo_number = prefillData.companyInfo.kboNumber;
        if (prefillData.companyInfo?.vatNumber) formDataUpdate.vat_number = prefillData.companyInfo.vatNumber;
        if (prefillData.companyInfo?.legalForm) formDataUpdate.legal_form = prefillData.companyInfo.legalForm;
        if (prefillData.companyInfo?.city) formDataUpdate.city = prefillData.companyInfo.city;
        if (prefillData.companyInfo?.postalCode) formDataUpdate.postal_code = prefillData.companyInfo.postalCode;
        if (prefillData.companyInfo?.naceCode) formDataUpdate.nace_code = prefillData.companyInfo.naceCode;
        if (prefillData.companyInfo?.naceDescription) formDataUpdate.nace_description = prefillData.companyInfo.naceDescription;
        if (prefillData.businessType?.id) formDataUpdate.business_type_id = prefillData.businessType.id;
        if (prefillData.businessType?.industry) formDataUpdate.industry = prefillData.businessType.industry;
        if (prefillData.financials?.revenue !== undefined) formDataUpdate.revenue = prefillData.financials.revenue;
        if (prefillData.financials?.ebitda !== undefined) formDataUpdate.ebitda = prefillData.financials.ebitda;
        if (prefillData.financials?.employeeCount !== undefined) formDataUpdate.number_of_employees = prefillData.financials.employeeCount;
        // Set business_context for KBO preview card when we have KBO data
        const kboNum = prefillData.companyInfo?.kboNumber || prefillData.kboData?.kboNumber;
        if (kboNum) {
          formDataUpdate.business_context = {
            kbo_registration: kboNum,
            kbo_registration_number: kboNum,
            legal_form: prefillData.companyInfo?.legalForm || prefillData.kboData?.legalForm,
            company_id: kboNum,
            company_address: [prefillData.companyInfo?.postalCode, prefillData.companyInfo?.city]
              .filter(Boolean)
              .join(' '),
            company_status: 'Active',
            kbo_verified: true,
          };
        }
        if (Object.keys(formDataUpdate).length > 0) {
          useManualFormStore.getState().updateFormData(formDataUpdate as any);
          logger.info('Hydrated form store from bootstrap prefill (existing report)', {
            reportId: report.reportId.substring(0, 20),
            formFieldsCount: Object.keys(formDataUpdate).length,
          });
        }

        logger.info('Merged bootstrap prefill into session for existing report (before loadSession)', {
          reportId: report.reportId.substring(0, 20),
          prefillFieldsCount: Object.keys(sessionData).length - 1,
        });
      }

      // Trigger async load - will merge/override with full session data when complete
      logger.info('Triggering session load for existing report', {
        reportId: report.reportId.substring(0, 20),
        hasExistingData: report.hasExistingData,
        hasValuationResult: report.hasValuationResult,
      });
      sessionStore.loadSession(
        report.reportId,
        'manual',
        undefined
      ).catch((error) => {
        logger.error('Failed to load session for existing report', {
          reportId: report.reportId.substring(0, 20),
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    syncStatusRef.current.session = true;
  } catch (error) {
    logger.error('Failed to sync session', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Sync client context from bootstrap to client context store
 */
function syncClientContext(state: SessionBootstrapState): void {
  try {
    const { identity } = state;

    // Only sync if we have accountant flow
    if (identity.type !== 'accountant_for_client' || !identity.clientContext) {
      syncStatusRef.current.clientContext = true;
      return;
    }

    const clientContextStore = useClientContext.getState();
    const currentClient = clientContextStore.client;

    // Check if context is already set correctly
    if (
      currentClient?.id === identity.clientContext.clientUserId &&
      clientContextStore.accountant?.id === identity.clientContext.accountantUserId
    ) {
      logger.debug('Client context already synced');
      syncStatusRef.current.clientContext = true;
      return;
    }

    // Set client context with required fields for ClientContextResponseDto
    // Note: Bootstrap may not have all fields, so we use defaults where needed
    const clientCompanyName = identity.clientContext.clientCompanyName || 'Client';
    
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
    });

    logger.info('Client context synced from bootstrap', {
      clientUserId: identity.clientContext.clientUserId.substring(0, 8),
      accountantUserId: identity.clientContext.accountantUserId.substring(0, 8),
    });

    syncStatusRef.current.clientContext = true;
  } catch (error) {
    logger.error('Failed to sync client context', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export default useBootstrapSync;
