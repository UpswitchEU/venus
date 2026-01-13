/**
 * Company Preview Card Component
 *
 * Displays selected company details with verification status
 * and allows user to change company selection
 */

import React, { useEffect, useRef, useState } from 'react'
import type { CompanySearchResult } from '../../services/registry/types'

export interface CompanyPreviewCardProps {
  company: CompanySearchResult
  onClear: () => void
  isVerifying?: boolean
}

export const CompanyPreviewCard: React.FC<CompanyPreviewCardProps> = ({
  company,
  onClear,
  isVerifying = false,
}) => {
  const [justVerified, setJustVerified] = useState(false)
  const wasVerifying = useRef(false)

  // Show subtle feedback when verification completes
  useEffect(() => {
    if (!isVerifying && wasVerifying.current) {
      setJustVerified(true)
      setTimeout(() => setJustVerified(false), 2000)
    }
    wasVerifying.current = isVerifying
  }, [isVerifying])

  return (
    <div className="mt-3 p-4 bg-gradient-to-br from-primary-50 to-canvas border border-primary-200 rounded-xl shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Header with verified badge */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className={`flex-shrink-0 w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center transition-all ${
              justVerified ? 'scale-110' : ''
            }`}
          >
            {isVerifying ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-primary-700 uppercase tracking-wider">
              {isVerifying ? 'Verifying...' : 'Verified Company'}
            </p>
            <p className="text-sm font-medium text-gray-600">KBO/BCE Belgium</p>
          </div>
        </div>

        {/* Change Company button */}
        <button
          type="button"
          onClick={onClear}
          className="px-3 py-1.5 text-sm text-primary-600 hover:text-primary-700 hover:bg-primary-100 rounded-lg transition-colors"
          aria-label="Change company"
        >
          Change Company
        </button>
      </div>

      {/* Company details */}
      <div className="space-y-2">
        <div>
          <h4 className="text-lg font-semibold text-gray-900 mb-1">{company.company_name}</h4>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {company.registration_number && (
              <span className="inline-flex items-center gap-1.5 text-gray-700">
                <svg
                  className="w-4 h-4 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
                  />
                </svg>
                <span className="font-mono font-medium">{company.registration_number}</span>
              </span>
            )}
            {company.legal_form && (
              <>
                <span className="text-gray-300">•</span>
                <span className="text-gray-600">{company.legal_form}</span>
              </>
            )}
            {company.status && (
              <>
                <span className="text-gray-300">•</span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    company.status.toLowerCase() === 'active'
                      ? 'bg-primary-100 text-primary-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {company.status}
                </span>
              </>
            )}
          </div>
        </div>

        {company.address && (
          <div className="pt-2 border-t border-primary-200/50">
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <svg
                className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <span className="leading-relaxed">{company.address}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default CompanyPreviewCard
