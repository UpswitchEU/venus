'use client'

import { useMemo } from 'react'
import { parseSpotlightDomId, useSpotlightStore } from '../../store/useSpotlightStore'

export interface SpotlightNormHint {
  title: string
  rationale: string
  confidence: number
}

export interface SpotlightResolutionContext {
  rows: Array<{ account_code: string; description: string }>
  aiNote: { confidence: number; text: string } | null
  normHints: SpotlightNormHint[]
}

export function useSpotlightResolutionContext(opts: {
  domId: string
  fieldName: string
  isInQueue: boolean
  locale: string
}): {
  yearKeyForData: string | null
  resolutionContext: SpotlightResolutionContext | null
} {
  const { domId, fieldName, isInQueue, locale } = opts
  const importQuality = useSpotlightStore(s => s.importQuality)
  const getFlagsForDomId = useSpotlightStore(s => s.getFlagsForDomId)

  const yearKeyForData = useMemo(() => {
    const parsed = parseSpotlightDomId(domId).yearKey
    if (parsed) return parsed
    if (!importQuality) return null
    for (const [k, v] of Object.entries(importQuality)) {
      if (v.audit_flags?.some(f => f.field === fieldName)) return k
    }
    const ys = Object.keys(importQuality).sort((a, b) => Number(b) - Number(a))
    return ys[0] ?? null
  }, [domId, importQuality, fieldName])

  const resolutionContext = useMemo((): SpotlightResolutionContext | null => {
    if (!isInQueue || !importQuality || !yearKeyForData) return null
    const yq = importQuality[yearKeyForData]
    if (!yq) return null

    const queueFlags = getFlagsForDomId(domId).filter(f => f.severity !== 'info')
    const codeSet = new Set<string>()
    for (const f of queueFlags) {
      for (const c of f.source_accounts ?? []) codeSet.add(String(c))
    }
    for (const m of yq.ai_enrichment?.ledger_mappings ?? []) {
      if (m.upswitch_field === fieldName) codeSet.add(m.ledger_code)
    }

    let rows = (yq.unmapped_ledger_lines ?? []).filter(l => codeSet.has(l.account_code))
    if (rows.length === 0 && (yq.unmapped_ledger_lines?.length ?? 0) > 0) {
      rows = (yq.unmapped_ledger_lines ?? []).slice(0, 5)
    }

    const aiRows = (yq.ai_enrichment?.ledger_mappings ?? []).filter(
      m => m.upswitch_field === fieldName,
    )
    const aiNote =
      aiRows.length > 0
        ? {
            confidence: aiRows[0].confidence,
            text: locale === 'nl' ? aiRows[0].rationale_nl : aiRows[0].rationale_en,
          }
        : null

    const normHints: SpotlightNormHint[] = (yq.ai_enrichment?.normalization_hints ?? [])
      .slice(0, 2)
      .map(h => ({
        title: locale === 'nl' ? h.title_nl : h.title_en,
        rationale: locale === 'nl' ? h.rationale_nl : h.rationale_en,
        confidence: h.confidence,
      }))

    return { rows: rows.slice(0, 6), aiNote, normHints }
  }, [isInQueue, importQuality, yearKeyForData, domId, fieldName, locale, getFlagsForDomId])

  return { yearKeyForData, resolutionContext }
}
