import { normalizeLegalForm } from '@upswitch/types/entity-country'

/** Legal forms are jurisdiction-specific. Unrecognised registry text stays in legal_form. */
export function mapLegalFormToBusinessStructure(
  legalForm: string | undefined,
  countryCode?: string | null
): string {
  return normalizeLegalForm(countryCode, legalForm) ?? ''
}
