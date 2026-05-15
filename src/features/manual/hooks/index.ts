/**
 * Manual Feature Hooks
 *
 * @module features/manual/hooks
 */

export {
  useManualLayoutResets,
  type ManualLayoutResetRefs,
  type UseManualLayoutResetsParams,
} from './useManualLayoutResets'
export type { UseManualPanelResizeReturn } from './useManualPanelResize'
export { useManualPanelResize } from './useManualPanelResize'
export type { UseManualToolbarReturn } from './useManualToolbar'
export { useManualToolbar } from './useManualToolbar'
export {
  usePdfStalenessLifecycle,
  type GetReportFn,
  type PdfLifecycleTranslator,
  type UsePdfStalenessLifecycleParams,
  type UsePdfStalenessLifecycleResult,
} from './usePdfStalenessLifecycle'
export {
  useIsMountedRef,
  useLatestRef,
} from './useNavigationCancellation'
export {
  useResultToReportBridge,
  type UseResultToReportBridgeParams,
} from './useResultToReportBridge'
export {
  useRestorationGate,
  type UseRestorationGateParams,
  type UseRestorationGateResult,
} from './useRestorationGate'
export {
  useValuationPersistenceCoordinator,
  type MethodPersistIntent,
  type PersistIntent,
  type PersistRunner,
  type PreparerPersistIntent,
  type ValuationPersistenceCoordinator,
  type ValuationPersistenceCoordinatorParams,
} from './useValuationPersistenceCoordinator'
