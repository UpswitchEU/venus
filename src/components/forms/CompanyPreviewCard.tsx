/**
 * Company Preview Card Component
 *
 * Displays selected company details with verification status
 * and allows user to change company selection
 */

import { useTranslations } from 'next-intl'
import React, { useEffect, useRef } from 'react'
import { useTransientFlag } from '@/hooks/useTransientFlag'
import type { CompanySearchResult } from '../../services/registry/types'
import {
  formatLegalFormLabel,
  formatRegistryCompanyLocation,
  formatRegistryNumber,
  getRegistryActivityDescription,
} from '../../utils/registryCompanyDisplay'

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
  const t = useTranslations()
  const [justVerified, showJustVerified] = useTransientFlag(2000)
  const wasVerifying = useRef(false)

  const { label: legalFormLabel, title: legalFormTitle } = formatLegalFormLabel(company.legal_form)
  const registration = company.registration_number
    ? formatRegistryNumber(company.registration_number, company.country_code ?? 'BE')
    : ''
  const location = formatRegistryCompanyLocation({
    address: company.address,
    postalCode: company.postal_code,
    city: company.city,
  })
  const activityDescription = getRegistryActivityDescription({
    activityLabel: company.activity_label,
    naceDescription: company.nace_description,
  })
  const metaParts = [legalFormLabel, registration].filter(Boolean)

  // Show subtle feedback when verification completes
  useEffect(() => {
    if (!isVerifying && wasVerifying.current) {
      showJustVerified()
    }
    wasVerifying.current = isVerifying
  }, [isVerifying, showJustVerified])

  return (
    <div className="mt-3 p-4 bg-gradient-to-br from-primary/10 to-background border border-primary/30 rounded-xl shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Header with verified badge */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className={`flex-shrink-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center transition-all ${
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
            <p className="text-xs font-semibold text-primary uppercase tracking-wider">
              {isVerifying ? t('forms.kboLookup.verifying') : t('forms.kboLookup.verifiedCompany')}
            </p>
            <p className="text-sm font-medium text-muted-foreground">
              {t('forms.kboLookup.kboBelgium')}
            </p>
          </div>
        </div>

        {/* Change Company button */}
        <button
          type="button"
          onClick={onClear}
          className="px-3 py-1.5 text-sm text-primary hover:text-primary/90 hover:bg-primary/10 rounded-lg transition-colors"
          aria-label={t('forms.kboLookup.changeCompany')}
        >
          {t('forms.kboLookup.changeCompany')}
        </button>
      </div>

      {/* Company details */}
      <div className="space-y-1">
        <h4 className="text-lg font-semibold leading-snug text-foreground">
          {company.company_name}
        </h4>
        {metaParts.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {legalFormLabel && <span title={legalFormTitle}>{legalFormLabel}</span>}
            {legalFormLabel && registration && <span aria-hidden="true"> · </span>}
            {registration && <span className="font-mono">{registration}</span>}
          </p>
        )}
        {company.status && (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              company.status.toLowerCase() === 'active'
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {company.status.toLowerCase() === 'active'
              ? t('forms.kboLookup.active')
              : company.status}
          </span>
        )}
        {location && (
          <div className="pt-2 border-t border-primary/20">
            <p className="text-sm leading-relaxed text-muted-foreground">{location}</p>
          </div>
        )}
        {activityDescription && (
          <p className="text-xs leading-relaxed text-muted-foreground pt-1">
            {activityDescription}
          </p>
        )}
      </div>
    </div>
  )
}

export default CompanyPreviewCard
