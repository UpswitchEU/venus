/**
 * Conversation Summary Block Component
 *
 * Displays a summary of collected data when loading an existing conversational report
 * Styled as a chat message card matching the dark theme of other chat components
 */

import { motion } from 'framer-motion'
import { CheckCircle2, Edit3, FileText, TrendingUp } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { formatCurrency, getCountryByCode } from '../../../config/countries'
import { useEbitdaNormalizationStore } from '../../../store/useEbitdaNormalizationStore'

export interface ConversationSummaryBlockProps {
  sessionId?: string
  collectedData: Record<string, any>
  completionPercentage?: number
  calculatedAt?: Date | string
  valuationResult?: any
  onContinue?: () => void
  onViewReport?: () => void
  onNormalizeEbitda?: () => void
  onRecalculateValuation?: () => void
}

interface HistoricalYearData {
  year: number
  revenue: number | null
  ebitda: number | null
}

export const ConversationSummaryBlock: React.FC<ConversationSummaryBlockProps> = ({
  sessionId,
  collectedData,
  completionPercentage: _completionPercentage,
  calculatedAt,
  valuationResult,
  onContinue,
  onViewReport,
  onNormalizeEbitda,
  onRecalculateValuation,
}) => {
  // State for normalization tracking
  const [hasNormalizations, setHasNormalizations] = useState(false)
  const [normalizedYearsCount, setNormalizedYearsCount] = useState(0)

  // Fetch normalization status
  useEffect(() => {
    if (!sessionId) return

    const loadNormalizations = async () => {
      try {
        await useEbitdaNormalizationStore.getState().loadAllNormalizations(sessionId)
        const normalizations = useEbitdaNormalizationStore.getState().normalizations
        const count = Object.keys(normalizations).length
        setHasNormalizations(count > 0)
        setNormalizedYearsCount(count)
      } catch (error) {
        console.error('Failed to load normalizations:', error)
      }
    }

    loadNormalizations()
  }, [sessionId])

  // Extract key data points
  // FIX: Use correct field names matching the data structure (country_code, founding_year, number_of_owners)
  const companyName = collectedData?.company_name
  const industry = collectedData?.industry
  // Determine current year for fallback extraction
  const currentYearForExtraction =
    collectedData?.current_year_data?.year || new Date().getFullYear()
  // Extract current year revenue/EBITDA with fallbacks
  const revenue =
    collectedData?.current_year_data?.revenue ||
    collectedData?.revenue ||
    collectedData?.[`${currentYearForExtraction}_revenue`]
  const ebitda =
    collectedData?.current_year_data?.ebitda ||
    collectedData?.ebitda ||
    collectedData?.[`${currentYearForExtraction}_ebitda`]
  const countryCode = collectedData?.country_code || collectedData?.country || 'BE'
  const businessType = collectedData?.business_type
  // Format country code to readable name
  const countryInfo = countryCode ? getCountryByCode(countryCode) : null
  const countryDisplay = countryInfo ? `${countryInfo.flag} ${countryInfo.name}` : countryCode
  // FIX: Check founding_year first (matches generateImportSummary), then fallback to other field names
  const foundedYear =
    collectedData?.founding_year ||
    collectedData?.founded_year ||
    collectedData?.year_business_commenced
  const employees = collectedData?.number_of_employees || collectedData?.employees
  // FIX: Check number_of_owners first (matches generateImportSummary), then fallback to other field names
  const owners =
    collectedData?.number_of_owners || collectedData?.active_owner_managers || collectedData?.owners
  const sharesForSale = collectedData?.shares_for_sale || collectedData?.equity_stake_for_sale

  // Extract historical financial data
  // Look for keys matching pattern {year}_revenue and {year}_ebitda (e.g., 2023_revenue, 2023_ebitda)
  const historicalYearsMap = new Map<number, HistoricalYearData>()
  // Use the same current year as determined above for consistency
  const currentYear = currentYearForExtraction

  if (collectedData && typeof collectedData === 'object') {
    Object.keys(collectedData).forEach((key) => {
      // Match pattern: {year}_revenue or {year}_ebitda
      const revenueMatch = key.match(/^(\d{4})_revenue$/)
      const ebitdaMatch = key.match(/^(\d{4})_ebitda$/)

      if (revenueMatch) {
        const year = parseInt(revenueMatch[1], 10)
        // Validate year is in reasonable range (2000-2100)
        if (year >= 2000 && year <= 2100 && year !== currentYear) {
          // Skip current year as it's already displayed separately
          const value = collectedData[key]
          // Skip SKIPPED values, null, undefined
          if (value !== 'SKIPPED' && value !== null && value !== undefined) {
            const numValue = typeof value === 'number' ? value : parseFloat(String(value))
            if (!isNaN(numValue)) {
              const existing = historicalYearsMap.get(year) || {
                year,
                revenue: null,
                ebitda: null,
              }
              historicalYearsMap.set(year, { ...existing, revenue: numValue })
            }
          }
        }
      }

      if (ebitdaMatch) {
        const year = parseInt(ebitdaMatch[1], 10)
        // Validate year is in reasonable range (2000-2100)
        if (year >= 2000 && year <= 2100 && year !== currentYear) {
          // Skip current year as it's already displayed separately
          const value = collectedData[key]
          // Skip SKIPPED values, null, undefined
          if (value !== 'SKIPPED' && value !== null && value !== undefined) {
            const numValue = typeof value === 'number' ? value : parseFloat(String(value))
            if (!isNaN(numValue)) {
              const existing = historicalYearsMap.get(year) || {
                year,
                revenue: null,
                ebitda: null,
              }
              historicalYearsMap.set(year, { ...existing, ebitda: numValue })
            }
          }
        }
      }
    })
  }

  // Convert map to array and sort by year (newest first)
  const historicalYears: HistoricalYearData[] = Array.from(historicalYearsMap.values())
    .filter((yearData) => yearData.revenue !== null || yearData.ebitda !== null) // Only include years with at least one value
    .sort((a, b) => b.year - a.year) // Sort newest first

  // Check if valuation is complete
  const isComplete = !!valuationResult && !!calculatedAt

  // Build list of fields to display
  const fieldsToDisplay: Array<{ label: string; value: string | number | null | undefined }> = []

  // Build fields list in logical order
  if (companyName && companyName !== 'Your business') {
    fieldsToDisplay.push({ label: 'Company Name', value: companyName })
  }
  if (businessType) {
    fieldsToDisplay.push({ label: 'Business Type', value: businessType })
  }
  if (industry) {
    fieldsToDisplay.push({ label: 'Industry', value: industry })
  }
  // FIX: Show country if countryCode is available (formatted with flag and name)
  if (countryCode) {
    fieldsToDisplay.push({ label: 'Country', value: countryDisplay })
  }
  if (foundedYear) {
    fieldsToDisplay.push({ label: 'Founded', value: foundedYear })
  }
  if (revenue !== undefined && revenue !== null) {
    fieldsToDisplay.push({
      label: 'Revenue',
      value: formatCurrency(revenue, countryCode),
    })
  }
  if (ebitda !== undefined && ebitda !== null) {
    fieldsToDisplay.push({
      label: 'EBITDA',
      value: formatCurrency(ebitda, countryCode),
    })
  }
  if (employees !== undefined && employees !== null) {
    fieldsToDisplay.push({ label: 'Employees', value: employees })
  }
  if (owners !== undefined && owners !== null) {
    fieldsToDisplay.push({ label: 'Owners', value: owners })
  }
  if (sharesForSale !== undefined && sharesForSale !== null) {
    fieldsToDisplay.push({ label: 'Shares for Sale', value: `${sharesForSale}%` })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="flex justify-start w-full my-2"
    >
      <div className="max-w-[85%] mr-auto w-full">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="flex-shrink-0 w-8 h-8 bg-white/10 rounded-full flex items-center justify-center border border-white/10 shadow-sm mt-1">
            <FileText className="w-4 h-4 text-primary-400" />
          </div>

          <div className="flex flex-col gap-1 w-full">
            {/* Main Card */}
            <div className="rounded-2xl rounded-tl-sm overflow-hidden border border-white/10 shadow-lg backdrop-blur-sm bg-zinc-900/40">
              {/* Header */}
              <div className="px-5 py-3 bg-gradient-to-r from-primary-900/20 to-transparent border-b border-white/10">
                <h4 className="text-sm font-semibold text-white">Collected Information</h4>
              </div>

              {/* Content */}
              <div className="p-5">
                {/* Fields Grid */}
                {fieldsToDisplay.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                    {fieldsToDisplay.map((field, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary-400 mt-1.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-zinc-400">{field.label}</p>
                          <p className="text-sm font-medium text-white truncate">{field.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Historical Financials Section */}
                {historicalYears.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <h5 className="text-xs font-semibold text-zinc-400 mb-3 uppercase tracking-wide">
                      Historical Financials
                    </h5>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="text-left py-2 px-3 text-xs font-semibold text-zinc-400">
                              Year
                            </th>
                            <th className="text-right py-2 px-3 text-xs font-semibold text-zinc-400">
                              Revenue
                            </th>
                            <th className="text-right py-2 px-3 text-xs font-semibold text-zinc-400">
                              EBITDA
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {historicalYears.map((yearData) => (
                            <tr
                              key={yearData.year}
                              className="border-b border-white/5 hover:bg-white/5 transition-colors"
                            >
                              <td className="py-2 px-3 text-sm font-medium text-white">
                                {yearData.year}
                              </td>
                              <td className="py-2 px-3 text-sm text-white text-right">
                                {yearData.revenue !== null
                                  ? formatCurrency(yearData.revenue, countryCode)
                                  : '-'}
                              </td>
                              <td className="py-2 px-3 text-sm text-white text-right">
                                {yearData.ebitda !== null
                                  ? formatCurrency(yearData.ebitda, countryCode)
                                  : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Valuation Result (if complete) */}
                {isComplete && valuationResult && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                      <TrendingUp className="w-5 h-5 text-green-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-zinc-400">Estimated Value</p>
                        <p className="text-lg font-bold text-green-400">
                          {formatCurrency(
                            valuationResult?.valuation_summary?.final_valuation ||
                              valuationResult?.value ||
                              0,
                            countryCode
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Footer with message and button */}
                <div className="mt-4 pt-4 border-t border-white/10">
                  {/* Normalization status badge (if normalized) */}
                  {hasNormalizations && (
                    <div className="mb-3 p-2 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                      <p className="text-xs text-green-400 font-medium">
                        EBITDA normalized for {normalizedYearsCount} year
                        {normalizedYearsCount > 1 ? 's' : ''}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm text-zinc-400 flex-1">
                      {hasNormalizations
                        ? 'Recalculate valuation with normalized EBITDA'
                        : isComplete
                          ? 'Your valuation report is ready to view'
                          : 'Continue the conversation to complete your valuation'}
                    </p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Normalize button (only after valuation complete, before normalization) */}
                      {isComplete && !hasNormalizations && onNormalizeEbitda && (
                        <button
                          onClick={onNormalizeEbitda}
                          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"
                        >
                          <Edit3 className="w-4 h-4" />
                          Normalize EBITDA
                        </button>
                      )}

                      {/* Recalculate button (only when normalized) */}
                      {isComplete && hasNormalizations && onRecalculateValuation && (
                        <button
                          onClick={onRecalculateValuation}
                          className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors flex items-center gap-2"
                        >
                          <TrendingUp className="w-4 h-4" />
                          Recalculate Valuation
                        </button>
                      )}

                      {/* Original buttons */}
                      {isComplete && onViewReport && (
                        <button
                          onClick={onViewReport}
                          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors flex items-center gap-2"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          View Report
                        </button>
                      )}
                      {!isComplete && onContinue && (
                        <button
                          onClick={onContinue}
                          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
                        >
                          Continue
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
