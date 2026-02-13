import React from 'react'
import { useEbitdaNormalizationStore } from '../../store/useEbitdaNormalizationStore'
import { useSessionStore } from '../../store/useSessionStore'
import { NormalizedEBITDAField } from '../normalization/NormalizedEBITDAField'
import { CustomInputField, CustomNumberInputField } from './index'

interface HistoricalDataInputsProps {
  historicalInputs: Record<string, string>
  onChange: (inputs: Record<string, string>) => void
  onBlur: () => void
  foundingYear?: number
  currentYear?: number
}

export const HistoricalDataInputs: React.FC<HistoricalDataInputsProps> = ({
  historicalInputs,
  onChange,
  onBlur,
  foundingYear,
  currentYear,
}) => {
  // Helper function to update historical data
  const updateHistoricalData = (year: number, field: 'revenue' | 'ebitda', value: string) => {
    const key = `${year}_${field}`
    onChange({
      ...historicalInputs,
      [key]: value,
    })
  }

  // Calculate dynamic historical years based on founding year
  // Returns years in descending order (most recent first) for better UX
  // Example: If current year is 2025, returns [2024, 2023] (most recent first)
  const calculateHistoricalYears = (): number[] => {
    const now = currentYear || new Date().getFullYear()
    const historicalYears: number[] = []

    // Show up to 2 years before current year
    // Loop from 1 to 2 to get years in order: now-1 (most recent), now-2 (older)
    for (let i = 1; i <= 2; i++) {
      const year = now - i
      // Only include years >= founding year
      if (!foundingYear || year >= foundingYear) {
        historicalYears.push(year)
      }
    }

    // Array is already in descending order (most recent first): [2024, 2023]
    // Return as-is - no need to reverse
    return historicalYears
  }

  const yearsToShow = calculateHistoricalYears()

  // Get normalization store state
  const {
    openNormalizationModal,
    hasNormalization,
    getNormalizedEbitda,
    getTotalAdjustments,
    getAdjustmentCount,
    getLastUpdated,
    removeNormalization,
  } = useEbitdaNormalizationStore()
  const reportId = useSessionStore((state) => state.session?.reportId)
  const sessionId = reportId || '' // Use reportId as sessionId

  // If no years to show, display a helpful message
  if (yearsToShow.length === 0) {
    return (
      <div className="text-sm text-foreground/50 bg-foreground/[0.04] border border-foreground/[0.08] rounded-xl p-4 text-center">
        <p>No historical data available yet.</p>
        <p className="text-xs mt-1 text-foreground/40">Company was founded in {foundingYear || 'current year'}.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {yearsToShow.map((year) => {
        const revenueKey = `${year}_revenue`
        const ebitdaKey = `${year}_ebitda`
        const revenue = historicalInputs[revenueKey] || ''
        const ebitda = historicalInputs[ebitdaKey] || ''

        // Check if this year has normalization
        const isNormalized = hasNormalization(year)

        return (
          <div key={year} className="grid grid-cols-1 @5xl:grid-cols-3 gap-6">
            <div>
              <CustomInputField
                label="Year"
                type="text"
                value={year.toString()}
                onChange={() => {
                  // Read-only field, no-op handler
                }}
                onBlur={() => {
                  // Read-only field, no-op handler
                }}
                disabled={true}
                placeholder=""
              />
            </div>
            <div>
              <CustomNumberInputField
                label="Revenue (€)"
                placeholder="e.g., 2,000,000"
                value={revenue}
                onChange={(e) => updateHistoricalData(year, 'revenue', e.target.value)}
                onBlur={onBlur}
                name={revenueKey}
                min={0}
                step={1000}
                prefix="€"
                formatAsCurrency
              />
            </div>
            <div>
              {isNormalized && sessionId ? (
                <NormalizedEBITDAField
                  label="EBITDA (€)"
                  originalValue={parseFloat(ebitda.replace(/,/g, '')) || 0}
                  normalizedValue={getNormalizedEbitda(year)}
                  totalAdjustments={getTotalAdjustments(year)}
                  adjustmentCount={getAdjustmentCount(year)}
                  lastUpdated={getLastUpdated(year)}
                  onEdit={() => {
                    const reportedEbitda = parseFloat(ebitda.replace(/,/g, '')) || 0
                    openNormalizationModal(year, reportedEbitda, sessionId)
                  }}
                  onRemove={() => {
                    removeNormalization(sessionId, year)
                  }}
                  helpText={`Normalized for year ${year}. Used in valuation calculations.`}
                />
              ) : (
                <>
                  <CustomNumberInputField
                    label="EBITDA (€)"
                    placeholder="e.g., 400,000"
                    value={ebitda}
                    onChange={(e) => updateHistoricalData(year, 'ebitda', e.target.value)}
                    onBlur={onBlur}
                    name={ebitdaKey}
                    step={1000}
                    prefix="€"
                    formatAsCurrency
                  />

                  {/* EBITDA Normalization Link */}
                  {sessionId && ebitda && parseFloat(ebitda.replace(/,/g, '')) !== 0 && (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => {
                          const reportedEbitda = parseFloat(ebitda.replace(/,/g, '')) || 0
                          openNormalizationModal(year, reportedEbitda, sessionId)
                        }}
                        className="text-sm text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                        Normalize EBITDA for {year}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default HistoricalDataInputs
