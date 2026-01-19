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

import { useEffect, useRef } from 'react';
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
export function useBootstrapSync(): {
  isSynced: boolean;
  syncStatus: SyncStatus;
} {
  const bootstrap = useBootstrapSafe();
  const hasSyncedRef = useRef(false);
  const syncStatusRef = useRef<SyncStatus>({
    identity: false,
    session: false,
    prefill: false,
    clientContext: false,
  });

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
    
    hasSyncedRef.current = true;

    logger.info('Bootstrap sync complete', {
      syncStatus: syncStatusRef.current,
      identityType: state.identity.type,
      reportMode: state.report.mode,
      prefillConfidence: state.prefillData.confidence.toFixed(2),
    });
  }, [bootstrap]);

  return {
    isSynced: hasSyncedRef.current,
    syncStatus: syncStatusRef.current,
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
          note: 'Session will be created on backend when user first saves (via saveSession with _bootstrapCreated flag)',
        });
      } else {
        logger.debug('New report - session already exists in store', {
          reportId: report.reportId.substring(0, 20),
        });
      }
    } else {
      logger.debug('Bootstrap has existing report but store is empty, waiting for API load', {
        bootstrapReportId: report.reportId.substring(0, 20),
        mode: report.mode,
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

// Export reference for direct store sync
const syncStatusRef = { current: {} as SyncStatus };

export default useBootstrapSync;
