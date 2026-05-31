import type { QualityWarning } from '@/components/calculator'
import {
  getQualityWarningInlineFix,
  isActionableQualityWarningType,
  QUALITY_WARNING_ASSISTANT_CTA_CONFIG,
} from '@/constants/methodFieldConfig'
import { getDataQualityWarningsFromResult } from '@/utils/dataQualityWarnings'

export type ManualQualityWarningTranslator = (key: string, fallback: string) => string

export interface BuildManualQualityWarningsParams {
  result: unknown
  acknowledgedTypes: ReadonlySet<string>
  translateCta: ManualQualityWarningTranslator
}

export function buildManualQualityWarnings({
  result,
  acknowledgedTypes,
  translateCta,
}: BuildManualQualityWarningsParams): QualityWarning[] {
  const rawWarnings = getDataQualityWarningsFromResult(result)
  if (rawWarnings.length === 0) return []

  return rawWarnings
    .filter((warning) => String(warning.severity ?? '').toLowerCase() === 'high')
    .filter((warning) => !!warning.type && !acknowledgedTypes.has(warning.type))
    .map((warning) => {
      const type = warning.type ?? ''
      const cta = isActionableQualityWarningType(type)
        ? QUALITY_WARNING_ASSISTANT_CTA_CONFIG[type]
        : undefined
      // Fall back gracefully when a new engine warning type ships before
      // the catalog is updated: show the warning, no guided CTA copy.
      const labelDefault = 'Open in chat'
      const promptDefault =
        (warning.message ?? '') + (warning.recommendation ? ` ${warning.recommendation}` : '')

      // Title + body are also overridable via i18n. The engine voice tends to
      // lead with the failure ("could not be executed") which reads like the
      // valuation broke when it actually succeeded with a substitute method.
      // When no override is configured, pass the engine fields through
      // verbatim (including `undefined`) so downstream renderers can tell
      // "engine said nothing" apart from "engine said empty string".
      const engineMessage = warning.message
      const engineRecommendation = warning.recommendation
      const title = cta ? translateCta(cta.titleKey, (engineMessage ?? '').trim()) : engineMessage
      const recommendation = cta
        ? translateCta(cta.bodyKey, (engineRecommendation ?? '').trim())
        : engineRecommendation

      // Inline fix: a small set of known financial fields the user fills right
      // in the chip (no chat turn). Labels/hints are localized here so the
      // renderer stays presentational.
      const inlineFixFields = getQualityWarningInlineFix(type)
      const inlineFix = inlineFixFields
        ? {
            fields: inlineFixFields.map((field) => ({
              key: field.key,
              label: translateCta(field.labelKey, field.key),
              hint: field.hintKey ? translateCta(field.hintKey, '') || undefined : undefined,
            })),
          }
        : undefined

      return {
        type,
        severity: warning.severity ?? 'high',
        message: title,
        recommendation,
        step_number: warning.step_number,
        cta_label: cta ? translateCta(cta.labelKey, labelDefault) : labelDefault,
        cta_prompt: cta ? translateCta(cta.promptKey, promptDefault) : promptDefault,
        inlineFix,
      }
    })
}
