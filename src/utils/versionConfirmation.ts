import type { ValuationVersion } from '../types/ValuationVersion'

export function hasExistingValuationVersion(
  currentVersion: Pick<ValuationVersion, 'versionNumber'> | null | undefined
): boolean {
  return currentVersion != null && (currentVersion.versionNumber ?? 0) >= 1
}

export function shouldOpenVersionConfirmation(options: {
  currentVersion: Pick<ValuationVersion, 'versionNumber'> | null | undefined
  hasFormChanges: boolean
  hasAnyNormalization: boolean
  isConfirmationOpen: boolean
}): boolean {
  if (options.isConfirmationOpen) {
    return false
  }

  return (
    hasExistingValuationVersion(options.currentVersion) &&
    (options.hasFormChanges || options.hasAnyNormalization)
  )
}
