/**
 * Loading Progress Component
 * 
 * Displays progressive loading indicators for valuation data restoration.
 * Shows which parts of the restoration are complete and which are in progress.
 * 
 * Features:
 * - Step-by-step progress visualization
 * - Completion indicators
 * - Smooth transitions
 * 
 * @module components/LoadingProgress
 */

import React from 'react'
import { useLoadingCoordinator } from '../store/useLoadingCoordinator'
import { CheckCircle, Loader } from 'lucide-react'

export function LoadingProgress() {
  const loading = useLoadingCoordinator((state) => state.loading)

  const steps = [
    { key: 'session' as const, label: 'Loading session...', completed: !loading.session },
    { key: 'form' as const, label: 'Restoring form data...', completed: !loading.form },
    { key: 'results' as const, label: 'Loading results...', completed: !loading.results },
    { key: 'versions' as const, label: 'Loading versions...', completed: !loading.versions },
    { key: 'pricing' as const, label: 'Loading pricing...', completed: !loading.pricing },
    { key: 'packages' as const, label: 'Loading packages...', completed: !loading.packages },
  ]

  // Only show if at least one step is loading
  const isAnyLoading = Object.values(loading).some((v) => v === true)
  if (!isAnyLoading) return null

  return (
    <div className="fixed top-4 right-4 z-50 bg-white rounded-lg shadow-lg border border-gray-200 p-4 min-w-[280px]">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Loading Valuation</h3>
      <div className="space-y-2">
        {steps.map((step) => (
          <div
            key={step.key}
            className={`flex items-center gap-2 text-sm transition-all ${
              step.completed ? 'text-green-600' : 'text-gray-600'
            }`}
          >
            {step.completed ? (
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
            ) : (
              <Loader className="h-4 w-4 flex-shrink-0 animate-spin" />
            )}
            <span>{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
