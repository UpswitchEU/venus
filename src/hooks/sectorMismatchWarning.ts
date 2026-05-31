import { normalizeBusinessTypeId } from '@/utils/businessTypeIdAliases'
import type { SectorMismatchWarning } from './useSectorMismatchWarning'

export function buildSectorMismatchWarning(args: {
  naceResolvedId: string
  naceResolvedName?: string
  businessTypeId: string
  selectedTitle?: string
  industry?: string
}): SectorMismatchWarning {
  if (
    normalizeBusinessTypeId(args.naceResolvedId) === normalizeBusinessTypeId(args.businessTypeId)
  ) {
    return null
  }

  return {
    naceTypeTitle: args.naceResolvedName?.trim() || args.naceResolvedId,
    selectedTitle: args.selectedTitle?.trim() || args.industry?.trim() || args.businessTypeId,
  }
}
