import type { StartupValuationGet, StartupValuationSet } from './startupValuationActionTypes'
import { createStartupValuationAssumptionActions } from './startupValuationAssumptionActions'
import { createStartupValuationCapTableActions } from './startupValuationCapTableActions'
import { createStartupValuationIntegrationActions } from './startupValuationIntegrationActions'
import { createStartupValuationPedigreeActions } from './startupValuationPedigreeActions'
import type { StartupValuationActions } from './startupValuationStoreTypes'

export function createStartupValuationActions(
  set: StartupValuationSet,
  get: StartupValuationGet
): StartupValuationActions {
  return {
    ...createStartupValuationAssumptionActions(set, get),
    ...createStartupValuationPedigreeActions(set),
    ...createStartupValuationCapTableActions(set),
    ...createStartupValuationIntegrationActions(set, get),
  } satisfies StartupValuationActions
}
