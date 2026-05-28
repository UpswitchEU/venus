'use client'

import { useEffect, useState } from 'react'
import { fetchBusinessTypeById } from '@/services/fetchBusinessTypeById'
import { naceBusinessTypeService } from '@/services/naceBusinessTypeService'
import type { ValuationFormData } from '@/types/valuation'
import { buildSectorMismatchWarning } from './sectorMismatchWarning'

export type SectorMismatchWarning = {
  naceTypeTitle: string
  selectedTitle: string
} | null

type SectorMismatchFormSlice = Pick<
  ValuationFormData,
  | 'business_type_id'
  | 'nace_code'
  | 'activity_code'
  | 'canonical_nace_code'
  | 'country_code'
  | 'industry'
>

/**
 * Warn when KBO/NACE-implied business type differs from the advisor's selection.
 * Used on the form (Basic Information) and on the report panel before external share.
 */
export function useSectorMismatchWarning(formData: SectorMismatchFormSlice): SectorMismatchWarning {
  const [warning, setWarning] = useState<SectorMismatchWarning>(null)

  useEffect(() => {
    let cancelled = false
    const nace =
      formData.nace_code?.trim() ||
      formData.activity_code?.trim() ||
      formData.canonical_nace_code?.trim()
    const businessTypeId = formData.business_type_id

    if (!nace || !businessTypeId) {
      setWarning(null)
      return
    }

    void (async () => {
      const resolved = await naceBusinessTypeService.getBusinessTypeForNaceCode(
        nace,
        undefined,
        formData.country_code || 'BE'
      )
      if (cancelled) return

      if (!resolved?.id || resolved.id === businessTypeId) {
        setWarning(null)
        return
      }

      const selected = await fetchBusinessTypeById(businessTypeId)
      if (cancelled) return

      setWarning(
        buildSectorMismatchWarning({
          naceResolvedId: resolved.id,
          naceResolvedName: resolved.name,
          businessTypeId,
          selectedTitle: selected?.title,
          industry: formData.industry,
        })
      )
    })()

    return () => {
      cancelled = true
    }
  }, [
    formData.activity_code,
    formData.business_type_id,
    formData.canonical_nace_code,
    formData.country_code,
    formData.industry,
    formData.nace_code,
  ])

  return warning
}
