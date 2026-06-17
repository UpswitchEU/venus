import type { LucideIcon } from 'lucide-react'

export interface KBOBusinessTypeCandidate {
  id: string
  title?: string
  naceCode?: string | null
}

export interface KBOCompany {
  id: string
  name: string
  kboNumber: string
  legalForm: string
  address: string
  postalCode: string
  city: string
  startDate?: string
  /**
   * Registry-supplied incorporation year (parsed from ``startDate`` or
   * supplied directly by the underlying registry response).  Used by
   * the startup studio to pre-fill the funding-stage default — see
   * ``inferStartupStageFromFoundingYear`` and the
   * ``seedStageFromFoundingYearIfDefault`` action.
   */
  foundingYear?: number
  naceCode?: string
  naceDescription?: string
  activityCode?: string
  activityLabel?: string
  activityTaxonomy?: string
  canonicalNaceCode?: string
  countryCode?: string
  /** Website URL for screenshot feature */
  website?: string
  /** Business type ID from sector DB — present when Titan resolved NACE/SBI → business type. */
  businessTypeId?: string
  /** Human-readable sector title from sector DB (e.g. "Logistics"). */
  businessTypeTitle?: string
  /** Ordered server-resolved business type IDs when multiple KBO/NACE activities were matched. */
  businessTypeIds?: string[]
  /** Server-resolved business type candidates with optional NACE provenance. */
  businessTypeCandidates?: KBOBusinessTypeCandidate[]
  /** Additional registry activity codes beyond the primary canonical/display code. */
  naceCodes?: string[]
}

export interface BusinessType {
  id: string
  code: string
  name: string
  category: string
  icon: LucideIcon
  emoji?: string
  description?: string
  /** When true, shown first when dropdown opens with empty search (Mercury/Clarity parity) */
  popular?: boolean
}
