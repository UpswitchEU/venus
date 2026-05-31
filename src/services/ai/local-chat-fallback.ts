import type { AIChatRequest, AIChatResponse } from './AIChatService'

export type AssistantIntent =
  | 'explain_ebitda'
  | 'explain_value'
  | 'suggest_normalizations'
  | 'general'

type NormalizationLike = {
  status?: string
  ledgerCode?: string
  ledgerName?: string
  adjustment?: number
  reason?: string
  year?: number
  source?: string
  id?: string
}

type NormalizationSummary = {
  total?: number
  accepted?: number
  pending?: number
  totalAdjustment?: number
}

type ValuationSummary = {
  valuation?: unknown
  valuationLow?: unknown
  valuationHigh?: unknown
  recommendedAskingPrice?: unknown
  normalizedEbitda?: unknown
  reportedEbitda?: unknown
  multiple?: unknown
}

const EXPLAIN_EBITDA_RE =
  /verklaar.*ebitda|explain.*ebitda|ebitda.*uitleg|uitleg.*ebitda|leg.*ebitda.*uit|verdedigbaarheid|defensibility/i
const EXPLAIN_VALUE_RE = /leg.*waarde.*uit|explain.*value|wat.*waard|what.*worth|waarde.*uitleg/i
const SUGGEST_NORMS_RE = /normalis|stel.*voor|which norm/i

export function detectAssistantIntent(message: string): AssistantIntent {
  const m = message.trim()
  if (EXPLAIN_EBITDA_RE.test(m)) return 'explain_ebitda'
  if (EXPLAIN_VALUE_RE.test(m)) return 'explain_value'
  if (SUGGEST_NORMS_RE.test(m)) return 'suggest_normalizations'
  return 'general'
}

export function resolveAssistantIntent(
  message: string,
  explicit?: AssistantIntent
): AssistantIntent {
  const detected = detectAssistantIntent(message)
  if (explicit && explicit !== 'general') {
    // Chip intent only applies while the draft still matches that intent.
    if (detected === explicit || detected === 'general') return explicit
  }
  return detected
}

function readSummary(formData: unknown): NormalizationSummary | undefined {
  if (!formData || typeof formData !== 'object') return undefined
  const summary = (formData as Record<string, unknown>)._normalizationSummary
  if (!summary || typeof summary !== 'object') return undefined
  return summary as NormalizationSummary
}

function readValuationSummary(formData: unknown): ValuationSummary | undefined {
  if (!formData || typeof formData !== 'object') return undefined
  const summary = (formData as Record<string, unknown>)._valuationSummary
  if (!summary || typeof summary !== 'object') return undefined
  return summary as ValuationSummary
}

function readNumber(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function readNormalizations(request: AIChatRequest): NormalizationLike[] {
  if (!Array.isArray(request.normalizations)) return []
  return request.normalizations as NormalizationLike[]
}

function formatMoney(locale: 'en' | 'nl', amount: number): string {
  const loc = locale === 'en' ? 'en-BE' : 'nl-BE'
  return `€${Math.round(amount).toLocaleString(loc)}`
}

function offlineBanner(locale: 'en' | 'nl'): string {
  return locale === 'en'
    ? '> **AI temporarily unavailable** — limited answer from your dossier data.\n\n'
    : '> **AI tijdelijk niet beschikbaar** — beperkt antwoord op basis van uw dossiergegevens.\n\n'
}

/** Detect dossier-aware offline answers when the wire omits `fallback: true`. */
export function isOfflineFallbackContent(content: string): boolean {
  return /AI tijdelijk niet beschikbaar|AI temporarily unavailable/i.test(content)
}

function buildExplainEbitdaFallback(request: AIChatRequest, locale: 'en' | 'nl'): AIChatResponse {
  const norms = readNormalizations(request)
  const accepted = norms.filter((n) => n.status === 'accepted')
  const summary = readSummary(request.formData)
  const companyName = request.companyName || (locale === 'en' ? 'this company' : 'dit bedrijf')
  const yearMatch = request.message.match(/\b(20\d{2})\b/)
  const focusYear =
    yearMatch?.[1] ??
    (request.fieldContext?.field === 'ebitda'
      ? request.fieldContext.label?.match(/\b(20\d{2})\b/)?.[1]
      : undefined)

  const acceptedLines = accepted.slice(0, 8).map((n) => {
    const code = n.ledgerCode ? `${n.ledgerCode} ` : ''
    const name = n.ledgerName || ''
    const amt = typeof n.adjustment === 'number' ? formatMoney(locale, n.adjustment) : '—'
    const yr = n.year ? ` (${n.year})` : ''
    return `- **${code}${name}**${yr}: +${amt}`
  })

  const totalAdj =
    typeof summary?.totalAdjustment === 'number'
      ? summary.totalAdjustment
      : accepted.reduce((s, n) => s + (Number(n.adjustment) || 0), 0)

  const intro =
    locale === 'en'
      ? `**Reported vs normalized EBITDA for ${companyName}**${focusYear ? ` (${focusYear})` : ''}:`
      : `**Gerapporteerde vs genormaliseerde EBITDA voor ${companyName}**${focusYear ? ` (${focusYear})` : ''}:`

  const capNote = /verdedigbaarheid|defensibility/i.test(request.message)
    ? locale === 'en'
      ? '\n\n**Defensibility limit (>50% of reported EBITDA):** Large auto-applied ledger addbacks trigger “Review required”. That is a guardrail, not a rejection — substantiate in the dossier or adjust the normalization before sharing externally.'
      : '\n\n**Verdedigbaarheidslimiet (>50% van gerapporteerde EBITDA):** Grote automatisch toegepaste grootboek-correcties geven “Review vereist”. Dat is een waakhond, geen afwijzing — onderbouw in het dossier of pas de normalisatie aan vóór extern delen.'
    : ''

  const appliedBlock =
    accepted.length > 0
      ? locale === 'en'
        ? `\n\n**Already applied addbacks (${accepted.length}):**\n${acceptedLines.join('\n')}\n\nCumulative accepted adjustment: **+${formatMoney(locale, totalAdj)}**.\n\nThese feed ValuationIQ as normalized EBITDA — they are not new suggestions. If the defensibility banner shows >50% of reported EBITDA, substantiate or correct before external sharing.${capNote}`
        : `\n\n**Reeds toegepaste addbacks (${accepted.length}):**\n${acceptedLines.join('\n')}\n\nCumulatief geaccepteerd: **+${formatMoney(locale, totalAdj)}**.\n\nDit zit al in de genormaliseerde EBITDA — dit zijn geen nieuwe voorstellen. Overschrijdt de verdedigbaarheidslimiet (>50% van gerapporteerde EBITDA) de banner, onderbouw of corrigeer vóór externe deling.${capNote}`
      : locale === 'en'
        ? '\n\nNo accepted normalizations yet — reported EBITDA equals normalized EBITDA until you accept addbacks.'
        : '\n\nNog geen geaccepteerde normalisaties — gerapporteerde EBITDA = genormaliseerde EBITDA tot u addbacks accepteert.'

  return {
    success: true,
    content: offlineBanner(locale) + intro + appliedBlock,
    fallback: true,
  }
}

function buildExplainValueFallback(request: AIChatRequest, locale: 'en' | 'nl'): AIChatResponse {
  const companyName = request.companyName || (locale === 'en' ? 'this company' : 'dit bedrijf')
  const summary = readSummary(request.formData)
  const valuationSummary = readValuationSummary(request.formData)
  const valuation = readNumber(valuationSummary?.valuation)
  const valuationLow = readNumber(valuationSummary?.valuationLow)
  const valuationHigh = readNumber(valuationSummary?.valuationHigh)
  const recommendedAskingPrice = readNumber(valuationSummary?.recommendedAskingPrice)
  const normalizedEbitda = readNumber(valuationSummary?.normalizedEbitda)
  const multiple = readNumber(valuationSummary?.multiple)
  const accepted = summary?.accepted ?? 0
  const pending = summary?.pending ?? 0

  if (valuation != null || valuationLow != null || valuationHigh != null) {
    const range =
      valuationLow != null && valuationHigh != null
        ? locale === 'en'
          ? ` (range ${formatMoney(locale, valuationLow)}-${formatMoney(locale, valuationHigh)})`
          : ` (range ${formatMoney(locale, valuationLow)}-${formatMoney(locale, valuationHigh)})`
        : ''
    const ask =
      recommendedAskingPrice != null
        ? locale === 'en'
          ? `\nRecommended asking price: **${formatMoney(locale, recommendedAskingPrice)}**.`
          : `\nAanbevolen vraagprijs: **${formatMoney(locale, recommendedAskingPrice)}**.`
        : ''
    const drivers = [
      normalizedEbitda != null
        ? locale === 'en'
          ? `normalized EBITDA ${formatMoney(locale, normalizedEbitda)}`
          : `genormaliseerde EBITDA ${formatMoney(locale, normalizedEbitda)}`
        : null,
      multiple != null ? `${multiple.toFixed(1)}x multiple` : null,
    ].filter(Boolean)
    const driverLine =
      drivers.length > 0
        ? locale === 'en'
          ? `\nKey driver(s): ${drivers.join(', ')}.`
          : `\nBelangrijkste driver(s): ${drivers.join(', ')}.`
        : ''

    return {
      success: true,
      content:
        offlineBanner(locale) +
        (locale === 'en'
          ? `For **${companyName}**, the open report shows an indicative value of **${valuation != null ? formatMoney(locale, valuation) : 'n/a'}**${range}.${ask}${driverLine}\n\nThis is a limited offline summary from the report data already loaded in Venus. Ask again when AI is back for the full method and benchmark walkthrough.`
          : `Voor **${companyName}** toont het geopende rapport een indicatieve waarde van **${valuation != null ? formatMoney(locale, valuation) : 'n.v.t.'}**${range}.${ask}${driverLine}\n\nDit is een beperkte offline samenvatting op basis van de rapportdata die al in Venus geladen is. Stel de vraag opnieuw wanneer AI terug beschikbaar is voor de volledige methode- en benchmarkuitleg.`),
      fallback: true,
    }
  }

  const body =
    locale === 'en'
      ? `For **${companyName}**, indicative value comes from ValuationIQ (multiples, DCF where defendable, synthesis). **${accepted}** normalization(s) accepted${pending > 0 ? `, **${pending}** pending review` : ''}.\n\nOpen the report for the valuation range, or ask again when AI is back for a full walkthrough of methods and benchmarks.`
      : `Voor **${companyName}** komt de indicatieve waarde uit ValuationIQ (multiples, DCF waar verdedigbaar, synthese). **${accepted}** normalisatie(s) toegepast${pending > 0 ? `, **${pending}** wacht op review` : ''}.\n\nOpen het rapport voor de waarderingsrange, of stel de vraag opnieuw wanneer AI weer beschikbaar is voor een volledige toelichting.`

  return {
    success: true,
    content: offlineBanner(locale) + body,
    fallback: true,
  }
}

function buildSuggestNormsFallback(locale: 'en' | 'nl'): AIChatResponse {
  const content =
    locale === 'en'
      ? offlineBanner('en') +
        'Relevant normalizations:\n\n1. **Owner salary** - Market rate\n2. **Rent costs** - Market value\n3. **Vehicle costs** - Private use\n4. **One-time costs** - Legal etc.\n\n**Quick commands:**\n- *"Normalize owner salary to €60k"*\n- *"Set rent costs to €24k"*'
      : offlineBanner('nl') +
        'Relevante normalisaties:\n\n1. **Eigenaarssalaris** - Marktconform niveau\n2. **Huurkosten** - Marktwaarde\n3. **Autokosten** - Privégebruik\n4. **Eenmalige kosten** - Juridisch etc.\n\n**Snelle commando\'s:**\n- *"Normaliseer eigenaarssalaris naar €60k"*\n- *"Zet huurkosten op €24k"*'

  return { success: true, content, fallback: true }
}

function buildGeneralFallback(request: AIChatRequest, locale: 'en' | 'nl'): AIChatResponse {
  const summary = readSummary(request.formData)
  const accepted = summary?.accepted ?? 0
  if (accepted > 0) {
    return buildExplainEbitdaFallback(request, locale)
  }

  const companyName = request.companyName || (locale === 'en' ? 'this company' : 'dit bedrijf')
  return {
    success: true,
    content:
      locale === 'en'
        ? offlineBanner('en') +
          `Thanks for your question about ${companyName}. AI is temporarily unavailable — try again shortly, or use the normalization panel for EBITDA adjustments.`
        : offlineBanner('nl') +
          `Bedankt voor uw vraag over ${companyName}. AI is tijdelijk niet beschikbaar — probeer het zo dadelijk opnieuw, of gebruik het normalisatiepaneel voor EBITDA-correcties.`,
    fallback: true,
  }
}

export function generateContextAwareLocalResponse(request: AIChatRequest): AIChatResponse {
  const locale = request.locale === 'en' ? 'en' : 'nl'
  const content = request.message.toLowerCase()
  const intent = resolveAssistantIntent(request.message, request.assistantIntent)

  const calcImpact = (ebitdaDelta: number, m = 5.2) => ({
    ebitdaDelta,
    valuationDelta: Math.round(ebitdaDelta * m),
    multiple: m,
  })

  if (
    content.includes('eigenaarssalaris') ||
    content.includes('salaris') ||
    (content.includes('owner') && content.includes('salary'))
  ) {
    return {
      success: true,
      content:
        locale === 'en'
          ? offlineBanner('en') +
            'Based on sector data, a market-rate owner salary is between €100,000 and €140,000.\n\nI suggest €120,000 as the normalization basis.'
          : offlineBanner('nl') +
            'Op basis van sectordata is een marktconform eigenaarssalaris tussen €100.000 en €140.000.\n\nIk stel €120.000 als normalisatiebasis voor.',
      fieldUpdates: [
        {
          field: 'ownerSalary',
          value: 120000,
          label: locale === 'en' ? 'Owner salary' : 'Eigenaarssalaris',
          grootboekCode: '620',
          source: 'ai',
          confidence: 'high',
          impact: calcImpact(60000),
        },
      ],
      fallback: true,
    }
  }

  if (content.includes('huur') || content.includes('kantoor') || content.includes('rent')) {
    return {
      success: true,
      content:
        locale === 'en'
          ? offlineBanner('en') +
            'Average office rent in Belgium: €80-150/m² per year.\nIndustrial space: €40-80/m² per year.'
          : offlineBanner('nl') +
            'Gemiddelde kantoorhuur in België: €80-150/m² per jaar.\nIndustriële ruimte: €40-80/m² per jaar.',
      fieldUpdates: [
        {
          field: 'rent',
          value: 48000,
          label: locale === 'en' ? 'Rent costs' : 'Huurkosten',
          grootboekCode: '610',
          source: 'ai',
          confidence: 'medium',
          impact: calcImpact(24000),
        },
      ],
      fallback: true,
    }
  }

  switch (intent) {
    case 'explain_ebitda':
      return buildExplainEbitdaFallback(request, locale)
    case 'explain_value':
      return buildExplainValueFallback(request, locale)
    case 'suggest_normalizations': {
      const accepted = readNormalizations(request).filter((n) => n.status === 'accepted')
      if (accepted.length > 0) {
        return buildExplainEbitdaFallback(request, locale)
      }
      return buildSuggestNormsFallback(locale)
    }
    default:
      if (content.includes('normalis') || content.includes('normalize')) {
        const accepted = readNormalizations(request).filter((n) => n.status === 'accepted')
        if (accepted.length > 0) {
          return buildExplainEbitdaFallback(request, locale)
        }
        return buildSuggestNormsFallback(locale)
      }
      return buildGeneralFallback(request, locale)
  }
}
