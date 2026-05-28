import type { SectorMismatchWarning } from './useSectorMismatchWarning'

export function buildSectorMismatchWarning(args: {
  naceResolvedId: string
  naceResolvedName?: string
  businessTypeId: string
  selectedTitle?: string
  industry?: string
}): SectorMismatchWarning {
  if (args.naceResolvedId === args.businessTypeId) return null

  return {
    naceTypeTitle: args.naceResolvedName?.trim() || args.naceResolvedId,
    selectedTitle: args.selectedTitle?.trim() || args.industry?.trim() || args.businessTypeId,
  }
}
