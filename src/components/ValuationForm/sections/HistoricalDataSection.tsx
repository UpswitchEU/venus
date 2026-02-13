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
import { AuroraFormSection } from '../../../design-system/components'

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
    <AuroraFormSection 
      title="Historical Data (Optional)"
      description="Historical financials allow for CAGR (Compound Annual Growth Rate) calculation and trend analysis. Demonstrating consistent growth and margin stability reduces perceived risk, directly supporting a higher valuation tier."
    >
      <HistoricalDataInputs
        historicalInputs={historicalInputs}
        onChange={setHistoricalInputs}
        onBlur={() => {}}
        foundingYear={foundingYear}
        currentYear={lastFullYear}
      />
    </AuroraFormSection>
  )
}
