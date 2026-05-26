import type { AgentChoiceSelection } from '@/components/calculator'
import {
  equalWeightsFor,
  resolveSynthesisPercentWeightsForMethods,
  sanitizeMethodSelection,
} from '@/constants/methodFieldConfig'
import {
  projectSuggestedMultiple,
  SCENARIO_PRESETS,
  type ScenarioPreset,
} from '@/store/manual/preparerCalibrationSuggestions'
import type { PreparerEbitdaReasonKey } from '@/store/manual/usePreparerMultipleStore'
import { canonicalAgentMethodSelection } from './manualAiValuationMethods'

export const METHOD_WEIGHT_CHOICE_PATH = '/api/valuations/method-weights'
export const VALUATION_SCENARIO_CHOICE_PATH = '/api/valuations/scenario'

const EQUAL_WEIGHT_VALUES = new Set([
  'equal',
  'equal_weight',
  'equal_weights',
  'even',
  'balanced',
  'default',
])

interface AgentMethodWeightChoice {
  methods: string[]
  weights: Record<string, number>
  justification?: string
}

interface AgentValuationScenarioChoice {
  appliedMedian: number | null
  reasonKey: PreparerEbitdaReasonKey | ''
}

const SCENARIO_ALIASES: Record<string, ScenarioPreset['id'] | 'base'> = {
  base: 'base',
  baseline: 'base',
  benchmark: 'base',
  neutral: 'base',
  reset: 'base',
  distressed: 'distressed',
  distress: 'distressed',
  distressed_sale: 'distressed',
  forced_sale: 'distressed',
  strategic: 'strategic_buyer',
  strategic_buyer: 'strategic_buyer',
  strategic_buyer_premium: 'strategic_buyer',
  recurring: 'recurring_premium',
  recurring_premium: 'recurring_premium',
  recurring_revenue: 'recurring_premium',
  recurring_revenue_premium: 'recurring_premium',
  customer_concentration: 'customer_concentration',
  concentration: 'customer_concentration',
  key_customer: 'customer_concentration',
}

function selectedChoiceValues(choice: AgentChoiceSelection): string[] {
  if (choice.kind === 'multi_select') return choice.values ?? []
  return choice.value ? [choice.value] : []
}

function normalizeChoiceValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function toPercent(value: unknown): number | null {
  if (value == null || value === '') return null
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseFloat(value.replace('%', '').trim())
        : Number.NaN
  if (!Number.isFinite(numeric)) return null
  const percent = numeric > 0 && numeric <= 1 ? numeric * 100 : numeric
  return Math.min(100, Math.max(0, Math.round(percent)))
}

function addWeight(weights: Record<string, number>, rawMethod: unknown, rawWeight: unknown): void {
  const method = canonicalAgentMethodSelection([rawMethod])[0]
  const percent = toPercent(rawWeight)
  if (!method || percent == null) return
  weights[method] = percent
}

function parseWeightRecord(record: Record<string, unknown>): {
  weights: Record<string, number>
  justification?: string
} {
  const source =
    record.weights && typeof record.weights === 'object' && !Array.isArray(record.weights)
      ? (record.weights as Record<string, unknown>)
      : record.user_weights &&
          typeof record.user_weights === 'object' &&
          !Array.isArray(record.user_weights)
        ? (record.user_weights as Record<string, unknown>)
        : record.userWeights &&
            typeof record.userWeights === 'object' &&
            !Array.isArray(record.userWeights)
          ? (record.userWeights as Record<string, unknown>)
          : record
  const weights: Record<string, number> = {}
  for (const [method, weight] of Object.entries(source)) {
    addWeight(weights, method, weight)
  }
  const justification =
    typeof record.justification === 'string' && record.justification.trim()
      ? record.justification.trim()
      : undefined
  return justification ? { weights, justification } : { weights }
}

function parseWeightArray(value: unknown[]): Record<string, number> {
  const weights: Record<string, number> = {}
  for (const row of value) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const record = row as Record<string, unknown>
    addWeight(
      weights,
      record.method ?? record.method_key ?? record.methodKey ?? record.value,
      record.weight ?? record.percent ?? record.percentage
    )
  }
  return weights
}

function parseJsonWeightValue(value: string): {
  weights: Record<string, number>
  justification?: string
} | null {
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (Array.isArray(parsed)) {
    return { weights: parseWeightArray(parsed) }
  }
  if (parsed && typeof parsed === 'object') {
    return parseWeightRecord(parsed as Record<string, unknown>)
  }
  return null
}

function parseDelimitedWeightValue(value: string): Record<string, number> {
  const weights: Record<string, number> = {}
  for (const segment of value.split(/[;,|]/)) {
    const trimmed = segment.trim()
    if (!trimmed) continue
    const match = trimmed.match(/^(.+?)(?:\s*[=:]\s*|\s+)(\d+(?:\.\d+)?%?)$/)
    if (!match) continue
    addWeight(weights, match[1], match[2])
  }
  return weights
}

function buildWeightChoice(
  rawWeights: Record<string, number>,
  justification?: string
): AgentMethodWeightChoice | null {
  const methods = sanitizeMethodSelection(canonicalAgentMethodSelection(Object.keys(rawWeights)))
  if (methods.length < 2 || methods.includes('upswitch_adaptive')) return null
  const weights: Record<string, number> = {}
  for (const method of methods) {
    const weight = rawWeights[method]
    if (typeof weight !== 'number' || !Number.isFinite(weight)) return null
    weights[method] = weight
  }
  const sum = Object.values(weights).reduce((total, weight) => total + weight, 0)
  if (Math.abs(sum - 100) > 2) return null
  const normalized = resolveSynthesisPercentWeightsForMethods(methods, weights)
  if (!normalized) return null
  return justification
    ? { methods, weights: normalized, justification }
    : { methods, weights: normalized }
}

export function parseAgentMethodWeightChoice(
  choice: AgentChoiceSelection,
  currentMethods: readonly string[]
): AgentMethodWeightChoice | null {
  const values = selectedChoiceValues(choice)
  if (values.length === 0) return null

  if (values.some((value) => EQUAL_WEIGHT_VALUES.has(normalizeChoiceValue(value)))) {
    const methods = sanitizeMethodSelection(canonicalAgentMethodSelection([...currentMethods]))
    if (methods.length < 2 || methods.includes('upswitch_adaptive')) return null
    return { methods, weights: equalWeightsFor(methods) }
  }

  const selectedMethods = sanitizeMethodSelection(canonicalAgentMethodSelection(values))
  if (selectedMethods.length >= 2 && !selectedMethods.includes('upswitch_adaptive')) {
    return { methods: selectedMethods, weights: equalWeightsFor(selectedMethods) }
  }

  const weights: Record<string, number> = {}
  let justification: string | undefined
  for (const value of values) {
    const parsedJson = parseJsonWeightValue(value)
    if (parsedJson) {
      Object.assign(weights, parsedJson.weights)
      justification = justification ?? parsedJson.justification
      continue
    }
    Object.assign(weights, parseDelimitedWeightValue(value))
  }

  return buildWeightChoice(weights, justification)
}

export function parseAgentValuationScenarioChoice(
  choice: AgentChoiceSelection,
  benchmarkMedian: number | null | undefined
): AgentValuationScenarioChoice | null {
  const selected = selectedChoiceValues(choice)[0]
  if (!selected) return null
  const scenarioId = SCENARIO_ALIASES[normalizeChoiceValue(selected)]
  if (!scenarioId) return null

  if (scenarioId === 'base') {
    return {
      appliedMedian:
        typeof benchmarkMedian === 'number' && Number.isFinite(benchmarkMedian)
          ? benchmarkMedian
          : null,
      reasonKey: '',
    }
  }

  if (
    typeof benchmarkMedian !== 'number' ||
    !Number.isFinite(benchmarkMedian) ||
    benchmarkMedian <= 0
  ) {
    return null
  }
  const preset = SCENARIO_PRESETS.find((candidate) => candidate.id === scenarioId)
  if (!preset) return null
  return {
    appliedMedian: projectSuggestedMultiple(benchmarkMedian, preset.band),
    reasonKey: preset.reasonKey,
  }
}

export function buildAgentChoiceFollowUpPrompt(
  choice: AgentChoiceSelection,
  currentLocale: string
): string {
  const selectedValues = selectedChoiceValues(choice)
  const labels = choice.selectedOptions
    .map((option) => option.label.trim())
    .filter(Boolean)
    .join(', ')
  const title = choice.title?.trim()
  return currentLocale === 'nl'
    ? `Voor "${title || 'de keuze'}" kies ik: ${labels || selectedValues.join(', ')}. Ga verder met deze keuze.`
    : `For "${title || 'the choice'}", I choose: ${labels || selectedValues.join(', ')}. Continue with this selection.`
}
