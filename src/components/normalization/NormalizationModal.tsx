/**
 * EBITDA Normalization Modal
 *
 * Main modal for entering EBITDA normalization adjustments
 * Displays 12 category inputs with live preview
 */

import React, { useEffect, useState } from 'react'
import { NORMALIZATION_CATEGORIES } from '../../config/normalizationCategories'
import { NormalizationAPIError } from '../../services/ebitdaNormalizationService'
import { useEbitdaNormalizationStore } from '../../store/useEbitdaNormalizationStore'
import { NormalizationCategory } from '../../types/ebitdaNormalization'
import { AdjustmentAmountInput } from './AdjustmentAmountInput'
import { NormalizationPreview } from './NormalizationPreview'

interface NormalizationModalProps {
  isOpen: boolean
  year: number
  sessionId: string
  onClose: () => void
  onSave?: () => void
}

export const NormalizationModal: React.FC<NormalizationModalProps> = ({
  isOpen,
  year,
  sessionId,
  onClose,
  onSave,
}) => {
  const {
    normalizations,
    marketRateSuggestions,
    isSaving,
    updateAdjustment,
    addCustomAdjustment,
    updateCustomAdjustment,
    removeCustomAdjustment,
    saveNormalization,
    getTotalAdjustments,
    getNormalizedEbitda,
  } = useEbitdaNormalizationStore()

  const normalization = normalizations[year]
  const suggestions = marketRateSuggestions[year] || []

  const [expandedCategories, setExpandedCategories] = useState<Set<NormalizationCategory>>(
    new Set()
  )
  const [localAdjustments, setLocalAdjustments] = useState<
    Record<string, { amount: string; note: string }>
  >({})

  useEffect(() => {
    if (normalization) {
      // Initialize local state from store
      const adjustmentsMap: Record<string, { amount: string; note: string }> = {}
      normalization.adjustments.forEach((adj) => {
        adjustmentsMap[adj.category] = {
          amount: adj.amount.toString(),
          note: adj.note || '',
        }
      })
      setLocalAdjustments(adjustmentsMap)
    }
  }, [normalization?.adjustments])

  if (!isOpen || !normalization) return null

  const handleAmountChange = (category: NormalizationCategory, value: string) => {
    // Remove commas and parse
    const cleanedValue = value.replace(/,/g, '')

    setLocalAdjustments((prev) => ({
      ...prev,
      [category]: {
        amount: cleanedValue, // Store cleaned value for display
        note: prev[category]?.note || '',
      },
    }))

    // Update store with parsed value
    const numValue = parseFloat(cleanedValue) || 0
    updateAdjustment(year, category, numValue, localAdjustments[category]?.note)
  }

  const handleNoteChange = (category: NormalizationCategory, note: string) => {
    setLocalAdjustments((prev) => ({
      ...prev,
      [category]: {
        amount: prev[category]?.amount || '0',
        note,
      },
    }))

    const numValue = parseFloat(localAdjustments[category]?.amount || '0') || 0
    updateAdjustment(year, category, numValue, note)
  }

  const toggleCategory = (category: NormalizationCategory) => {
    setExpandedCategories((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(category)) {
        newSet.delete(category)
      } else {
        newSet.add(category)
      }
      return newSet
    })
  }

  const handleRemoveAdjustment = (categoryId: string) => {
    // Clear the adjustment by setting it to 0
    updateAdjustment(year, categoryId as NormalizationCategory, 0, '')
    setLocalAdjustments((prev) => ({
      ...prev,
      [categoryId]: { amount: '', note: '' },
    }))
  }

  const handleRemoveCustomAdjustment = (id: string) => {
    removeCustomAdjustment(year, id)
  }

  const handleSave = async () => {
    try {
      await saveNormalization(sessionId, year)
      // Save succeeded - call callbacks and close modal
      onSave?.()
      onClose()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorType = error instanceof Error ? error.constructor.name : typeof error
      console.error('[Modal] Save error details', {
        error,
        errorType,
        errorMessage,
        isAPIError: error instanceof NormalizationAPIError,
      })

      // Check if the error is a real API error or just state update issue
      if (error instanceof NormalizationAPIError) {
        // Real API error - show error message, keep modal open
        // Error is already in store state, will be displayed
        return
      }

      // Unknown error - log it but still close modal since save might have succeeded
      console.warn('Unknown error during save, closing modal anyway', error)
      onClose()
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-BE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div className="relative bg-popover rounded-lg shadow-xl border border-foreground/10 max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">Normalize EBITDA for {year}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Adjust reported EBITDA to reflect true earning power
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 flex-1 min-h-0">
              {/* Left: Categories - Scrollable */}
              <div className="lg:col-span-2 space-y-4 overflow-y-auto overflow-x-hidden pr-2 min-h-0">
                {NORMALIZATION_CATEGORIES.map((categoryDef) => {
                  const isExpanded = expandedCategories.has(categoryDef.id)
                  const localValue = localAdjustments[categoryDef.id]
                  const amount = localValue?.amount || '0'
                  const note = localValue?.note || ''

                  return (
                    <div
                      key={categoryDef.id}
                      className="bg-card border border-foreground/10 rounded-lg p-4"
                    >
                      {/* Category Header */}
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-slate-ink">{categoryDef.label}</h4>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground"
                              title={categoryDef.description}
                            >
                              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                                <path
                                  fillRule="evenodd"
                                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </button>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{categoryDef.description}</p>

                          {/* Expandable details */}
                          {isExpanded && (
                            <div className="mt-3 p-4 bg-card rounded-lg border border-foreground/10 text-sm space-y-3">
                              <div>
                                <p className="text-slate-ink leading-relaxed">
                                  {categoryDef.detailedDescription}
                                </p>
                              </div>
                              <div>
                                <p className="font-semibold text-slate-ink mb-2">Examples:</p>
                                <ul className="list-disc list-inside text-muted-foreground space-y-1.5 ml-1">
                                  {categoryDef.examples.map((example, idx) => (
                                    <li key={idx} className="leading-relaxed">
                                      {example}
                                    </li>
                                  ))}
                                </ul>
                              </div>

                              {/* Visual Guidance in Learn More */}
                              <div className="pt-2 border-t border-foreground/10">
                                <p className="font-semibold text-slate-ink mb-2">When to adjust:</p>
                                <div className="space-y-2">
                                  <div className="flex items-start gap-2">
                                    <span className="text-moss-600 font-semibold flex-shrink-0">
                                      + Add:
                                    </span>
                                    <span className="text-muted-foreground">
                                      {categoryDef.visualGuidance.positiveScenario}
                                    </span>
                                  </div>
                                  <div className="flex items-start gap-2">
                                    <span className="text-rust-600 font-semibold flex-shrink-0">
                                      − Subtract:
                                    </span>
                                    <span className="text-muted-foreground">
                                      {categoryDef.visualGuidance.negativeScenario}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => toggleCategory(categoryDef.id)}
                            className="text-sm text-primary hover:text-primary/90 mt-2"
                          >
                            {isExpanded ? 'Show less' : 'Learn more'}
                          </button>
                        </div>
                      </div>

                      {/* Amount Input */}
                      <div className="mt-4">
                        <AdjustmentAmountInput
                          category={categoryDef}
                          value={parseFloat(amount) || 0}
                          onChange={(newValue) =>
                            handleAmountChange(categoryDef.id, String(newValue))
                          }
                        />
                        <p className="text-xs text-muted-foreground mt-1">{categoryDef.helpText}</p>
                      </div>

                      {/* Note Input */}
                      <div className="mt-3">
                        <label className="block text-sm font-medium text-slate-ink mb-1">
                          Note (optional)
                        </label>
                        <textarea
                          value={note}
                          onChange={(e) => handleNoteChange(categoryDef.id, e.target.value)}
                          rows={2}
                          className="w-full px-3 py-2 border border-foreground/10 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary resize-none bg-card text-slate-ink"
                          placeholder="Add context or rationale for this adjustment..."
                        />
                      </div>
                    </div>
                  )
                })}

                {/* Custom Adjustments Section */}
                <div className="mt-6 pt-6 border-t-2 border-white/10">
                  <h3 className="text-lg font-semibold text-white mb-4">Custom Adjustments</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Add your own adjustments with custom descriptions for business-specific
                    normalizations
                  </p>

                  {(normalization.custom_adjustments || []).map((custom) => (
                    <div
                      key={custom.id}
                      className="bg-accent-50 border border-accent-200 rounded-lg p-4 mb-3"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <input
                          type="text"
                          value={custom.description}
                          onChange={(e) =>
                            updateCustomAdjustment(
                              year,
                              custom.id!,
                              e.target.value,
                              custom.amount,
                              custom.note
                            )
                          }
                          placeholder="Enter adjustment description (e.g., 'Seasonal adjustment for Q4')"
                          className="flex-1 mr-2 px-3 py-2 border border-foreground/10 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-card text-slate-ink"
                        />
                        <button
                          type="button"
                          onClick={() => removeCustomAdjustment(year, custom.id!)}
                          className="text-rust-600 hover:text-rust-700 p-2"
                          title="Remove custom adjustment"
                        >
                          <svg
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
                              €
                            </span>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="-?[0-9]*"
                              value={custom.amount?.toString() || '0'}
                              onChange={(e) => {
                                const cleanedValue = e.target.value.replace(/,/g, '')
                                const numValue = parseFloat(cleanedValue) || 0
                                updateCustomAdjustment(
                                  year,
                                  custom.id!,
                                  custom.description,
                                  numValue,
                                  custom.note
                                )
                              }}
                              className="w-full h-14 px-4 pt-6 pb-2 pl-8 text-base text-slate-ink bg-card border border-foreground/10 rounded-xl transition-all duration-200 hover:border-primary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none placeholder:text-muted-foreground"
                              placeholder="0"
                            />
                            <label className="absolute left-8 top-2 text-xs text-muted-foreground font-medium pointer-events-none">
                              Amount (€)
                            </label>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Positive adds, negative reduces
                          </p>
                        </div>
                        <div>
                          <div className="relative">
                            <input
                              type="text"
                              value={custom.note || ''}
                              onChange={(e) =>
                                updateCustomAdjustment(
                                  year,
                                  custom.id!,
                                  custom.description,
                                  custom.amount,
                                  e.target.value
                                )
                              }
                              className="w-full h-14 px-4 pt-6 pb-2 text-base text-slate-ink bg-card border border-foreground/10 rounded-xl transition-all duration-200 hover:border-primary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none placeholder:text-muted-foreground"
                              placeholder="Additional context..."
                            />
                            <label className="absolute left-4 top-2 text-xs text-muted-foreground font-medium pointer-events-none">
                              Note (optional)
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => addCustomAdjustment(year)}
                    className="w-full py-3 border-2 border-dashed border-foreground/20 rounded-lg text-muted-foreground hover:border-primary hover:text-primary hover:bg-muted transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    Add Custom Adjustment
                  </button>
                </div>
              </div>

              {/* Right: Preview */}
              <div className="lg:col-span-1">
                <NormalizationPreview
                  reportedEbitda={normalization.reported_ebitda}
                  totalAdjustments={getTotalAdjustments(year)}
                  normalizedEbitda={getNormalizedEbitda(year)}
                  year={year}
                  adjustments={normalization.adjustments}
                  customAdjustments={normalization.custom_adjustments}
                  onRemoveAdjustment={handleRemoveAdjustment}
                  onRemoveCustomAdjustment={handleRemoveCustomAdjustment}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-white/10 bg-muted">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {normalization.adjustments.length + (normalization.custom_adjustments?.length || 0)}{' '}
                active adjustment
                {normalization.adjustments.length +
                  (normalization.custom_adjustments?.length || 0) !==
                1
                  ? 's'
                  : ''}
                {(normalization.custom_adjustments?.length || 0) > 0 && (
                  <span className="ml-2 text-primary">
                    ({normalization.custom_adjustments?.length} custom)
                  </span>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-foreground bg-muted border border-foreground/10 rounded-lg hover:bg-foreground/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-6 py-2 text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {isSaving ? 'Saving...' : 'Save Normalization'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
