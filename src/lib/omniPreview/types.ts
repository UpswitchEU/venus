/**
 * Shared types for the omni preview layer.
 */

export type MethodPreviewAuditEntry = {
  bonusSections: readonly string[]
  clientPreview: string
}

export type MethodPreviewAuditRegistry = Record<string, MethodPreviewAuditEntry>
