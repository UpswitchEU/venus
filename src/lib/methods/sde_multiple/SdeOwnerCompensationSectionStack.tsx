'use client'

import { motion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { SdeOwnerCompensationSection } from '@/components/calculator/sections/SdeOwnerCompensationSection'
import { useNormalizationStore } from '@/store/useNormalizationStore'
import type { ManualValuationFormData, YearlyFinancials } from '@/types/valuation'
import type { MethodKey } from '../types'
import { sdeManualInputAdapter } from './manualInputAdapter'
import { useSdeOwnerCompensationPrefill } from './useSdeOwnerCompensationPrefill'

export interface SdeOwnerCompensationSectionStackProps {
  step: number
  methods: readonly string[]
  formData: ManualValuationFormData
  latestCompleteYearlyFinancial?: YearlyFinancials
  onFieldChange: (field: string, value: number | undefined) => void
  onAnyFieldChange?: (field: string, value: unknown) => void
  disabled?: boolean
}

export function SdeOwnerCompensationSectionStack({
  step,
  methods,
  formData,
  latestCompleteYearlyFinancial,
  onFieldChange,
  onAnyFieldChange,
  disabled,
}: SdeOwnerCompensationSectionStackProps) {
  const normalizationItems = useNormalizationStore((s) => s.items)
  const sdeSectionActive = sdeManualInputAdapter.deriveOwnerCompensationSectionActive(
    methods as readonly MethodKey[]
  )
  const {
    prefill: salaryPrefill,
    doubleCountRisk,
    getAppliedPrefill,
  } = useSdeOwnerCompensationPrefill({
    sdeSectionActive,
    normalizationItems,
    ownerSalaryAddback: formData.owner_salary_addback as number | null | undefined,
    onAnyFieldChange,
  })

  const appliedSalaryPrefill = getAppliedPrefill()
  const salaryPrefillStillApplied =
    appliedSalaryPrefill != null &&
    Number(formData.owner_salary_addback) === appliedSalaryPrefill.value

  return (
    <>
      {doubleCountRisk && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mx-1 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Owner compensation is set as both an SDE add-back and an EBITDA normalization. This
              may double-count the adjustment. Consider removing one.
            </span>
          </div>
        </motion.div>
      )}
      <SdeOwnerCompensationSection
        step={step}
        ownerSalaryAddback={formData.owner_salary_addback as number | undefined}
        revenue={
          latestCompleteYearlyFinancial ? Number(latestCompleteYearlyFinancial.revenue) : undefined
        }
        ebitda={
          latestCompleteYearlyFinancial ? Number(latestCompleteYearlyFinancial.ebitda) : undefined
        }
        onFieldChange={onFieldChange}
        ownerRole={
          (formData as ManualValuationFormData & { owner_role?: 'working' | 'passive' }).owner_role
        }
        onOwnerRoleChange={
          onAnyFieldChange ? (role) => onAnyFieldChange('owner_role', role) : undefined
        }
        activeOwnersCount={
          (formData as ManualValuationFormData & { number_of_owners?: number }).number_of_owners
        }
        onActiveOwnersCountChange={
          onAnyFieldChange ? (count) => onAnyFieldChange('number_of_owners', count) : undefined
        }
        salaryPrefillSource={salaryPrefillStillApplied ? salaryPrefill.source : null}
        salaryPrefillYear={salaryPrefillStillApplied ? salaryPrefill.sourceYear : null}
        disabled={disabled}
      />
    </>
  )
}
