/**
 * Loading Coordinator Store
 * 
 * Centralized loading state management to prevent race conditions
 * and provide pristine async UX across all Venus flows.
 * 
 * Features:
 * - Track multiple loading states simultaneously
 * - Wait for all operations to complete
 * - Prevent duplicate fetches
 * - Provide loading progress for UI
 * 
 * @module store/useLoadingCoordinator
 */

import { create } from 'zustand'

export interface LoadingState {
  session: boolean
  form: boolean
  results: boolean
  versions: boolean
  packages: boolean
  pricing: boolean
}

interface LoadingCoordinatorStore {
  loading: LoadingState
  setLoading: (key: keyof LoadingState, value: boolean) => void
  isAnyLoading: () => boolean
  waitForAll: () => Promise<void>
  reset: () => void
}

const initialLoadingState: LoadingState = {
  session: false,
  form: false,
  results: false,
  versions: false,
  packages: false,
  pricing: false,
}

export const useLoadingCoordinator = create<LoadingCoordinatorStore>((set, get) => ({
  loading: initialLoadingState,

  setLoading: (key, value) => {
    set((state) => ({
      loading: { ...state.loading, [key]: value },
    }))
  },

  isAnyLoading: () => {
    const { loading } = get()
    return Object.values(loading).some((v) => v === true)
  },

  waitForAll: async () => {
    // Poll every 100ms until all loading states are false
    while (get().isAnyLoading()) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  },

  reset: () => {
    set({ loading: initialLoadingState })
  },
}))
