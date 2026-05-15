'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import type { KBOCompany } from '@/design-system'
import { AuroraInput } from '@/design-system/components/Input'
import type { ManualValuationFormData } from '../../../types/valuation'
import { type FieldHelpContext, FieldHelpTrigger } from '../FieldHelpTrigger'
import { SECTION_HEADER_ROW_CLASS, SectionStatusCircle } from './index'

interface OwnershipStructureSectionProps {
  formData: ManualValuationFormData
  selectedCompany: KBOCompany | null
  hasBusinessType: boolean
  fieldValidation: {
    errors: Record<string, string | undefined>
    warnings: Record<string, string | undefined>
  }
  updateField: <K extends keyof ManualValuationFormData>(
    field: K,
    value: ManualValuationFormData[K]
  ) => void
  onFieldHelpRequest?: (context: FieldHelpContext) => void
}

export function OwnershipStructureSection({
  formData,
  selectedCompany,
  hasBusinessType,
  fieldValidation,
  updateField,
  onFieldHelpRequest,
}: OwnershipStructureSectionProps) {
  const mi = useTranslations('manualInput')
  if (!selectedCompany || !hasBusinessType) return null

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 pt-2"
    >
      <div className={SECTION_HEADER_ROW_CLASS}>
        <SectionStatusCircle
          step={2}
          complete={
            formData.ownerManagers > 0 &&
            formData.fteEmployees !== undefined &&
            formData.fteEmployees >= 0
          }
          className="flex"
        />
        <h3 className="text-sm font-medium text-foreground">{mi('sections.ownershipStructure')}</h3>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="relative">
          <AuroraInput
            label={mi('fields.ownerManagers')}
            type="number"
            min={1}
            max={10}
            value={formData.ownerManagers || ''}
            onChange={(e) => updateField('ownerManagers', Number(e.target.value))}
            size="sm"
            placeholder="1"
            truncateLabel={false}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
            <FieldHelpTrigger
              context={{
                field: 'ownerManagers',
                label: mi('fields.ownerManagers'),
                value: formData.ownerManagers,
                hint: mi('ownerManagersHint'),
              }}
              onTrigger={onFieldHelpRequest}
            />
          </div>
        </div>
        <div className="relative">
          <AuroraInput
            label={mi('fields.totalFte')}
            type="number"
            min={0}
            value={
              formData.fteEmployees !== undefined && formData.fteEmployees !== null
                ? String(formData.fteEmployees)
                : ''
            }
            onChange={(e) => {
              const raw = e.target.value
              const value =
                raw === ''
                  ? undefined
                  : (() => {
                      const n = Number(raw)
                      return !isNaN(n) && n >= 0 ? n : undefined
                    })()
              updateField('fteEmployees', value)
            }}
            size="sm"
            placeholder="0"
            truncateLabel={false}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
            <FieldHelpTrigger
              context={{
                field: 'fteEmployees',
                label: mi('fields.totalFte'),
                value: formData.fteEmployees,
                hint: mi('totalFteHint'),
              }}
              onTrigger={onFieldHelpRequest}
            />
          </div>
          {(fieldValidation.errors.fteEmployees || fieldValidation.warnings.fteEmployees) && (
            <p
              className={`text-[10px] mt-0.5 ${fieldValidation.errors.fteEmployees ? 'text-destructive' : 'text-warning'}`}
            >
              {fieldValidation.errors.fteEmployees || fieldValidation.warnings.fteEmployees}
            </p>
          )}
        </div>
      </div>
      <p className="text-[11px] text-foreground/40">{mi('ownershipHint')}</p>
    </motion.section>
  )
}
