import type { StoreApi } from 'zustand'
import type { StartupValuationStore } from './startupValuationStoreTypes'

export type StartupValuationSet = StoreApi<StartupValuationStore>['setState']
export type StartupValuationGet = StoreApi<StartupValuationStore>['getState']
