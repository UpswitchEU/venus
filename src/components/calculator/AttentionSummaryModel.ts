import type { QualityWarning, StartupAssistantIssue } from './ChatAssistantTypes'

export type AttentionSeverity = 'block' | 'warn' | 'info'

export interface AttentionItem {
  key: string
  source: 'startup' | 'quality'
  sourceId: string
  severity: AttentionSeverity
  title: string
  body?: string
  ctaLabel?: string
  ctaPrompt?: string
  quickFixLabel?: string
  jumpLabel?: string
  inlineFix?: QualityWarning['inlineFix']
  jumpAnchor?: string
}

export const ATTENTION_SEVERITY_RANK: Record<AttentionSeverity, number> = {
  block: 0,
  warn: 1,
  info: 2,
}

export function normalizeAttentionSeverity(raw: string | undefined): AttentionSeverity {
  const value = String(raw ?? '').toLowerCase()
  if (value === 'high' || value === 'block' || value === 'critical') return 'block'
  if (value === 'medium' || value === 'warn' || value === 'warning') return 'warn'
  return 'info'
}

export function buildAttentionItems({
  startupIssues,
  qualityWarnings,
}: {
  startupIssues: StartupAssistantIssue[]
  qualityWarnings: QualityWarning[]
}): AttentionItem[] {
  const all: AttentionItem[] = []
  for (const startupIssue of startupIssues) {
    const title = (startupIssue.title ?? '').trim()
    if (!title) continue
    all.push({
      key: `startup:${startupIssue.id}`,
      source: 'startup',
      sourceId: startupIssue.id,
      severity: normalizeAttentionSeverity(startupIssue.severity),
      title,
      body: startupIssue.body,
      ctaLabel: startupIssue.ctaLabel,
      ctaPrompt: startupIssue.ctaPrompt,
      quickFixLabel: startupIssue.quickFixLabel,
      jumpLabel: startupIssue.jumpLabel,
    })
  }

  for (const qualityWarning of qualityWarnings) {
    const title = (qualityWarning.message ?? '').trim()
    if (!title) continue
    all.push({
      key: `quality:${qualityWarning.type}`,
      source: 'quality',
      sourceId: qualityWarning.type,
      severity: normalizeAttentionSeverity(String(qualityWarning.severity ?? 'high')),
      title,
      body: qualityWarning.recommendation,
      ctaLabel: qualityWarning.cta_label,
      ctaPrompt: qualityWarning.cta_prompt,
      inlineFix: qualityWarning.inlineFix,
      jumpAnchor: qualityWarning.jump?.anchor,
    })
  }

  return all.sort(
    (a, b) => ATTENTION_SEVERITY_RANK[a.severity] - ATTENTION_SEVERITY_RANK[b.severity]
  )
}
