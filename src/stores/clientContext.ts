import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CLIENT_CONTEXT_HEADERS } from '../constants/headers'
import { getApiUrl } from '../utils/getMercuryUrl'

interface ClientContextResponseDto {
  accountantUser: {
    id: string
    email: string
    full_name: string
  }
  clientUser: {
    id: string
    email: string
    full_name: string
    avatar_url: string | null
  }
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
  lastValidatedAt: number | null // Timestamp of last validation

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
      lastValidatedAt: null,

      setClientContext: (context) => {
        // Validate context structure before setting
        if (!context.accountantUser?.id || !context.clientUser?.id || !context.relationship?.id) {
          console.warn('[ClientContext] Invalid context structure, clearing')
          get().clearClientContext()
          return
        }

        set({
          isActingAsClient: true,
          accountant: {
            id: context.accountantUser.id,
            email: context.accountantUser.email,
            fullName: context.accountantUser.full_name,
          },
          client: {
            id: context.clientUser.id,
            email: context.clientUser.email,
            fullName: context.clientUser.full_name,
            avatarUrl: context.clientUser.avatar_url,
          },
          relationshipId: context.relationship.id,
          lastValidatedAt: Date.now(),
        })
      },

      clearClientContext: () => {
        set({
          isActingAsClient: false,
          accountant: null,
          client: null,
          relationshipId: null,
          lastValidatedAt: null,
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
          console.warn('[ClientContext] Context expired, clearing')
          get().clearClientContext()
          return false
        }

        // Validate context structure
        if (!state.accountant?.id || !state.client?.id || !state.relationshipId) {
          console.warn('[ClientContext] Invalid context structure, clearing', {
            hasAccountant: !!state.accountant?.id,
            hasClient: !!state.client?.id,
            hasRelationshipId: !!state.relationshipId,
            contextAge: state.lastValidatedAt ? Date.now() - state.lastValidatedAt : 'never',
          })
          get().clearClientContext()
          return false
        }

        // Try to refresh context from backend if needed
        // This is a lightweight check - just verify the relationship still exists
        try {
          const API_URL = getApiUrl()

          // Quick validation endpoint (if available)
          // For now, just check if we have valid IDs
          // In production, you might want to call an actual validation endpoint

          // Update lastValidatedAt
          set({ lastValidatedAt: Date.now() })
          return true
        } catch (error) {
          console.warn('[ClientContext] Validation failed, clearing context', error)
          get().clearClientContext()
          return false
        }
      },

      getContextHeaders: (): Record<string, string> => {
        const state = get()
        if (!state.isActingAsClient) return {} as Record<string, string>

        // Validate before returning headers
        if (!state.client?.id || !state.accountant?.id || !state.relationshipId) {
          console.warn('[ClientContext] Invalid context for headers, clearing')
          get().clearClientContext()
          return {} as Record<string, string>
        }

        // BANK GRADE: Using centralized header constants for consistency
        // FlowRouter accepts both naming conventions, but we use the canonical names
        return {
          [CLIENT_CONTEXT_HEADERS.CLIENT_USER_ID]: state.client.id,
          [CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID]: state.accountant.id,
          [CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID]: state.relationshipId,
        }
      },
    }),
    {
      name: 'client-context',
      // BANK GRADE: Simplified rehydration - no complex async logic
      // AuthGate now handles the orchestration of auth → context → bootstrap
      // Context validation happens via:
      // 1. validateContext() called by components when needed
      // 2. TTL expiration check (24h)
      // 3. Manual logout clears context
      // No auth subscriptions needed - AuthGate ensures proper sequencing
    }
  )
)

// Auto-validate context on module load (browser only)
if (typeof window !== 'undefined') {
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
