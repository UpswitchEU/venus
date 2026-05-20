import { buildBusinessCard } from './businessCard'
import { useAuthStore } from './store'

/**
 * Simple auth hook.
 * Use this instead of useAuthStore directly for the backward-compatible API.
 */
export function useAuth() {
  const user = useAuthStore((state) => state.user)
  const loading = useAuthStore((state) => state.loading)
  const error = useAuthStore((state) => state.error)
  const checkSession = useAuthStore((state) => state.checkSession)
  const exchangeToken = useAuthStore((state) => state.exchangeToken)
  const logout = useAuthStore((state) => state.logout)

  return {
    user,
    loading,
    isLoading: loading,
    error,
    isAuthenticated: user !== null,
    businessCard: buildBusinessCard(user),
    checkSession,
    exchangeToken,
    logout,
    refreshAuth: checkSession,
    cookieHealth: null,
  }
}
