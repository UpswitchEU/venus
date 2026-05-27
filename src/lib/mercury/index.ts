/**
 * Mercury → Venus cross-app handoff utilities.
 */
export {
  buildMercuryDelegatedHandoffSignals,
  buildMercuryDelegatedHandoffSignalsFromBootstrapContext,
  buildSeedIdentity,
  canRenderReportSession,
  hasAssetsInSession,
  isDelegatedMercuryAccountantHandoff,
  shouldAllowOptimisticMercuryRender,
  shouldSeedOptimisticMercuryShell,
  shouldWaitForMercuryClientContextBeforeBootstrap,
  type DelegatedMercuryHandoffSignals,
} from './sessionReadiness'
