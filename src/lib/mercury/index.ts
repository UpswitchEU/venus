/**
 * Mercury → Venus cross-app handoff utilities.
 */
export {
  buildMercuryDelegatedHandoffSignals,
  buildMercuryDelegatedHandoffSignalsFromBootstrapContext,
  buildSeedIdentity,
  canRenderReportSession,
  type DelegatedMercuryHandoffSignals,
  hasAssetsInSession,
  isDelegatedMercuryAccountantHandoff,
  shouldAllowOptimisticMercuryRender,
  shouldSeedOptimisticMercuryShell,
  shouldWaitForMercuryClientContextBeforeBootstrap,
} from './sessionReadiness'
