/**
 * Session Bootstrap Module
 * 
 * World-class initialization system for Venus.
 * Resolves auth, session, and prefill data BEFORE UI renders.
 * 
 * @module lib/bootstrap
 */

// Types
export * from './types';

// Service
export { SessionBootstrapService, bootstrapService } from './SessionBootstrapService';

// Resolvers
export { AuthResolver, authResolver } from './resolvers/AuthResolver';
export { SessionResolver, sessionResolver } from './resolvers/SessionResolver';
export { PrefillResolver, prefillResolver } from './resolvers/PrefillResolver';

// React Provider and Hooks
export {
  BootstrapProvider,
  useBootstrap,
  useBootstrapSafe,
  useBootstrapIdentity,
  useBootstrapReport,
  useBootstrapPrefill,
  useBootstrapUI,
  useIsBootstrapComplete,
} from './BootstrapProvider';

// Utils
export { 
  parseBootstrapHints, 
  generateReportId,
  parseUrlToContext,
  calculatePrefillConfidence,
  mergeWithPriority,
} from './utils';
