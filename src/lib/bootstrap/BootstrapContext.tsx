'use client'

import { createContext, useContext } from 'react'
import type {
  IdentityState,
  PrefillData,
  ReportState,
  SessionBootstrapState,
  UIHints,
} from './types'
import { REQUIRE_AUTH_FOR_VALUATION } from './types'

export interface BootstrapContextValue {
  state: SessionBootstrapState
  isBootstrapping: boolean
  bootstrapError: string | null

  identity: IdentityState
  report: ReportState
  prefillData: PrefillData
  ui: UIHints
  creditStatus?: SessionBootstrapState['creditStatus']

  /** @deprecated Guest flow is no longer supported - always returns false */
  isGuest: boolean
  isAuthenticated: boolean
  requiresAuth: boolean
  isAccountantFlow: boolean
  isNewReport: boolean
  isExistingReport: boolean
  hasPrefilledData: boolean

  refreshBootstrap: () => Promise<void>
  updateIdentity: (identity: Partial<IdentityState>) => void
  updateReport: (report: Partial<ReportState>) => void
  updatePrefillData: (prefillData: Partial<PrefillData>) => void
  updateUIHints: (ui: Partial<UIHints>) => void
}

export const BootstrapContext = createContext<BootstrapContextValue | null>(null)

export function useBootstrap(): BootstrapContextValue {
  const context = useContext(BootstrapContext)
  if (!context) {
    throw new Error('useBootstrap must be used within a BootstrapProvider')
  }
  return context
}

export function useBootstrapSafe(): BootstrapContextValue | null {
  return useContext(BootstrapContext)
}

export function useBootstrapIdentity(): IdentityState {
  const { identity } = useBootstrap()
  return identity
}

export function useBootstrapReport(): ReportState {
  const { report } = useBootstrap()
  return report
}

export function useBootstrapPrefill(): PrefillData {
  const { prefillData } = useBootstrap()
  return prefillData
}

export function useBootstrapUI(): UIHints {
  const { ui } = useBootstrap()
  return ui
}

export function useIsBootstrapComplete(): boolean {
  const context = useBootstrapSafe()
  if (!context) return false
  return !context.isBootstrapping && !context.bootstrapError
}

export function resolveBootstrapConvenienceFlags(state: SessionBootstrapState) {
  return {
    isGuest: false,
    isAuthenticated:
      state.identity.type === 'authenticated' || state.identity.type === 'accountant_for_client',
    requiresAuth: REQUIRE_AUTH_FOR_VALUATION,
    isAccountantFlow: state.identity.type === 'accountant_for_client',
    isNewReport: state.report.mode === 'new',
    isExistingReport: state.report.mode === 'existing',
  }
}
