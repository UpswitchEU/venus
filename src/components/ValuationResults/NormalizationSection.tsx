/**
 * Normalization Section for Valuation Results
 *
 * Displays EBITDA normalization adjustments in valuation results
 * Shows visual bridge and adjustment breakdown table
 */

import React from 'react'
import { getCategoryLabel } from '../../config/normalizationCategories'
import { EbitdaNormalization } from '../../types/ebitdaNormalization'

interface NormalizationSectionProps {
  normalizations: EbitdaNormalization[]
  versionNumber?: number
}

export const NormalizationSection: React.FC<NormalizationSectionProps> = ({
  normalizations,
  versionNumber,
}) => {
  if (!normalizations || normalizations.length === 0) {
    return null
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-BE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatPercentage = (value: number) => {
    return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          EBITDA Normalization {versionNumber ? `(Version ${versionNumber})` : ''}
        </h2>
        <p className="text-gray-600">
          The reported EBITDA has been normalized to reflect true earning power. These adjustments
          remove tax optimizations, one-time items, and owner-specific expenses.
        </p>
      </div>

      {normalizations.map((norm) => {
        const adjustmentPercentage =
          norm.reported_ebitda !== 0 ? (norm.total_adjustments / norm.reported_ebitda) * 100 : 0

        return (
          <div key={norm.year} className="mb-8 last:mb-0">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-200">
              Year {norm.year}
            </h3>

            {/* Visual Bridge */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {/* Reported EBITDA */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="text-sm text-gray-600 mb-1">Reported EBITDA</div>
                <div className="text-2xl font-bold text-gray-900">
                  {formatCurrency(norm.reported_ebitda)}
                </div>
                <div className="text-xs text-gray-500 mt-1">Financial statements</div>
              </div>

              {/* Adjustments */}
              <div className="flex items-center justify-center bg-gradient-to-r from-gray-50 to-blue-50 rounded-lg p-4 border border-gray-200">
                <div className="text-center">
                  <div className="text-sm text-gray-600 mb-1">Total Adjustments</div>
                  <div
                    className={`text-xl font-bold ${
                      norm.total_adjustments > 0
                        ? 'text-green-600'
                        : norm.total_adjustments < 0
                          ? 'text-red-600'
                          : 'text-gray-900'
                    }`}
                  >
                    {norm.total_adjustments > 0 ? '+' : ''}
                    {formatCurrency(norm.total_adjustments)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {formatPercentage(adjustmentPercentage)}
                  </div>
                </div>
              </div>

              {/* Normalized EBITDA */}
              <div className="bg-blue-50 rounded-lg p-4 border-2 border-blue-300">
                <div className="text-sm text-blue-700 mb-1 font-medium">Normalized EBITDA</div>
                <div className="text-2xl font-bold text-blue-900">
                  {formatCurrency(norm.normalized_ebitda)}
                </div>
                <div className="text-xs text-blue-600 mt-1">True earning power</div>
              </div>
            </div>

            {/* Adjustment Breakdown Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-gray-200 rounded-lg">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Category</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">Amount</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Standard adjustments */}
                  {norm.adjustments
                    .filter((a) => a.amount !== 0)
                    .map((adj, idx) => (
                      <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="py-3 px-4 text-gray-900">
                          {getCategoryLabel(adj.category)}
                        </td>
                        <td
                          className={`text-right py-3 px-4 font-medium ${
                            adj.amount > 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {adj.amount > 0 ? '+' : ''}
                          {formatCurrency(adj.amount)}
                        </td>
                        <td className="py-3 px-4 text-gray-600">{adj.note || '—'}</td>
                      </tr>
                    ))}

                  {/* Custom adjustments */}
                  {norm.custom_adjustments && norm.custom_adjustments.length > 0 && (
                    <>
                      {norm.custom_adjustments.map((custom, idx) => (
                        <tr
                          key={`custom-${idx}`}
                          className="border-b border-gray-200 bg-blue-50 hover:bg-blue-100"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                Custom
                              </span>
                              <span className="text-gray-900 font-medium">
                                {custom.description}
                              </span>
                            </div>
                          </td>
                          <td
                            className={`text-right py-3 px-4 font-medium ${
                              custom.amount > 0 ? 'text-green-600' : 'text-red-600'
                            }`}
                          >
                            {custom.amount > 0 ? '+' : ''}
                            {formatCurrency(custom.amount)}
                          </td>
                          <td className="py-3 px-4 text-gray-600">{custom.note || '—'}</td>
                        </tr>
                      ))}
                    </>
                  )}

                  {/* No adjustments message */}
                  {norm.adjustments.filter((a) => a.amount !== 0).length === 0 &&
                    (!norm.custom_adjustments || norm.custom_adjustments.length === 0) && (
                      <tr>
                        <td colSpan={3} className="py-4 px-4 text-center text-gray-500 italic">
                          No adjustments applied
                        </td>
                      </tr>
                    )}
                </tbody>
                <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                  <tr>
                    <td className="py-3 px-4 font-semibold text-gray-900">Total Adjustments</td>
                    <td
                      className={`text-right py-3 px-4 font-bold ${
                        norm.total_adjustments > 0
                          ? 'text-green-600'
                          : norm.total_adjustments < 0
                            ? 'text-red-600'
                            : 'text-gray-900'
                      }`}
                    >
                      {norm.total_adjustments > 0 ? '+' : ''}
                      {formatCurrency(norm.total_adjustments)}
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {formatPercentage(adjustmentPercentage)} of reported
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Metadata */}
            {norm.confidence_score && (
              <div className="mt-4 flex items-center gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Confidence:</span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      norm.confidence_score === 'high'
                        ? 'bg-green-100 text-green-800'
                        : norm.confidence_score === 'medium'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-orange-100 text-orange-800'
                    }`}
                  >
                    {norm.confidence_score.toUpperCase()}
                  </span>
                </div>
                {norm.updated_at && (
                  <div>
                    <span className="font-medium">Last updated:</span>{' '}
                    {new Date(norm.updated_at).toLocaleDateString()}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Methodology Note */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3">
            <h4 className="text-sm font-semibold text-blue-900 mb-1">Normalization Methodology</h4>
            <p className="text-sm text-blue-800">
              These user-defined adjustments follow Big 4 normalization standards to reconstruct
              sustainable earning power. The valuation calculations use the normalized EBITDA values
              shown above. All adjustments are documented and included in the audit trail.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
