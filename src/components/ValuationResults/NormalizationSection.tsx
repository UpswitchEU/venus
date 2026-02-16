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
    <div className="bg-card rounded-lg border border-foreground/10 shadow-sm p-6 mb-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground mb-2">
          EBITDA Normalization {versionNumber ? `(Version ${versionNumber})` : ''}
        </h2>
        <p className="text-muted-foreground">
          The reported EBITDA has been normalized to reflect true earning power. These adjustments
          remove tax optimizations, one-time items, and owner-specific expenses.
        </p>
      </div>

      {normalizations.map((norm) => {
        const adjustmentPercentage =
          norm.reported_ebitda !== 0 ? (norm.total_adjustments / norm.reported_ebitda) * 100 : 0

        return (
          <div key={norm.year} className="mb-8 last:mb-0">
            <h3 className="text-lg font-semibold text-foreground mb-4 pb-2 border-b border-foreground/10">
              Year {norm.year}
            </h3>

            {/* Visual Bridge */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {/* Reported EBITDA */}
              <div className="bg-muted rounded-lg p-4 border border-foreground/10">
                <div className="text-sm text-muted-foreground mb-1">Reported EBITDA</div>
                <div className="text-2xl font-bold text-foreground">
                  {formatCurrency(norm.reported_ebitda)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Financial statements</div>
              </div>

              {/* Adjustments */}
              <div className="flex items-center justify-center bg-gradient-to-r from-muted to-primary/10 rounded-lg p-4 border border-foreground/10">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-1">Total Adjustments</div>
                  <div
                    className={`text-xl font-bold ${
                      norm.total_adjustments > 0
                        ? 'text-moss-600'
                        : norm.total_adjustments < 0
                          ? 'text-rust-600'
                          : 'text-foreground'
                    }`}
                  >
                    {norm.total_adjustments > 0 ? '+' : ''}
                    {formatCurrency(norm.total_adjustments)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatPercentage(adjustmentPercentage)}
                  </div>
                </div>
              </div>

              {/* Normalized EBITDA */}
              <div className="bg-primary/10 rounded-lg p-4 border-2 border-primary/30">
                <div className="text-sm text-primary mb-1 font-medium">Normalized EBITDA</div>
                <div className="text-2xl font-bold text-primary">
                  {formatCurrency(norm.normalized_ebitda)}
                </div>
                <div className="text-xs text-primary/80 mt-1">True earning power</div>
              </div>
            </div>

            {/* Adjustment Breakdown Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-foreground/10 rounded-lg">
                <thead className="bg-muted border-b border-foreground/10">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold text-foreground">Category</th>
                    <th className="text-right py-3 px-4 font-semibold text-foreground">Amount</th>
                    <th className="text-left py-3 px-4 font-semibold text-foreground">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Standard adjustments */}
                  {norm.adjustments
                    .filter((a) => a.amount !== 0)
                    .map((adj, idx) => (
                      <tr key={idx} className="border-b border-foreground/10 hover:bg-muted">
                        <td className="py-3 px-4 text-foreground">
                          {getCategoryLabel(adj.category)}
                        </td>
                        <td
                          className={`text-right py-3 px-4 font-medium ${
                            adj.amount > 0 ? 'text-moss-600' : 'text-rust-600'
                          }`}
                        >
                          {adj.amount > 0 ? '+' : ''}
                          {formatCurrency(adj.amount)}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">{adj.note || '—'}</td>
                      </tr>
                    ))}

                  {/* Custom adjustments */}
                  {norm.custom_adjustments && norm.custom_adjustments.length > 0 && (
                    <>
                      {norm.custom_adjustments.map((custom, idx) => (
                        <tr
                          key={`custom-${idx}`}
                          className="border-b border-foreground/10 bg-primary/10 hover:bg-primary/20"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/20 text-primary">
                                Custom
                              </span>
                              <span className="text-foreground font-medium">
                                {custom.description}
                              </span>
                            </div>
                          </td>
                          <td
                            className={`text-right py-3 px-4 font-medium ${
                              custom.amount > 0 ? 'text-moss-600' : 'text-rust-600'
                            }`}
                          >
                            {custom.amount > 0 ? '+' : ''}
                            {formatCurrency(custom.amount)}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">{custom.note || '—'}</td>
                        </tr>
                      ))}
                    </>
                  )}

                  {/* No adjustments message */}
                  {norm.adjustments.filter((a) => a.amount !== 0).length === 0 &&
                    (!norm.custom_adjustments || norm.custom_adjustments.length === 0) && (
                      <tr>
                        <td colSpan={3} className="py-4 px-4 text-center text-muted-foreground italic">
                          No adjustments applied
                        </td>
                      </tr>
                    )}
                </tbody>
                <tfoot className="bg-muted border-t-2 border-foreground/20">
                  <tr>
                    <td className="py-3 px-4 font-semibold text-foreground">Total Adjustments</td>
                    <td
                      className={`text-right py-3 px-4 font-bold ${
                        norm.total_adjustments > 0
                          ? 'text-moss-600'
                          : norm.total_adjustments < 0
                            ? 'text-rust-600'
                            : 'text-foreground'
                      }`}
                    >
                      {norm.total_adjustments > 0 ? '+' : ''}
                      {formatCurrency(norm.total_adjustments)}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {formatPercentage(adjustmentPercentage)} of reported
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Metadata */}
            {norm.confidence_score && (
              <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Confidence:</span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      norm.confidence_score === 'high'
                        ? 'bg-moss-100 text-moss-800'
                        : norm.confidence_score === 'medium'
                          ? 'bg-harvest-100 text-harvest-800'
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
      <div className="mt-6 p-4 bg-primary/10 border border-primary/20 rounded-lg">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-primary mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3">
            <h4 className="text-sm font-semibold text-primary mb-1">Normalization Methodology</h4>
            <p className="text-sm text-primary/90">
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
