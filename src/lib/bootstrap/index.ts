/**
 * Session Bootstrap Module
 *
 * World-class initialization system for Venus.
 * Resolves auth, session, and prefill data BEFORE UI renders.
 *
 * @module lib/bootstrap
 */

// React Provider and Hooks
export {
  BootstrapProvider,
  useBootstrap,
  useBootstrapIdentity,
  useBootstrapPrefill,
  useBootstrapReport,
  useBootstrapSafe,
  useBootstrapUI,
  useIsBootstrapComplete,
} from './BootstrapProvider'
// Resolvers
export { AuthResolver, authResolver } from './resolvers/AuthResolver'
export { PrefillResolver, prefillResolver } from './resolvers/PrefillResolver'
export { SessionResolver, sessionResolver } from './resolvers/SessionResolver'
// Service
export { bootstrapService, SessionBootstrapService } from './SessionBootstrapService'
// Types
export * from './types'

// Utils
export {
  calculatePrefillConfidence,
  generateReportId,
  mergeWithPriority,
  parseBootstrapHints,
  parseUrlToContext,
} from './utils'
export {
  ACCOUNTANT_CREDIT_UPGRADE_PATH,
  CLIENT_CREDIT_UPGRADE_PATH,
  type CreditUpgradePath,
  isAccountantBillingUpgradePath,
  isClientPremiumUpgradePath,
} from './credit-upgrade-path'
