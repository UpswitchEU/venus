import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CLIENT_CONTEXT_HEADERS } from '../constants/headers'
import {
  clearDelegatedClientContext,
  discardStalePersistedClientContextOnRehydrate,
  isPersistedContextStaleForUrl,
  urlRequiresDelegatedClientContext,
} from '../lib/auth/persistedClientContext'
import { getApiUrl } from '../utils/getMercuryUrl'
import { generalLogger } from '../utils/logger'

interface ClientContextResponseDto {
  accountantUser: {
    id: string
    email: string
    full_name: string
  }
  /** Null when invitation not accepted - accountant is effective session owner. Venus works in both cases. */
  clientUser: {
    id: string
    email: string
    full_name: string
    avatar_url: string | null
  } | null
  relationship: {
    id: string
    customer_name: string
  }
}

interface ClientContextState {
  isActingAsClient: boolean
  accountant: {
    id: string
    email: string
    fullName: string
  } | null
  client: {
    id: string
    email: string
    fullName: string
    avatarUrl: string | null
  } | null
  relationshipId: string | null
  /** Client/company name (from relationship when client null) */
  relationshipCustomerName: string | null
  lastValidatedAt: number | null // Timestamp of last validation
  /** Set by clientContextGate when initializeAuth finishes delegated context exchange. */
  contextGateResolved: boolean

  setClientContext: (context: ClientContextResponseDto) => void
  clearClientContext: () => void
  validateContext: () => Promise<boolean>
  getContextHeaders: () => Record<string, string>
}

const CONTEXT_VALIDITY_TTL = 24 * 60 * 60 * 1000 // 24 hours

export const useClientContext = create<ClientContextState>()(
  persist(
    (set, get) => ({
      isActingAsClient: false,
      accountant: null,
      client: null,
      relationshipId: null,
      relationshipCustomerName: null,
      lastValidatedAt: null,
      contextGateResolved: false,

      setClientContext: (context) => {
        // Validate context structure (clientUser null when invitation not accepted)
        if (!context.accountantUser?.id || !context.relationship?.id) {
          generalLogger.warn('[ClientContext] Invalid context structure, clearing')
          clearDelegatedClientContext(() => get().clearClientContext())
          return
        }

        set({
          isActingAsClient: true,
          accountant: {
            id: context.accountantUser.id,
            email: context.accountantUser.email,
            fullName: context.accountantUser.full_name,
          },
          client: context.clientUser
            ? {
                id: context.clientUser.id,
                email: context.clientUser.email,
                fullName: context.clientUser.full_name,
                avatarUrl: context.clientUser.avatar_url,
              }
            : null,
          relationshipId: context.relationship.id,
          relationshipCustomerName: context.relationship.customer_name || null,
          lastValidatedAt: Date.now(),
        })
      },

      clearClientContext: () => {
        set({
          isActingAsClient: false,
          accountant: null,
          client: null,
          relationshipId: null,
          relationshipCustomerName: null,
          lastValidatedAt: null,
          contextGateResolved: false,
        })
      },

      validateContext: async (): Promise<boolean> => {
        const state = get()

        // If not acting as client, context is valid (no context needed)
        if (!state.isActingAsClient) {
          return true
        }

        // Check if context is expired (older than TTL)
        if (state.lastValidatedAt && Date.now() - state.lastValidatedAt > CONTEXT_VALIDITY_TTL) {
          generalLogger.warn('[ClientContext] Context expired, clearing')
          clearDelegatedClientContext(() => get().clearClientContext())
          return false
        }

        // Validate context structure (client null when invitation not accepted)
        if (!state.accountant?.id || !state.relationshipId) {
          generalLogger.warn('[ClientContext] Invalid context structure, clearing', {
            hasAccountant: !!state.accountant?.id,
            hasClient: !!state.client?.id,
            hasRelationshipId: !!state.relationshipId,
            contextAge: state.lastValidatedAt ? Date.now() - state.lastValidatedAt : 'never',
          })
          clearDelegatedClientContext(() => get().clearClientContext())
          return false
        }

        // Try to refresh context from backend if needed
        // This is a lightweight check - just verify the relationship still exists
        try {
          const _API_URL = getApiUrl()

          // Quick validation endpoint (if available)
          // For now, just check if we have valid IDs
          // In production, you might want to call an actual validation endpoint

          // Update lastValidatedAt
          set({ lastValidatedAt: Date.now() })
          return true
        } catch (error) {
          generalLogger.warn('[ClientContext] Validation failed, clearing context', { error })
          clearDelegatedClientContext(() => get().clearClientContext())
          return false
        }
      },

      getContextHeaders: (): Record<string, string> => {
        const state = get()
        if (!state.isActingAsClient) return {} as Record<string, string>

        if (urlRequiresDelegatedClientContext() && !state.contextGateResolved) {
          return {} as Record<string, string>
        }

        if (isPersistedContextStaleForUrl(state.relationshipId)) {
          generalLogger.warn('[ClientContext] Stale relationshipId for URL clientId — clearing headers')
          clearDelegatedClientContext(() => get().clearClientContext())
          return {} as Record<string, string>
        }

        // Validate before returning headers (client null = pending invitation, accountant-owned)
        if (!state.accountant?.id || !state.relationshipId) {
          generalLogger.warn('[ClientContext] Invalid context for headers, clearing')
          clearDelegatedClientContext(() => get().clearClientContext())
          return {} as Record<string, string>
        }

        // BANK GRADE: Using centralized header constants for consistency
        // When client is null (pending invitation), omit CLIENT_USER_ID → DIRECT flow
        const headers: Record<string, string> = {
          [CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID]: state.accountant.id,
          [CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID]: state.relationshipId,
        }
        if (state.client?.id) {
          headers[CLIENT_CONTEXT_HEADERS.CLIENT_USER_ID] = state.client.id
        }
        return headers
      },
    }),
    {
      name: 'client-context',
      partialize: (state) => ({
        isActingAsClient: state.isActingAsClient,
        accountant: state.accountant,
        client: state.client,
        relationshipId: state.relationshipId,
        relationshipCustomerName: state.relationshipCustomerName,
        lastValidatedAt: state.lastValidatedAt,
      }),
      onRehydrateStorage: () => (state) => {
        discardStalePersistedClientContextOnRehydrate(state)
        if (state) {
          state.contextGateResolved = false
        }
      },
    }
  )
)

// Auto-validate context on module load (browser only)
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
  // Validate context periodically (every hour)
  setInterval(
    () => {
      const state = useClientContext.getState()
      if (state.isActingAsClient) {
        state.validateContext().catch(() => {
          // Non-critical - validation errors are handled internally
        })
      }
    },
    60 * 60 * 1000
  ) // 1 hour
}
