/**
 * HistoricalDataSection Component
 *
 * Single Responsibility: Render Historical Data form section
 * Extracted from ValuationForm to follow SRP
 *
 * @module components/ValuationForm/sections/HistoricalDataSection
 */

import React from 'react'
import { HistoricalDataInputs } from '../../forms'
import { InfoIcon } from '../../ui/InfoIcon'

interface HistoricalDataSectionProps {
  historicalInputs: { [key: string]: string }
  setHistoricalInputs: React.Dispatch<React.SetStateAction<{ [key: string]: string }>>
  foundingYear: number | undefined
}

/**
 * HistoricalDataSection Component
 *
 * Renders Historical Data section with HistoricalDataInputs component
 */
export const HistoricalDataSection: React.FC<HistoricalDataSectionProps> = ({
  historicalInputs,
  setHistoricalInputs,
  foundingYear,
}) => {
  // Calculate last full year (same calculation as FinancialDataSection)
  // This ensures historical years are relative to the "Last Full Year" (2025)
  // not the current calendar year (2026)
  const lastFullYear = Math.min(new Date().getFullYear() - 1, 2100)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6 pb-2 border-b border-white/10">
        <h3 className="text-xl font-semibold text-white tracking-tight flex items-center">
          Historical Data (Optional)
          <InfoIcon
            content="Historical financials allow for CAGR (Compound Annual Growth Rate) calculation and trend analysis. Demonstrating consistent growth and margin stability reduces perceived risk, directly supporting a higher valuation tier."
            position="top"
            size={20}
            className="ml-1.5"
          />
        </h3>
      </div>

      <HistoricalDataInputs
        historicalInputs={historicalInputs}
        onChange={setHistoricalInputs}
        onBlur={() => {}}
        foundingYear={foundingYear}
        currentYear={lastFullYear}
      />
    </div>
  )
}
