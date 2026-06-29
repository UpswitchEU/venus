import type { NormalizationItem, NormalizationStatus } from './UnifiedNormalizationTypes'
import { requiresIndividualImportedNormalizationReview } from './UnifiedNormalizationTypes'

export function updateNormalizationStatus({
  items,
  id,
  status,
  acceptedAt,
}: {
  items: NormalizationItem[]
  id: string
  status: NormalizationStatus
  acceptedAt: string
}): NormalizationItem[] {
  const reviewedAt = status === 'accepted' ? acceptedAt : undefined

  return items.map((item) =>
    item.id === id
      ? {
          ...item,
          status,
          ...(requiresIndividualImportedNormalizationReview(item)
            ? reviewedAt
              ? { reviewedAt }
              : { reviewedAt: undefined }
            : {}),
        }
      : item
  )
}

export function bulkUpdateNormalizationStatus({
  items,
  selectedIds,
  status,
  acceptedAt,
}: {
  items: NormalizationItem[]
  selectedIds: ReadonlySet<string>
  status: NormalizationStatus
  acceptedAt: string
}): NormalizationItem[] {
  const reviewedAt = status === 'accepted' ? acceptedAt : undefined

  return items.map((item) => {
    if (!selectedIds.has(item.id)) return item

    const requiresIndividualReview = requiresIndividualImportedNormalizationReview(item)

    return {
      ...item,
      status,
      ...(requiresIndividualReview
        ? reviewedAt
          ? { reviewedAt }
          : { reviewedAt: undefined }
        : {}),
    }
  })
}

export function removeSelectedNormalizations({
  items,
  selectedIds,
}: {
  items: NormalizationItem[]
  selectedIds: ReadonlySet<string>
}): NormalizationItem[] {
  return items.filter((item) => !selectedIds.has(item.id))
}
