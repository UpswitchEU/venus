/**
 * useCanSave Hook
 *
 * Guards destructive actions (save, create valuation, etc.) until
 * auth and bootstrap are fully complete. This is the counterpart to
 * the optimistic rendering in Mercury flows: the UI renders instantly,
 * but actual API calls that require auth context are deferred until ready.
 *
 * Usage:
 *   const { canSave, reason } = useCanSave()
 *   <Button disabled={!canSave} title={reason}>Save</Button>
 *
 * @module hooks/useCanSave
 */

import { useAuthStore } from '../lib/auth'
import { useBootstrapSafe } from '../lib/bootstrap'

interface CanSaveResult {
  /** Whether save/create operations are safe to execute */
  canSave: boolean
  /** Human-readable reason when canSave is false */
  reason?: string
}

export function useCanSave(): CanSaveResult {
  const authLoading = useAuthStore((s) => s.loading)
  const isInitializing = useAuthStore((s) => s.isInitializing)

  const bootstrap = useBootstrapSafe()
  const isBootstrapping = bootstrap?.isBootstrapping ?? false

  if (authLoading || isInitializing) {
    return { canSave: false, reason: 'unauthenticated' }
  }

  if (isBootstrapping) {
    return { canSave: false, reason: 'bootstrapping' }
  }

  return { canSave: true }
}
