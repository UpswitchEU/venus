/**
 * HistoricalDataSection Component
 *
 * Single Responsibility: Render Historical Data form section
 * Extracted from ValuationForm to follow SRP
 *
 * @module components/ValuationForm/sections/HistoricalDataSection
 */

import React from 'react'
import { AuroraFormSection } from '../../../design-system/components'
import { getCurrentFilingYear } from '../../../utils/fiscalYear'
import { HistoricalDataInputs } from '../../forms'

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
  const lastFullYear = getCurrentFilingYear()

  return (
    <AuroraFormSection
      title="Historical Data (Optional)"
      description={`Historical financials allow for CAGR (Compound Annual Growth Rate) calculation and trend analysis. Demonstrating consistent growth and margin stability reduces perceived risk, directly supporting a higher valuation tier. The most recent year (${lastFullYear}) is shared with the "Last Full Year Financials" section above — edits in either place stay in sync.`}
    >
      <HistoricalDataInputs
        historicalInputs={historicalInputs}
        onChange={setHistoricalInputs}
        onBlur={() => undefined}
        foundingYear={foundingYear}
        currentYear={lastFullYear}
      />
    </AuroraFormSection>
  )
}
